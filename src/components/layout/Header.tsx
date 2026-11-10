import React from 'react';
import { useApp } from '../../context/AppContext';
import { Play, RefreshCw, Plus, Radio } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    activeTab, 
    setActiveTab, 
    settings, 
    channel,
    publishShort, 
    isPipelineRunning,
    clearChat 
  } = useApp();

  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case 'analytics':
        return 'YouTube Channel Analytics & Ingestion';
      case 'gemini':
        return 'Gemini Studio Workspace';
      case 'brain':
        return 'Channel Learning Memory';
      case 'settings':
        return 'Account Connections';
      default:
        return 'Dashboard';
    }
  };

  return (
    <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/90 px-3 backdrop-blur-md dark:border-[#282a2c] dark:bg-[#131314]/90 sm:gap-4 sm:px-4 md:px-6">
      {/* Workspace context */}
      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-500 dark:text-slate-400 sm:gap-3">
          <span className="shrink-0 font-semibold text-slate-800 dark:text-slate-200">Dimag AI</span>
          <span aria-hidden="true" className="hidden text-slate-300 dark:text-slate-700 sm:inline">/</span>
          <span className="hidden truncate font-medium text-slate-600 dark:text-slate-300 sm:inline sm:max-w-[200px] lg:max-w-none">
            {getBreadcrumbTitle()}
          </span>
      </div>

      {/* Zone 2: Informational trust indicator (Unboxed text with separators) */}
      <div className="hidden lg:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        <span className="font-mono">{channel?.title || 'No channel connected'}</span>
        <span aria-hidden="true">·</span>
        <span className="flex items-center gap-1 font-mono text-[11px]">
        {settings.selectedChannelId
          ? <span className="text-emerald-700 dark:text-emerald-400">YouTube connected</span>
          : <span className="text-amber-700 dark:text-amber-400">Connect YouTube in Settings</span>}
        </span>
      </div>

      {/* Zone 3: 1 Contextual Primary Action Button */}
      <div className="flex shrink-0 items-center gap-2">
        {activeTab === 'gemini' ? (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-[#1e1f20] dark:text-slate-200 dark:hover:bg-[#282a2c] sm:px-3"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
            <span>New Chat</span>
          </button>
        ) : activeTab === 'brain' || activeTab === 'analytics' ? (
          <button
            onClick={() => void publishShort()}
            disabled={isPipelineRunning || !settings.selectedChannelId}
            aria-label="Generate a YouTube Short and publish it publicly now"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-2.5 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:from-indigo-500 hover:to-purple-500 hover:shadow-indigo-500/20 disabled:opacity-50 sm:px-3.5"
          >
            {isPipelineRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">Creating & uploading...</span>
                <span className="sm:hidden">Creating…</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span className="hidden sm:inline">Create & Publish Short</span>
                <span className="sm:hidden">Create Short</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => setActiveTab('analytics')}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-[#282a2c] dark:hover:bg-[#323538] sm:px-3.5"
          >
            <Radio className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">View Channel Analytics</span>
            <span className="sm:hidden">Analytics</span>
          </button>
        )}
      </div>
    </header>
  );
};
