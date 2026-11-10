import React, { useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, Eye, Film, RefreshCw, Search, Users, Clock3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const number = (value: number) => value.toLocaleString();
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : '—';

export const AnalyticsDashboard: React.FC = () => {
  const {
    channel,
    videos,
    settings,
    setActiveTab,
    isLoadingChannels,
    isLoadingStats,
    channelError,
    refreshStats,
  } = useApp();
  const [query, setQuery] = useState('');

  const filteredVideos = useMemo(
    () => videos.filter((video) => video.title.toLowerCase().includes(query.toLowerCase())),
    [query, videos],
  );

  const watchHours = videos.reduce((total, video) => total + video.watchTimeHours, 0);
  const subscribersGained = videos.reduce((total, video) => total + video.subscribersGained, 0);
  const subscribersLost = videos.reduce((total, video) => total + video.subscribersLost, 0);

  if (!settings.selectedChannelId) {
    return (
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e] p-8 text-center space-y-4">
          <Film className="w-10 h-10 mx-auto text-indigo-500" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Connect a YouTube channel</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Analytics will appear here after you authorize your Google account. No demo channel or sample metrics are shown.
          </p>
          <button onClick={() => setActiveTab('settings')} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">
            Open channel settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">YouTube Analytics · Owner data</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{channel?.title || 'Connected channel'}</h1>
          <p className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400">{settings.selectedChannelId}</p>
        </div>
        <button
          onClick={() => void refreshStats()}
          disabled={isLoadingStats}
          className="inline-flex items-center gap-2 self-start px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#282a2c] text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingStats ? 'animate-spin' : ''}`} /> Refresh analytics
        </button>
      </header>

      {channelError && (
        <div role="alert" className="flex gap-2 p-4 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {channelError}
        </div>
      )}

      {(isLoadingChannels || isLoadingStats) && (
        <p className="text-sm text-slate-500" role="status">Loading channel data from YouTube…</p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { title: 'Lifetime views', value: channel ? number(channel.totalViews) : '—', icon: Eye },
          { title: 'Subscribers', value: channel?.totalSubscribers == null ? 'Hidden by channel owner' : number(channel.totalSubscribers), icon: Users },
          { title: 'Published videos', value: channel ? number(channel.totalVideos) : '—', icon: Film },
          { title: 'Watch hours (reported videos)', value: number(watchHours), icon: Clock3 },
        ].map(({ title, value, icon: Icon }) => (
          <article key={title} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-[#282a2c] dark:bg-[#1a1b1e] sm:p-5">
            <div className="flex items-start justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">
              <span>{title}</span><Icon className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="mt-2 break-words text-xl font-bold font-mono text-slate-900 dark:text-white sm:text-2xl">{value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-indigo-50/60 p-3 text-xs leading-relaxed text-slate-600 dark:border-[#282a2c] dark:bg-indigo-950/20 dark:text-slate-300 sm:p-4">
        Channel and recent-video views, titles, thumbnails, and publish dates come from the YouTube Data API and can appear as soon as YouTube returns them. Subscriber changes and watch time come from the last 90 days of YouTube Analytics and may take 24–48 hours to process. Retention curves and click-through rates are not fabricated or displayed because this integration does not currently request those reports.
        <span className="block mt-1">Reported totals for the returned videos: {number(subscribersGained)} gained · {number(subscribersLost)} lost.</span>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-[#282a2c] bg-white dark:bg-[#1a1b1e] overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-3 dark:border-[#282a2c] sm:p-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Video analytics</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Recent uploads and live views update from YouTube Data API; subscriber changes and watch time use Analytics reports.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search videos" className="w-full rounded-lg border border-slate-200 bg-transparent py-2 pl-8 pr-3 text-xs dark:border-[#282a2c] sm:w-64" />
            </label>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-[#282a2c] md:hidden">
          {filteredVideos.map((video) => (
            <article key={video.videoId} className="flex gap-3 p-3">
              {video.thumbnail && (
                <a
                  href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-28 shrink-0 self-start overflow-hidden rounded-lg bg-slate-100 dark:bg-[#282a2c] sm:w-36"
                  aria-label={`Open ${video.title} on YouTube`}
                >
                  <img src={video.thumbnail} alt="" className="aspect-video h-auto w-full object-cover" loading="lazy" />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-sm font-semibold text-slate-800 hover:text-indigo-500 dark:text-slate-200"
                >
                  {video.title}<ExternalLink className="ml-1 inline h-3 w-3" />
                </a>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Published {date(video.uploadDate)}</p>
                <p className="mt-2 text-sm font-semibold font-mono">{number(video.views)} <span className="font-normal text-slate-500">views</span></p>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  {video.watchTimeHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} watch hrs · {number(video.subscribersGained)} subs
                </p>
              </div>
            </article>
          ))}
          {!isLoadingStats && filteredVideos.length === 0 && (
            <p className="p-8 text-center text-xs text-slate-500">
              {videos.length ? 'No videos match your search.' : 'No recent uploads or per-video analytics were returned for this channel.'}
            </p>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#161719] text-slate-500">
              <tr>
                <th className="p-3">Video</th><th className="p-3">Published</th><th className="p-3">Views</th>
                <th className="p-3">Subs gained</th><th className="p-3">Subs lost</th><th className="p-3">Watch hours</th>
              </tr>
            </thead>
            <tbody>
              {filteredVideos.map((video) => (
                <tr key={video.videoId} className="border-t border-slate-100 dark:border-[#282a2c]">
                  <td className="p-3 min-w-64">
                    <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 font-medium text-slate-800 dark:text-slate-200 hover:text-indigo-500">
                      {video.thumbnail && <img src={video.thumbnail} alt="" className="w-20 aspect-video rounded object-cover" />}
                      <span>{video.title}<ExternalLink className="inline ml-1 w-3 h-3" /></span>
                    </a>
                    <span className="block mt-1 text-[10px] font-mono text-slate-400">{video.videoId}</span>
                  </td>
                  <td className="p-3 text-slate-500">{video.uploadDate ? new Date(video.uploadDate).toLocaleDateString() : '—'}</td>
                  <td className="p-3 font-mono">{number(video.views)}</td>
                  <td className="p-3 font-mono text-emerald-600">{number(video.subscribersGained)}</td>
                  <td className="p-3 font-mono text-rose-500">{number(video.subscribersLost)}</td>
                  <td className="p-3 font-mono">{video.watchTimeHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                </tr>
              ))}
              {!isLoadingStats && filteredVideos.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">
                  {videos.length ? 'No videos match your search.' : 'No recent uploads or per-video analytics were returned for this channel.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
