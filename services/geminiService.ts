import { GoogleGenAI, Modality, Type } from '@google/genai';
import { CODER_SYSTEM_INSTRUCTION } from '../constants';
import { VoiceName, GroundingSource } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to validate API Key
const checkApiKey = () => {
  if (!apiKey) throw new Error("Chave de API não encontrada nas variáveis de ambiente.");
};

// --- Helper: Clean JSON Markdown ---
// Removes ```json and ``` wrapping to prevent JSON.parse errors
const cleanJson = (text: string): string => {
  if (!text) return "{}";
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
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

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + len, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count (1)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, len, true);

  // write the PCM samples
  const dataView = new Uint8Array(buffer, 44);
  for (let i = 0; i < len; i++) {
    dataView[i] = binaryString.charCodeAt(i);
  }

  // Convert back to base64 to use in data URI
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const lenBytes = bytes.byteLength;
  for (let i = 0; i < lenBytes; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
};

export const generateTextChat = async (history: {role: string, parts: {text: string}[]}[], message: string): Promise<{ text: string; sources?: GroundingSource[] }> => {
  checkApiKey();
  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    history: history,
    config: {
      systemInstruction: 'Você é a Axium AI, uma assistente de IA sofisticada, prestativa e minimalista. Responda sempre em Português do Brasil de forma clara e profissional. Se você usar a Pesquisa Google, certifique-se de usar informações recentes.',
      tools: [{ googleSearch: {} }] // Enable Google Search
    }
  });
  
  const response = await chat.sendMessage({ message });
  
  // Extract web sources from grounding metadata
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
};

export const generateChatTitle = async (message: string): Promise<string> => {
    checkApiKey();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Gere um título muito curto (máximo 4 palavras) que resuma esta mensagem: "${message}". Responda apenas com o título.`,
    });
    return response.text?.trim() || "Novo Chat";
}

export const generateImage = async (prompt: string): Promise<string> => {
  checkApiKey();
  // Using gemini-2.5-flash-image for standard generation
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
       // Using 1:1 aspect ratio by default
      imageConfig: { aspectRatio: "1:1" }
    }
  });

  // Extract base64 image
  let imageUrl = '';
  if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
              imageUrl = `data:image/png;base64,${part.inlineData.data}`;
              break;
          }
      }
  }
  
  if (!imageUrl) throw new Error("Nenhuma imagem gerada. Tente um prompt diferente.");
  return imageUrl;
};

export const generateAudio = async (text: string, voice: VoiceName): Promise<string> => {
  checkApiKey();
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
  
  // Convert Raw PCM to WAV (24kHz is standard for this model)
  return pcmToWav(base64Audio, 24000);
};

export const generateCode = async (prompt: string, currentCode?: {html: string, css: string, js: string}) => {
  checkApiKey();
  
  let fullPrompt = prompt;
  if (currentCode) {
    fullPrompt = `HTML Atual: ${currentCode.html}\nCSS Atual: ${currentCode.css}\nJS Atual: ${currentCode.js}\n\nSolicitação: ${prompt}`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', // Stronger model for code
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

  try {
    const rawText = response.text || '{}';
    const cleanedText = cleanJson(rawText);
    return JSON.parse(cleanedText);
  } catch (e) {
    console.error("Falha ao analisar JSON do código", response.text);
    throw new Error("A IA produziu um formato de código inválido.");
  }
};

// Generic JSON generators (Structure, Prompt Gen, etc.)
export const generateStructuredData = async (prompt: string, systemInstruction: string, schema?: any) => {
    checkApiKey();
    const config: any = {
        systemInstruction: systemInstruction + " Responda em Português do Brasil.",
        responseMimeType: "application/json"
    };
    
    if (schema) {
        config.responseSchema = schema;
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config
    });
    
    try {
        const rawText = response.text || '{}';
        const cleanedText = cleanJson(rawText);
        return JSON.parse(cleanedText);
    } catch (e) {
        throw new Error("Falha ao analisar dados estruturados.");
    }
};

export const generateText = async (prompt: string, instruction: string = "") => {
    checkApiKey();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction: instruction + " Responda em Português do Brasil." }
    });
    return response.text;
}

export const generateSocialPost = async (topic: string) => {
    checkApiKey();
    const schema = {
        type: Type.OBJECT,
        properties: {
            caption: { type: Type.STRING, description: "A legenda do post com emojis e formatação." },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lista de hashtags relevantes." },
            imagePrompt: { type: Type.STRING, description: "Um prompt detalhado em INGLÊS para gerar uma imagem de alta qualidade que combine com o post." },
            artDirection: { type: Type.STRING, description: "Explicação breve da direção de arte em português." }
        },
        required: ["caption", "hashtags", "imagePrompt", "artDirection"]
    };

    const prompt = `Atue como um estrategista de mídia social e diretor de arte premiado.
    Crie um post completo para redes sociais (Instagram/LinkedIn) sobre: "${topic}".
    1. Crie uma legenda envolvente, persuasiva e formatada.
    2. Selecione hashtags estratégicas.
    3. Crie um PROMPT DE IMAGEM detalhado e artístico (Photorealistic, 3D Render, Minimalist, etc) para a IA gerar a arte visual deste post.
    Responda estritamente no formato JSON.`;

    return generateStructuredData(prompt, "Você é um especialista em Social Media e Design Gráfico.", schema);
}
