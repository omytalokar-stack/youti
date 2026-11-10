import React, { useState } from 'react';
import { AlertTriangle, Brain, CheckCircle2, LoaderCircle, Plus, Sparkles, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MistakeLog, ProvenTactic } from '../../types';

export const AgentBrain: React.FC = () => {
  const {
    settings,
    channel,
    provenTactics,
    mistakeLogs,
    publishedShort,
    lastAutonomousRun,
    isPipelineRunning,
    publishShort,
    addProvenTactic,
    addMistakeLog,
    toggleAutonomousMode,
    setActiveTab,
  } = useApp();
  const [tacticFormOpen, setTacticFormOpen] = useState(false);
  const [mistakeFormOpen, setMistakeFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [impact, setImpact] = useState('');
  const [description, setDescription] = useState('');
  const [videoId, setVideoId] = useState('');
  const [issue, setIssue] = useState('');
  const [retentionDropAt, setRetentionDropAt] = useState('');
  const [ruleUpdated, setRuleUpdated] = useState('');

  const saveTactic = async (event: React.FormEvent) => {
    event.preventDefault();
    const tactic: Omit<ProvenTactic, 'id' | 'createdAt'> = { title, impact, description };
    await addProvenTactic(tactic);
    setTitle('');
    setImpact('');
    setDescription('');
    setTacticFormOpen(false);
  };

  const saveMistake = async (event: React.FormEvent) => {
    event.preventDefault();
    const mistake: Omit<MistakeLog, 'id' | 'resolvedAt'> = {
      videoId,
      issue,
      retentionDropAt,
      ruleUpdated,
    };
    await addMistakeLog(mistake);
    setVideoId('');
    setIssue('');
    setRetentionDropAt('');
    setRuleUpdated('');
    setMistakeFormOpen(false);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-white dark:bg-[#1a1b1e] border border-slate-200 dark:border-[#282a2c]">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-500"><Brain className="w-4 h-4" /> Persistent channel memory</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Dimag learning memory</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Gemini chooses a channel-relevant topic, creates the Hindi voiceover and vertical video, then publishes it publicly to your connected channel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => void toggleAutonomousMode()}
            disabled={!channel}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#282a2c] text-xs font-semibold disabled:opacity-50"
          >
            {settings.selfCorrectionMode ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
            Self-correction {settings.selfCorrectionMode ? 'on' : 'off'}
          </button>
          <button
            onClick={() => void publishShort()}
            disabled={!channel || isPipelineRunning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"
          >
            {isPipelineRunning ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isPipelineRunning ? 'Creating & uploading…' : 'Create & publish Short'}
          </button>
        </div>
      </header>

      {!channel && (
        <div className="p-5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 text-sm">
          Connect a YouTube channel to create channel-specific memory and drafts.
          <button onClick={() => setActiveTab('settings')} className="ml-2 underline font-semibold">Open settings</button>
        </div>
      )}

      {channel && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e]">
            <p className="text-xs text-slate-500">Connected channel</p><p className="mt-1 font-semibold">{channel.title}</p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e]">
            <p className="text-xs text-slate-500">Saved tactics</p><p className="mt-1 font-semibold">{provenTactics.length}</p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e]">
            <p className="text-xs text-slate-500">Last published</p><p className="mt-1 font-semibold">{lastAutonomousRun ? new Date(lastAutonomousRun).toLocaleString() : 'Not run yet'}</p>
          </div>
        </div>
      )}

      {publishedShort && (
        <section className="p-5 rounded-xl border border-indigo-300 dark:border-indigo-900 bg-white dark:bg-[#1a1b1e] space-y-3">
          <h2 className="font-bold text-slate-900 dark:text-white">Published Short · {publishedShort.title}</h2>
          <p className="text-sm">The video is live on YouTube. Duration: {publishedShort.durationSeconds.toFixed(1)} seconds.</p>
          <a href={publishedShort.url} target="_blank" rel="noreferrer" className="text-sm text-indigo-500 underline">Watch your public Short</a>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div><h2 className="font-bold">Channel tactics</h2><p className="text-xs text-slate-500">Only rules you add are shown as learned tactics.</p></div>
            <button onClick={() => setTacticFormOpen((open) => !open)} disabled={!channel} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#282a2c] text-xs disabled:opacity-50"><Plus className="w-4 h-4" /> Add tactic</button>
          </div>
          {tacticFormOpen && (
            <form onSubmit={saveTactic} className="p-4 space-y-3 rounded-xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e]">
              <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Tactic title" className="w-full p-2 rounded border bg-transparent text-sm" />
              <input required value={impact} onChange={(event) => setImpact(event.target.value)} placeholder="Observed impact or evidence" className="w-full p-2 rounded border bg-transparent text-sm" />
              <textarea required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should future scripts do?" className="w-full p-2 rounded border bg-transparent text-sm" rows={3} />
              <button className="px-3 py-2 rounded bg-indigo-600 text-white text-xs font-semibold">Save to channel memory</button>
            </form>
          )}
          {provenTactics.length === 0 && <p className="p-5 rounded-xl border border-dashed text-sm text-slate-500">No tactics recorded for this channel.</p>}
          {provenTactics.map((tactic) => (
            <article key={tactic.id} className="p-4 rounded-xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e]">
              <div className="flex justify-between gap-2"><h3 className="font-semibold">{tactic.title}</h3>{tactic.impact && <span className="text-xs text-emerald-600">{tactic.impact}</span>}</div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{tactic.description}</p>
              <p className="mt-2 text-[11px] text-slate-400">{new Date(tactic.createdAt).toLocaleDateString()}</p>
            </article>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div><h2 className="font-bold">Learning rules</h2><p className="text-xs text-slate-500">Recent rules are supplied as constraints when generating drafts.</p></div>
            <button onClick={() => setMistakeFormOpen((open) => !open)} disabled={!channel} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#282a2c] text-xs disabled:opacity-50"><Plus className="w-4 h-4" /> Add rule</button>
          </div>
          {mistakeFormOpen && (
            <form onSubmit={saveMistake} className="p-4 space-y-3 rounded-xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e]">
              <input required value={videoId} onChange={(event) => setVideoId(event.target.value)} placeholder="YouTube video ID" className="w-full p-2 rounded border bg-transparent text-sm" />
              <input required value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="What went wrong?" className="w-full p-2 rounded border bg-transparent text-sm" />
              <input value={retentionDropAt} onChange={(event) => setRetentionDropAt(event.target.value)} placeholder="Retention drop timestamp (optional)" className="w-full p-2 rounded border bg-transparent text-sm" />
              <textarea required value={ruleUpdated} onChange={(event) => setRuleUpdated(event.target.value)} placeholder="Rule to avoid repeating the issue" className="w-full p-2 rounded border bg-transparent text-sm" rows={3} />
              <button className="px-3 py-2 rounded bg-amber-600 text-white text-xs font-semibold">Save learning rule</button>
            </form>
          )}
          {mistakeLogs.length === 0 && <p className="p-5 rounded-xl border border-dashed text-sm text-slate-500">No learning rules recorded for this channel.</p>}
          {mistakeLogs.map((mistake) => (
            <article key={mistake.id} className="p-4 rounded-xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e] space-y-2">
              <div className="flex gap-2 items-start"><AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500" /><div><h3 className="font-semibold">{mistake.issue}</h3><a className="text-xs text-indigo-500 underline" href={`https://www.youtube.com/watch?v=${encodeURIComponent(mistake.videoId)}`} target="_blank" rel="noreferrer">Video {mistake.videoId}</a></div></div>
              {mistake.retentionDropAt && <p className="text-xs text-slate-500">Drop reported at {mistake.retentionDropAt}</p>}
              <p className="text-sm text-slate-600 dark:text-slate-300">{mistake.ruleUpdated}</p>
              {mistake.resolvedAt && <p className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Resolved {new Date(mistake.resolvedAt).toLocaleDateString()}</p>}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
};
