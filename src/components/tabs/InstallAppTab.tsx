import React from 'react';
import { ArrowLeft, CheckCircle2, Download, MonitorDown, Share, Smartphone } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const InstallAppTab: React.FC = () => {
  const { canInstallApp, isAppInstalled, installApp, setActiveTab } = useApp();

  const handleInstall = async () => {
    if (canInstallApp) {
      await installApp();
      return;
    }
    if (isAppInstalled) return;

    const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const instructions = isAppleMobile
      ? 'In Safari, tap Share, then Add to Home Screen.'
      : 'Open your browser menu and choose Install app or Add to Home screen.';
    window.alert(instructions);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <button
        type="button"
        onClick={() => setActiveTab('settings')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-pink-600 dark:text-slate-300 dark:hover:text-pink-400"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </button>

      <section className="overflow-hidden rounded-3xl border border-pink-200 bg-gradient-to-br from-pink-50 via-white to-fuchsia-100 p-6 dark:border-pink-900/50 dark:from-pink-950/30 dark:via-[#1a1b1e] dark:to-fuchsia-950/20 md:p-10">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-pink-500 text-white shadow-lg shadow-pink-500/25">
            <Download className="h-10 w-10" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-pink-600 dark:text-pink-300">Dimag AI · Mobile app</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Install the app</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Add Dimag AI to your home screen for a full-screen app experience. It installs directly from this website—no app-store download needed.
          </p>

          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={isAppInstalled}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-pink-600/20 transition hover:bg-pink-500 disabled:cursor-default disabled:bg-emerald-600 sm:w-auto"
          >
            {isAppInstalled ? <CheckCircle2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
            {isAppInstalled ? 'App already installed' : 'Install Dimag AI'}
          </button>
          {!canInstallApp && !isAppInstalled && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              If the install prompt does not open, use your browser menu to add this app to your home screen.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[#282a2c] dark:bg-[#1a1b1e]">
          <div className="flex items-center gap-2 text-pink-600 dark:text-pink-400">
            <Smartphone className="h-5 w-5" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Android</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Open this site in Chrome or another supported browser and tap <strong>Install Dimag AI</strong>. You can also use the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[#282a2c] dark:bg-[#1a1b1e]">
          <div className="flex items-center gap-2 text-pink-600 dark:text-pink-400">
            <Share className="h-5 w-5" />
            <h2 className="font-semibold text-slate-900 dark:text-white">iPhone or iPad</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Open this site in Safari, tap <strong>Share</strong>, choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
          </p>
        </article>
      </section>

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
        <MonitorDown className="mt-0.5 h-4 w-4 shrink-0" />
        This is an installable Progressive Web App (PWA), not an APK or App Store package. A supported browser installs it securely from the live website.
      </p>
    </div>
  );
};
