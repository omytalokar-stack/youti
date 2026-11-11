import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import VideoLog from '../models/VideoLog.js';

const FALLBACK_SCRIPTS_URL = new URL('../config/fallbackScripts.json', import.meta.url);

export const TOPIC_CATEGORIES = [
  {
    name: 'Space Mysteries',
    subNiches: ['black hole boundaries', 'strange planetary rotations', 'moon and asteroid discoveries'],
  },
  {
    name: 'Human Psychology',
    subNiches: ['memory reconstruction', 'attention and perception', 'sleep and decision-making'],
  },
  {
    name: 'Bizarre Nature & Animals',
    subNiches: ['unusual animal anatomy', 'extreme adaptations', 'unexpected animal behavior'],
  },
  {
    name: 'Unbelievable Science',
    subNiches: ['counterintuitive physics', 'everyday chemistry', 'surprising Earth phenomena'],
  },
  {
    name: 'Ancient History & Secrets',
    subNiches: ['forgotten inventions', 'unexpected historical timelines', 'ancient engineering'],
  },
  {
    name: 'Deep Ocean Facts',
    subNiches: ['life without sunlight', 'deep-sea pressure', 'bioluminescent ecosystems'],
  },
];

export async function fetchRecentVideoTopics(channelId) {
  const videos = await VideoLog.find(
    { channelId, uploadDate: { $ne: null } },
    { title: 1, hookUsed: 1, tags: 1, uploadDate: 1, _id: 0 },
  )
    .sort({ uploadDate: -1 })
    .limit(15)
    .lean();

  return videos.map(({ title, hookUsed, tags }) => ({
    title,
    topic: hookUsed || '',
    tags: tags || [],
  }));
}

export function formatRecentVideoTopics(recentVideos) {
  if (!recentVideos.length) {
    return '- No recently published videos are recorded.';
  }
  return recentVideos.map(({ title, topic, tags }) =>
    `- ${title}${topic ? ` (topic/hook: ${topic})` : ''}${tags?.length ? ` [tags: ${tags.join(', ')}]` : ''}`,
  ).join('\n');
}

export function selectTopicDirection(random = Math.random) {
  const category = TOPIC_CATEGORIES[Math.floor(random() * TOPIC_CATEGORIES.length)];
  const subNiche = category.subNiches[Math.floor(random() * category.subNiches.length)];
  return { category: category.name, subNiche };
}

function createSubtitleBeats(script) {
  const words = script.trim().split(/\s+/);
  const wordsPerBeat = 4;
  const secondsPerBeat = 2.5;

  return Array.from({ length: Math.ceil(words.length / wordsPerBeat) }, (_, index) => {
    const beatWords = words.slice(index * wordsPerBeat, (index + 1) * wordsPerBeat);
    const highlightedWord = beatWords[beatWords.length - 1].replace(/[.,!?।]+$/u, '');
    return {
      start: index * secondsPerBeat,
      end: (index + 1) * secondsPerBeat,
      text: beatWords.join(' '),
      highlightedWord,
    };
  });
}

export async function generateFallbackShort(channelMemory, random = Math.random) {
  const fallbackScripts = JSON.parse(await readFile(fileURLToPath(FALLBACK_SCRIPTS_URL), 'utf8'));
  if (!Array.isArray(fallbackScripts) || fallbackScripts.length < 20) {
    throw new Error('The fallback script pool must contain at least 20 scripts.');
  }

  const previousIndex = channelMemory.lastFallbackScriptIndex;
  const availableIndexes = fallbackScripts
    .map((_, index) => index)
    .filter((index) => index !== previousIndex);
  const selection = availableIndexes[Math.floor(random() * availableIndexes.length)];
  const fallback = fallbackScripts[selection];
  if (
    typeof fallback?.hook !== 'string' ||
    typeof fallback.script !== 'string' ||
    typeof fallback.title !== 'string' ||
    typeof fallback.description !== 'string' ||
    !Array.isArray(fallback.tags)
  ) {
    throw new Error(`Fallback script at index ${selection} is invalid.`);
  }

  channelMemory.lastFallbackScriptIndex = selection;
  await channelMemory.save();
  return { ...fallback, subtitleBeats: createSubtitleBeats(fallback.script) };
}
