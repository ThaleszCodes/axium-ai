import { GoogleGenAI, Modality, Type } from '@google/genai';
import { CODER_SYSTEM_INSTRUCTION } from '../constants';
import { VoiceName, GroundingSource } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to validate API Key
const checkApiKey = () => {
  if (!apiKey) throw new Error("Chave de API não encontrada. Verifique suas variáveis de ambiente.");
};

// --- Helper: Format API Errors ---
const formatError = (e: any): Error => {
    let msg = e.message || JSON.stringify(e);
    
    // Detect 429 Quota Error explicitly
    if (msg.includes('429') || (e.status === 429) || (e.error?.code === 429)) {
        return new Error("⚠️ Cota Gratuita Excedida (Erro 429). O plano gratuito do Gemini atingiu o limite.");
    }

    if (msg.includes('SAFETY')) return new Error("Conteúdo bloqueado pelos filtros de segurança da IA.");
    
    return new Error(msg);
};

// --- Helper: Clean JSON Markdown ---
const cleanJson = (text: string): string => {
  if (!text) return "{}";
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
};

// --- Helper: URL to Base64 (For Pollinations) ---
const imageUrlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Audio Helper: Convert Raw PCM to WAV ---
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const pcmToWav = (base64: string, sampleRate: number = 24000) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(44 + len);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, len, true);

  const dataView = new Uint8Array(buffer, 44);
  for (let i = 0; i < len; i++) {
    dataView[i] = binaryString.charCodeAt(i);
  }

  let binary = '';
  const bytes = new Uint8Array(buffer);
  const lenBytes = bytes.byteLength;
  for (let i = 0; i < lenBytes; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
};

// --- Generators ---

export const generateTextChat = async (history: {role: string, parts: {text: string}[]}[], message: string): Promise<{ text: string; sources?: GroundingSource[] }> => {
  checkApiKey();
  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    history: history,
    config: {
      systemInstruction: 'Você é a Axium AI, uma assistente de IA sofisticada. Responda sempre em Português do Brasil.',
      tools: [{ googleSearch: {} }]
    }
  });
  
  try {
      const response = await chat.sendMessage({ message });
      
      let sources: GroundingSource[] = [];
      if (response.candidates && response.candidates[0].groundingMetadata?.groundingChunks) {
          sources = response.candidates[0].groundingMetadata.groundingChunks
            .map((chunk: any) => chunk.web)
            .filter((web: any) => web)
            .map((web: any) => ({
                title: web.title || "Fonte da Web",
                uri: web.uri
            }));
      }

      return { 
          text: response.text || "Sem resposta.", 
          sources 
      };
  } catch (e: any) {
      throw formatError(e);
  }
};

export const generateChatTitle = async (message: string): Promise<string> => {
    checkApiKey();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Gere um título de 3 palavras para: "${message}"`,
        });
        return response.text?.trim() || "Novo Chat";
    } catch {
        return "Novo Chat";
    }
}

// HYBRID STRATEGY: Use Pollinations.ai for free, unlimited images
export const generateImage = async (prompt: string): Promise<string> => {
  // Pollinations does not need an API key
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    // Add random seed to ensure uniqueness for same prompts
    const randomSeed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${randomSeed}&nologo=true&model=flux`;
    
    // Fetch and convert to base64 so we can save consistency in the database
    const base64Image = await imageUrlToBase64(url);
    return base64Image;

  } catch (e: any) {
    console.error("Image Gen Error:", e);
    throw new Error("Falha ao gerar imagem com o provedor híbrido.");
  }
};

export const generateAudio = async (text: string, voice: VoiceName): Promise<string> => {
  checkApiKey();
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
            },
        },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Nenhum áudio gerado.");
    
    return pcmToWav(base64Audio, 24000);
  } catch (e: any) {
      throw formatError(e);
  }
};

export const generateCode = async (prompt: string, currentCode?: {html: string, css: string, js: string}) => {
  checkApiKey();
  
  let fullPrompt = prompt;
  if (currentCode) {
    fullPrompt = `HTML Atual: ${currentCode.html}\nCSS Atual: ${currentCode.css}\nJS Atual: ${currentCode.js}\n\nSolicitação: ${prompt}`;
  }

  // HYBRID STRATEGY: Use Flash exclusively for stability and quota management
  const generateWithModel = async (modelName: string) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: fullPrompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: CODER_SYSTEM_INSTRUCTION,
          responseSchema: {
              type: Type.OBJECT,
              properties: {
                  html: { type: Type.STRING },
                  css: { type: Type.STRING },
                  js: { type: Type.STRING }
              },
              required: ["html", "css", "js"]
          }
        }
      });
      return response;
  };

  try {
    // Using flash ensures speed and higher free tier limits
    const response = await generateWithModel('gemini-2.5-flash');
    const cleanedText = cleanJson(response.text || '{}');
    return JSON.parse(cleanedText);

  } catch (e: any) {
    console.error("Coder Final Error:", e);
    throw formatError(e);
  }
};

export const generateStructuredData = async (prompt: string, systemInstruction: string, schema?: any) => {
    checkApiKey();
    const config: any = {
        systemInstruction: systemInstruction + " Responda em Português do Brasil.",
        responseMimeType: "application/json"
    };
    if (schema) config.responseSchema = schema;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config
        });
        
        const cleanedText = cleanJson(response.text || '{}');
        return JSON.parse(cleanedText);
    } catch (e) {
        throw formatError(e);
    }
};

export const generateText = async (prompt: string, instruction: string = "") => {
    checkApiKey();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { systemInstruction: instruction }
        });
        return response.text;
    } catch (e) {
        throw formatError(e);
    }
}

export const generateSocialPost = async (topic: string) => {
    checkApiKey();
    const schema = {
        type: Type.OBJECT,
        properties: {
            caption: { type: Type.STRING },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            imagePrompt: { type: Type.STRING },
            artDirection: { type: Type.STRING }
        },
        required: ["caption", "hashtags", "imagePrompt", "artDirection"]
    };

    const prompt = `Post social sobre: "${topic}". JSON com caption, hashtags, imagePrompt (ingles) e artDirection.`;
    return generateStructuredData(prompt, "Especialista em Social Media.", schema);
}
