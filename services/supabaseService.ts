import { createClient } from '@supabase/supabase-js';
import { ChatSession, Message, GeneratedImage, SavedSite, UserProfile } from '../types';

const SUPABASE_URL = 'https://kdhiqfbpheehjphzcnkf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGlxZmJwaGVlaGpwaHpjbmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODgzNzQsImV4cCI6MjA4MDI2NDM3NH0.3UzFXON7e28lgGqvDQu9qK0hPyfh-ndgu1XkMe_kTis';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Auth (Real SaaS Mode) ---

export const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    
    if (error) throw error;
    return data.session;
};

export const signUp = async (email: string, password: string) => {
    // 1. Tenta criar o usuário
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) throw error;
    
    // 2. Se a sessão já veio (ideal), retorna ela.
    if (data.session) {
        return data.session;
    }

    // 3. FALLBACK: Se "Confirm Email" estiver desligado, o usuário foi criado mas o signUp 
    // às vezes não faz o login automático. Vamos forçar o login agora.
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (signInError) {
        // Se falhar aqui, é porque realmente algo bloqueou (ex: email já existe ou erro de rede)
        throw signInError;
    }

    return signInData.session;
};

export const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
    });
    if (error) throw error;
};

export const signOut = async () => {
    await supabase.auth.signOut();
};

export const getSession = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session;
};

// --- Profile & Credits ---

export const getUserProfile = async (): Promise<UserProfile | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Tenta buscar o perfil
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error) {
        // Se não existir (edge case), cria um perfil padrão free com 10 créditos
        // Isso é redundante se o Trigger SQL estiver funcionando, mas é uma segurança extra.
        if (error.code === 'PGRST116') {
             const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert([{ id: user.id, email: user.email, plan: 'free', credits: 10 }])
                .select()
                .single();
             if (!createError) return newProfile as UserProfile;
        }
        console.error("Erro ao buscar perfil:", error);
        return null;
    }

    return data as UserProfile;
};

export const consumeCredit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não logado");

    // Chama a função SQL segura (RPC) para descontar crédito
    const { error } = await supabase.rpc('consume_credit', { user_uuid: user.id });
    
    if (error) throw error;
};

// --- Chats ---
export const getChats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data as ChatSession[];
};

export const createChat = async (title: string = "Novo Chat") => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não autenticado.");

    const { data, error } = await supabase
        .from('chats')
        .insert([{ user_id: user.id, title, messages: [] }])
        .select()
        .single();
    
    if (error) throw error;
    return data as ChatSession;
};

export const updateChat = async (chatId: string, messages: Message[], title?: string) => {
    const updates: any = { messages };
    if (title) updates.title = title;

    const { error } = await supabase
        .from('chats')
        .update(updates)
        .eq('id', chatId);
    
    if (error) throw error;
};

export const deleteChat = async (chatId: string) => {
    const { error } = await supabase.from('chats').delete().eq('id', chatId);
    if (error) throw error;
}

// --- Images ---
export const getImages = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data.map((img: any) => ({
        id: img.id,
        url: img.url,
        prompt: img.prompt,
        timestamp: new Date(img.created_at).getTime()
    })) as GeneratedImage[];
};

export const saveImage = async (url: string, prompt: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
        .from('images')
        .insert([{ user_id: user.id, url, prompt }]);
    
    if (error) throw error;
};

// --- Sites (Coder) ---
export const getSites = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data as SavedSite[];
};

export const saveSite = async (html: string, css: string, js: string, title: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
        .from('sites')
        .insert([{ user_id: user.id, html, css, js, title }]);

    if (error) throw error;
};
