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
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) throw error;
    
    if (data.session) return data.session;

    // Force login fallback
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (signInError) throw signInError;
    return signInData.session;
};

export const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin, // Redireciona para a home após clicar no email
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

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
             const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .insert([{ id: user.id, email: user.email, plan: 'free', credits: 10 }])
                .select()
                .single();
             if (!createError) return newProfile as UserProfile;
        }
        return null;
    }

    return data as UserProfile;
};

export const consumeCredit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuário não logado");

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
