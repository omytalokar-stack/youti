import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppSettings,
  ChatMessage,
  ConnectedChannel,
  MistakeLog,
  PublishedShort,
  ProvenTactic,
  TabId,
  VideoMetric,
} from '../types';
import { apiRequest } from '../services/api';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  action?: { label: string; href: string };
}

interface BrainMemoryResponse {
  selfCorrectionMode: boolean;
  lastAutonomousRun: string | null;
  provenTactics: Array<Omit<ProvenTactic, 'id'> & { _id: string }>;
  mistakeLogs: Array<Omit<MistakeLog, 'id'> & { _id: string }>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface AppContextType {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  canInstallApp: boolean;
  isAppInstalled: boolean;
  installApp: () => Promise<void>;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  saveSettingsToStorage: () => void;
  resetDefaultSettings: () => void;
  channels: ConnectedChannel[];
  channel: ConnectedChannel | null;
  videos: VideoMetric[];
  isLoadingChannels: boolean;
  isLoadingStats: boolean;
  channelError: string | null;
  refreshChannels: () => Promise<void>;
  refreshStats: () => Promise<void>;
  connectYouTube: () => Promise<void>;
  disconnectChannel: () => Promise<void>;
  chatMessages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  toggleLikeMessage: (id: string) => void;
  toggleDislikeMessage: (id: string) => void;
  clearChat: () => void;
  isAiGenerating: boolean;
  provenTactics: ProvenTactic[];
  mistakeLogs: MistakeLog[];
  isPipelineRunning: boolean;
  publishedShort: PublishedShort | null;
  lastAutonomousRun: string | null;
  publishShort: () => Promise<void>;
  addProvenTactic: (tactic: Omit<ProvenTactic, 'id' | 'createdAt'>) => Promise<void>;
  addMistakeLog: (log: Omit<MistakeLog, 'id' | 'resolvedAt'>) => Promise<void>;
  toggleAutonomousMode: () => Promise<void>;
  toasts: ToastMessage[];
  addToast: (title: string, message: string, type?: ToastMessage['type'], action?: ToastMessage['action']) => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const STORAGE_KEY = 'dimag_live_settings_v2';
const EMPTY_SETTINGS: AppSettings = { selectedChannelId: '', selfCorrectionMode: true };

function readSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        selectedChannelId: typeof parsed.selectedChannelId === 'string' ? parsed.selectedChannelId : '',
        selfCorrectionMode: typeof parsed.selfCorrectionMode === 'boolean'
          ? parsed.selfCorrectionMode
          : true,
      };
    }
  } catch {
    // Keep defaults if browser storage is unavailable or malformed.
  }
  try {
    localStorage.removeItem('dimag_yt_automation_settings_v1');
  } catch {
    // The old key is optional cleanup.
  }
  return EMPTY_SETTINGS;
}

function mapMemory(memory: BrainMemoryResponse) {
  return {
    tactics: (memory.provenTactics ?? []).map(({ _id, ...tactic }) => ({ ...tactic, id: _id })),
    mistakes: (memory.mistakeLogs ?? []).map(({ _id, ...mistake }) => ({ ...mistake, id: _id })),
    selfCorrectionMode: memory.selfCorrectionMode,
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<TabId>('analytics');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [settings, setSettings] = useState<AppSettings>(readSettings);
  const [channels, setChannels] = useState<ConnectedChannel[]>([]);
  const [videos, setVideos] = useState<VideoMetric[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [provenTactics, setProvenTactics] = useState<ProvenTactic[]>([]);
  const [mistakeLogs, setMistakeLogs] = useState<MistakeLog[]>([]);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [publishedShort, setPublishedShort] = useState<PublishedShort | null>(null);
  const [lastAutonomousRun, setLastAutonomousRun] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const statsRequestId = useRef(0);

  const addToast = useCallback((
    title: string,
    message: string,
    type: ToastMessage['type'] = 'info',
    action?: ToastMessage['action'],
  ) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, title, message, type, action }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);

  const installApp = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') {
      addToast('Installation started', 'Dimag AI is being added to your device.', 'success');
    }
  }, [addToast, installPrompt]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const updateInstalledState = () => {
      setIsAppInstalled(mediaQuery.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    };
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsAppInstalled(true);
      addToast('Dimag AI installed', 'You can now open the app from your home screen.', 'success');
    };

    updateInstalledState();
    mediaQuery.addEventListener('change', updateInstalledState);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      mediaQuery.removeEventListener('change', updateInstalledState);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [addToast]);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...newSettings }));
  }, []);

  const saveSettingsToStorage = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    addToast('Settings saved', 'Selected channel and memory preferences saved in this browser.', 'success');
  }, [addToast, settings]);

  const resetDefaultSettings = useCallback(() => {
    setSettings(EMPTY_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
    addToast('Preferences reset', 'Only local channel selection and memory preferences were cleared.', 'info');
  }, [addToast]);

  const refreshChannels = useCallback(async (preferredChannelId?: string) => {
    setIsLoadingChannels(true);
    setChannelError(null);
    try {
      const loaded = await apiRequest<ConnectedChannel[]>('/youtube/channels');
      setChannels(loaded);
      setSettings((current) => {
        const selected = preferredChannelId && loaded.some(({ channelId }) => channelId === preferredChannelId)
          ? preferredChannelId
          : loaded.some(({ channelId }) => channelId === current.selectedChannelId)
            ? current.selectedChannelId
            : loaded[0]?.channelId ?? '';
        return { ...current, selectedChannelId: selected };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load connected YouTube channels.';
      setChannelError(message);
      addToast('Channel connection error', message, 'error');
    } finally {
      setIsLoadingChannels(false);
    }
  }, [addToast]);

  const refreshStats = useCallback(async () => {
    const requestId = ++statsRequestId.current;
    const channelId = settings.selectedChannelId;
    if (!channelId) {
      setVideos([]);
      setProvenTactics([]);
      setMistakeLogs([]);
      setIsLoadingStats(false);
      return;
    }
    setIsLoadingStats(true);
    setChannelError(null);
    try {
      const [stats, memory] = await Promise.all([
        apiRequest<{ videos: VideoMetric[] }>(`/youtube/stats/${encodeURIComponent(channelId)}`),
        apiRequest<BrainMemoryResponse>(`/brain/${encodeURIComponent(channelId)}`),
      ]);
      if (requestId !== statsRequestId.current) return;
      setVideos(stats.videos);
      const mapped = mapMemory(memory);
      setProvenTactics(mapped.tactics);
      setMistakeLogs(mapped.mistakes);
      setLastAutonomousRun(memory.lastAutonomousRun);
      setSettings((current) => ({ ...current, selfCorrectionMode: mapped.selfCorrectionMode }));
    } catch (error) {
      if (requestId !== statsRequestId.current) return;
      const message = error instanceof Error ? error.message : 'Unable to load YouTube analytics.';
      setVideos([]);
      setChannelError(message);
      addToast('Channel data error', message, 'error');
    } finally {
      if (requestId === statsRequestId.current) setIsLoadingStats(false);
    }
  }, [addToast, settings.selectedChannelId]);

  const connectYouTube = useCallback(async () => {
    const { url } = await apiRequest<{ url: string }>('/youtube/auth-url');
    window.location.assign(url);
  }, []);

  const disconnectChannel = useCallback(async () => {
    const channelId = settings.selectedChannelId;
    if (!channelId) return;
    await apiRequest(`/youtube/channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' });
    addToast('Channel disconnected', 'Saved OAuth token removed from this backend.', 'success');
    await refreshChannels();
  }, [addToast, refreshChannels, settings.selectedChannelId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isConnected = params.get('youtubeConnected') === '1';
    const preferredChannelId = params.get('channelId') ?? undefined;
    const oauthError = params.get('youtubeError');
    if (isConnected || oauthError) {
      window.history.replaceState({}, '', window.location.pathname);
      if (isConnected) addToast('YouTube connected', 'Your real YouTube channel is ready to sync.', 'success');
      if (oauthError) addToast('YouTube authorization failed', oauthError, 'error');
    }
    void refreshChannels(preferredChannelId);
  }, [addToast, refreshChannels]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      addToast('Browser storage unavailable', error instanceof Error ? error.message : 'Could not save local preferences.', 'warning');
    }
  }, [addToast, settings]);

  useEffect(() => {
    setPublishedShort(null);
    setLastAutonomousRun(null);
    void refreshStats();
  }, [refreshStats]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
  }, []);

  const channel = useMemo(
    () => channels.find(({ channelId }) => channelId === settings.selectedChannelId) ?? null,
    [channels, settings.selectedChannelId],
  );

  const sendMessage = useCallback(async (text: string) => {
    const prompt = text.trim();
    if (!prompt || isAiGenerating) return;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: ChatMessage = { id: crypto.randomUUID(), sender: 'user', text: prompt, timestamp };
    setChatMessages((current) => [...current, userMessage]);
    setIsAiGenerating(true);
    try {
      const result = await apiRequest<{ response: string; model: ChatMessage['modelUsed'] }>('/brain/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
        }),
      });
      setChatMessages((current) => [...current, {
        id: crypto.randomUUID(),
        sender: 'gemini',
        text: result.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: result.model,
      }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gemini request failed.';
      addToast('Gemini request failed', message, 'error');
    } finally {
      setIsAiGenerating(false);
    }
  }, [addToast, isAiGenerating]);

  const toggleLikeMessage = useCallback((id: string) => {
    setChatMessages((current) => current.map((message) => message.id === id
      ? { ...message, liked: !message.liked, disliked: false }
      : message));
  }, []);

  const toggleDislikeMessage = useCallback((id: string) => {
    setChatMessages((current) => current.map((message) => message.id === id
      ? { ...message, disliked: !message.disliked, liked: false }
      : message));
  }, []);

  const clearChat = useCallback(() => setChatMessages([]), []);

  const publishShort = useCallback(async () => {
    if (!settings.selectedChannelId || isPipelineRunning) {
      if (!settings.selectedChannelId) addToast('Connect YouTube first', 'Authorize a channel and grant upload access before publishing a Short.', 'warning');
      return;
    }
    setIsPipelineRunning(true);
    setPublishedShort(null);
    try {
      const result = await apiRequest<PublishedShort>('/brain/publish', {
        method: 'POST',
        body: JSON.stringify({ channelId: settings.selectedChannelId }),
      });
      setPublishedShort(result);
      setLastAutonomousRun(result.uploadedAt);
      addToast('Short published publicly', result.title, 'success', { label: 'Watch on YouTube', href: result.url });
      await Promise.all([refreshStats(), refreshChannels()]);
    } catch (error) {
      addToast('Short publishing failed', error instanceof Error ? error.message : 'Video generation or upload failed.', 'error');
    } finally {
      setIsPipelineRunning(false);
    }
  }, [addToast, isPipelineRunning, refreshChannels, refreshStats, settings.selectedChannelId]);

  const addProvenTactic = useCallback(async (tactic: Omit<ProvenTactic, 'id' | 'createdAt'>) => {
    if (!settings.selectedChannelId) {
      addToast('Connect YouTube first', 'Tactics are saved to a channel’s memory.', 'warning');
      return;
    }
    try {
      await apiRequest(`/brain/tactic`, {
        method: 'POST',
        body: JSON.stringify({ channelId: settings.selectedChannelId, ...tactic }),
      });
      addToast('Tactic saved', 'Added to this channel’s persistent AI memory.', 'success');
      await refreshStats();
    } catch (error) {
      addToast('Could not save tactic', error instanceof Error ? error.message : 'Request failed.', 'error');
    }
  }, [addToast, refreshStats, settings.selectedChannelId]);

  const addMistakeLog = useCallback(async (mistake: Omit<MistakeLog, 'id' | 'resolvedAt'>) => {
    if (!settings.selectedChannelId) {
      addToast('Connect YouTube first', 'Learning rules are saved to a channel’s memory.', 'warning');
      return;
    }
    try {
      await apiRequest('/brain/mistake', {
        method: 'POST',
        body: JSON.stringify({ channelId: settings.selectedChannelId, ...mistake }),
      });
      addToast('Learning rule saved', 'This rule will be included in future generated drafts.', 'success');
      await refreshStats();
    } catch (error) {
      addToast('Could not save learning rule', error instanceof Error ? error.message : 'Request failed.', 'error');
    }
  }, [addToast, refreshStats, settings.selectedChannelId]);

  const toggleAutonomousMode = useCallback(async () => {
    if (!settings.selectedChannelId) {
      addToast('Connect YouTube first', 'Memory preferences are stored per channel.', 'warning');
      return;
    }
    const nextMode = !settings.selfCorrectionMode;
    try {
      await apiRequest(`/brain/${encodeURIComponent(settings.selectedChannelId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ selfCorrectionMode: nextMode }),
      });
      updateSettings({ selfCorrectionMode: nextMode });
      addToast('Memory preference updated', `Self-correction ${nextMode ? 'enabled' : 'disabled'}.`, 'success');
    } catch (error) {
      addToast('Could not update memory preference', error instanceof Error ? error.message : 'Request failed.', 'error');
    }
  }, [addToast, settings.selectedChannelId, settings.selfCorrectionMode, updateSettings]);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value: AppContextType = {
    activeTab,
    setActiveTab,
    canInstallApp: installPrompt !== null,
    isAppInstalled,
    installApp,
    theme,
    toggleTheme,
    settings,
    updateSettings,
    saveSettingsToStorage,
    resetDefaultSettings,
    channels,
    channel,
    videos,
    isLoadingChannels,
    isLoadingStats,
    channelError,
    refreshChannels: () => refreshChannels(),
    refreshStats,
    connectYouTube,
    disconnectChannel,
    chatMessages,
    sendMessage,
    toggleLikeMessage,
    toggleDislikeMessage,
    clearChat,
    isAiGenerating,
    provenTactics,
    mistakeLogs,
    isPipelineRunning,
    publishedShort,
    lastAutonomousRun,
    publishShort,
    addProvenTactic,
    addMistakeLog,
    toggleAutonomousMode,
    toasts,
    addToast,
    removeToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
