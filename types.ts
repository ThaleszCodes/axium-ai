export enum ToolType {
  Chat = 'Chat',
  ImageGen = 'ImageGen',
  AudioGen = 'AudioGen',
  Coder = 'Coder',
  DesignGen = 'DesignGen',
  PromptGen = 'PromptGen',
  TextImprover = 'TextImprover',
  VideoStructure = 'VideoStructure',
  Hashtags = 'Hashtags',
  VideoIdeas = 'VideoIdeas',
  CopyGen = 'CopyGen',
  SocialPostGen = 'SocialPostGen'
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  sources?: GroundingSource[];
}

// Database Structure for Chats
export interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  messages: Message[]; // Stored as JSONB
  created_at: string;
}

// Database Structure for Images
export interface GeneratedImage {
  id: string;
  url: string; // Storing base64 for now, or bucket URL
  prompt: string;
  timestamp: number;
}

// Database Structure for Sites
export interface SavedSite {
  id?: string;
  html: string;
  css: string;
  js: string;
  title: string;
  created_at?: number; // timestamp
}

export interface ConsoleLog {
  type: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: number;
}

export interface CoderState {
  html: string;
  css: string;
  js: string;
  history: SavedSite[]; // From DB
  chatHistory: Message[]; // Current session chat
  logs: ConsoleLog[]; // Captura de console do iframe
}

export interface VideoIdea {
  title: string;
  script: string;
}

export interface VideoStructureData {
  title: string;
  description: string;
  tags: string[];
  cta: string;
}

export interface DesignComponent {
  name: string;
  structure: any;
}

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface UserSession {
  user: {
    id: string;
    email?: string;
  } | null;
  access_token: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  plan: 'free' | 'pro';
  credits: number;
}