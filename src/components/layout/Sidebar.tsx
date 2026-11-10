import React from 'react';
import { useApp } from '../../context/AppContext';
import { TabId } from '../../types';
import {
  BarChart3,
  Sparkles,
  Cpu,
  Settings,
  Sun,
  Moon,
  Radio,
  PlaySquare,
  CheckCircle2,
  Download,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, theme, toggleTheme, settings } = useApp();

  const navItems: Array<{ id: TabId; label: string; icon: React.ReactNode; badge?: string }> = [
    {
      id: 'analytics',
      label: 'Channel Analytics',
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      badge: settings.selectedChannelId ? 'Live' : 'Connect',
    },
    {
      id: 'gemini',
      label: 'Gemini Studio',
      icon: <Sparkles className="w-4 h-4 shrink-0" />,
      badge: 'Gemini',
    },
    {
      id: 'brain',
      label: 'Agent Brain ("Dimag")',
      icon: <Cpu className="w-4 h-4 shrink-0" />,
      badge: settings.selfCorrectionMode ? 'Learning' : 'Paused',
    },
    {
      id: 'settings',
      label: 'Profile & Settings',
      icon: <Settings className="w-4 h-4 shrink-0" />,
      badge: settings.selectedChannelId ? 'Connected' : 'Connect',
    },
    {
      id: 'install',
      label: 'Install App',
      icon: <Download className="w-4 h-4 shrink-0" />,
      badge: 'PWA',
    },
  ];

  return (
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white text-slate-800 dark:border-[#282a2c] dark:bg-[#131314] dark:text-slate-200 md:flex lg:w-68">
        {/* Brand Lockup: Clean One-line Brand Wordmark */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-[#222426]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-pink-500 via-fuchsia-500 to-rose-500 p-0.5 shadow-sm flex items-center justify-center">
              <div className="w-full h-full bg-[#131314] rounded-[6px] flex items-center justify-center">
                <PlaySquare className="w-4 h-4 text-rose-500" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                  Dimag AI
                </span>
                <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                  YT
                </span>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tracking-tight">
                YouTube Creator Workspace
              </p>
            </div>
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1e1f20] transition-colors"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle visual theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>

        {/* Channel Identity Pill */}
        <div className="px-3 pt-3">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#1a1b1e] border border-slate-200/60 dark:border-[#282a2c]">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              <span className="flex items-center gap-1 font-medium">
                <Radio className="w-3 h-3 text-emerald-500" />
                Active Channel
              </span>
              <span className={`text-[10px] font-mono ${settings.selectedChannelId ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {settings.selectedChannelId ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {settings.selectedChannelId ? 'YouTube channel' : 'No YouTube channel'}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate mt-0.5">
              {settings.selectedChannelId || 'Connect your Google account in Settings'}
            </p>
          </div>
        </div>

        {/* Main Tab Navigation */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Workspaces
          </div>
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-slate-900 dark:bg-[#1e1f20] text-white dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1a1b1e] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={isActive ? 'text-indigo-400' : 'text-slate-400 dark:text-slate-500'}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isActive
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'text-slate-400 dark:text-slate-500 bg-slate-200/50 dark:bg-[#25272a]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Autonomous Engine Telemetry footer */}
        <div className="p-3 border-t border-slate-100 dark:border-[#222426]">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#1a1b1e] border border-slate-200/60 dark:border-[#282a2c] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Channel memory</span>
              <span
                className={`text-[10px] font-mono font-medium px-1.5 py-0.2 rounded ${
                  settings.selfCorrectionMode
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                    : 'text-amber-700 dark:text-amber-400 bg-amber-500/10'
                }`}
              >
                {settings.selfCorrectionMode ? 'Learning enabled' : 'Learning paused'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              <span>Real data only</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                {settings.selectedChannelId ? 'Connected' : 'Not connected'}
              </span>
            </div>
          </div>

          {/* User Profile Bar */}
          <div className="mt-2.5 flex items-center justify-between px-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {settings.selectedChannelId ? 'Channel workspace' : 'Local workspace'}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  Credentials stay on backend
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
  );
};
