/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { AnalyticsDashboard } from './components/tabs/AnalyticsDashboard';
import { GeminiStudio } from './components/tabs/GeminiStudio';
import { AgentBrain } from './components/tabs/AgentBrain';
import { SettingsTab } from './components/tabs/SettingsTab';
import { InstallAppTab } from './components/tabs/InstallAppTab';
import { ToastContainer } from './components/common/Toast';
import { BarChart3, Cpu, Download, Settings, Sparkles } from 'lucide-react';
import { TabId } from './types';

const AppContent: React.FC = () => {
  const { activeTab, setActiveTab } = useApp();

  const mobileTabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="h-5 w-5" /> },
    { id: 'gemini', label: 'Gemini', icon: <Sparkles className="h-5 w-5" /> },
    { id: 'brain', label: 'Agent Brain', icon: <Cpu className="h-5 w-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
    { id: 'install', label: 'Install', icon: <Download className="h-5 w-5" /> },
  ];

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'analytics':
        return <AnalyticsDashboard />;
      case 'gemini':
        return <GeminiStudio />;
      case 'brain':
        return <AgentBrain />;
      case 'settings':
        return <SettingsTab />;
      case 'install':
        return <InstallAppTab />;
      default:
        return <AnalyticsDashboard />;
    }
  };

  return (
    <div className="flex h-dvh min-h-[100svh] overflow-hidden bg-slate-50 text-slate-900 transition-colors duration-150 dark:bg-[#131314] dark:text-[#e3e3e3]">
      <Sidebar />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />

        <main className={`min-h-0 flex-1 ${activeTab === 'gemini' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {renderActiveTab()}
        </main>

        <nav
          aria-label="Mobile navigation"
          className="box-border grid h-16 shrink-0 grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-[#282a2c] dark:bg-[#131314]/95 md:hidden"
        >
          {mobileTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors ${
                  isActive
                    ? 'text-pink-600 dark:text-pink-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {tab.icon}
                <span className="max-w-full truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
