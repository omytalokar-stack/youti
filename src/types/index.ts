export type TabId = 'analytics' | 'gemini' | 'brain' | 'settings';

export interface ConnectedChannel {
  channelId: string;
  title: string;
  description?: string;
  totalViews: number;
  totalSubscribers: number | null;
  totalVideos: number;
}

export interface VideoMetric {
  videoId: string;
  title: string;
  thumbnail: string;
  uploadDate: string | null;
  views: number;
  likes?: number;
  subscribersGained: number;
  subscribersLost: number;
  watchTimeHours: number;
}

export interface ProvenTactic {
  id: string;
  title: string;
  impact: string;
  description: string;
  createdAt: string;
}

export interface MistakeLog {
  id: string;
  videoId: string;
  issue: string;
  retentionDropAt: string;
  ruleUpdated: string;
  resolvedAt: string | null;
}

export interface GeneratedShort {
  hook: string;
  script: string;
  title: string;
  description: string;
  tags: string[];
  subtitleBeats: Array<{
    start: number;
    end: number;
    text: string;
    highlightedWord: string;
  }>;
}

export interface PublishedShort {
  channelId: string;
  videoId: string;
  title: string;
  url: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  durationSeconds: number;
  uploadedAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'gemini';
  text: string;
  timestamp: string;
  modelUsed?: 'Gemini 3.8 Flash' | 'Gemini 3.1 Flash-Lite';
  liked?: boolean;
  disliked?: boolean;
}

export interface AppSettings {
  selectedChannelId: string;
  selfCorrectionMode: boolean;
}
