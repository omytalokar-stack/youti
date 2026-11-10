import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, LoaderCircle, Radio, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { apiRequest } from '../../services/api';

export const SettingsTab: React.FC = () => {
  const {
    channels,
    channel,
    settings,
    updateSettings,
    isLoadingChannels,
    channelError,
    refreshChannels,
    connectYouTube,
    disconnectChannel,
    addToast,
  } = useApp();
  const [connecting, setConnecting] = useState(false);
  const [checkingGemini, setCheckingGemini] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connectYouTube();
    } catch (error) {
      setConnecting(false);
      addToast('Could not start Google authorization', error instanceof Error ? error.message : 'Request failed.', 'error');
    }
  };

  const handleTestGemini = async () => {
    setCheckingGemini(true);
    try {
      await apiRequest('/brain/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Reply with the single word: connected' }),
      });
      addToast('Gemini is connected', 'Backend successfully received a response from Gemini.', 'success');
    } catch (error) {
      addToast('Gemini connection failed', error instanceof Error ? error.message : 'Request failed.', 'error');
    } finally {
      setCheckingGemini(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Remove this channel’s saved connection from the backend?')) return;
    try {
      await disconnectChannel();
    } catch (error) {
      addToast('Could not disconnect channel', error instanceof Error ? error.message : 'Request failed.', 'error');
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-500">
          <KeyRound className="w-4 h-4" />
          Backend connection settings
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Connect your real accounts</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          API credentials are read from the backend environment. They are never requested or saved in this browser.
        </p>
      </header>

      <section className="p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e] space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500"><Radio className="w-5 h-5" /></div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">YouTube channel</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Google OAuth lets you select your channel and read owner-only YouTube Analytics.
              </p>
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${channel ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
            {channel ? 'Connected' : 'Not connected'}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#131314] text-xs text-slate-600 dark:text-slate-300">
          Authorizes YouTube read, Analytics read, and upload scopes. Reconnect after this update and approve upload access before scheduled publishing can run.
        </div>

        {channelError && (
          <p role="alert" className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-xs text-rose-700 dark:text-rose-300">
            {channelError}
          </p>
        )}

        {channels.length > 0 && (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Choose connected channel</span>
            <select
              value={settings.selectedChannelId}
              onChange={(event) => {
                updateSettings({ selectedChannelId: event.target.value });
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#131314] text-sm"
            >
              {channels.map((item) => (
                <option key={item.channelId} value={item.channelId}>{item.title} · {item.channelId}</option>
              ))}
            </select>
          </label>
        )}

        {channel && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> {channel.title} ({channel.channelId})
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50 sm:w-auto"
          >
            {connecting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {connecting ? 'Opening Google…' : channels.length ? 'Reconnect / connect Google account' : 'Connect YouTube with Google'}
          </button>
          <button
            onClick={() => void refreshChannels()}
            disabled={isLoadingChannels}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:bg-[#282a2c] dark:text-slate-200 sm:w-auto"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingChannels ? 'animate-spin' : ''}`} /> Refresh channels
          </button>
          {channel && (
            <button
              onClick={() => void handleDisconnect()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 sm:w-auto"
            >
              <Unplug className="w-4 h-4" /> Disconnect selected
            </button>
          )}
        </div>
      </section>

      <section className="p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e] space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500"><ShieldCheck className="w-5 h-5" /></div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Gemini API</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Uses GEMINI_API_KEY from the backend environment; the key is not exposed to the browser.
            </p>
          </div>
        </div>
        <button
          onClick={handleTestGemini}
          disabled={checkingGemini}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {checkingGemini && <LoaderCircle className="w-4 h-4 animate-spin" />}
          {checkingGemini ? 'Checking Gemini…' : 'Test Gemini connection'}
        </button>
      </section>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        OAuth client credentials, Gemini API key, and token encryption keys belong in the backend `.env` file or your hosting provider’s environment settings. Never paste them into this page or chat.
      </p>
    </div>
  );
};
