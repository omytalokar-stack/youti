import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { google } from 'googleapis';
import YouTubeCredential from '../models/YouTubeCredential.js';
import { getAuthorizedYouTubeClient } from './youtubeService.js';

const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const SHORTS_TITLE_SUFFIX = '#Shorts';
const DESCRIPTION_HASHTAGS = ['#Shorts', '#DimaagKiBatti', '#BrainFacts', '#PsychologyFacts'];

function appendShortsTitle(title) {
  const trimmedTitle = title.trim();
  const shortsMatch = trimmedTitle.match(/#shorts\b/i);
  if (shortsMatch && Array.from(trimmedTitle).length <= 100) {
    return trimmedTitle;
  }

  const baseTitle = shortsMatch
    ? trimmedTitle.replace(/#shorts\b/gi, '').replace(/\s+/g, ' ').trim()
    : trimmedTitle;
  const titleCharacters = Array.from(baseTitle);
  const suffix = ` ${SHORTS_TITLE_SUFFIX}`;
  const maxTitleCharacters = 100 - Array.from(suffix).length;
  return `${titleCharacters.slice(0, maxTitleCharacters).join('').trimEnd()}${suffix}`;
}

function appendDescriptionHashtags(description) {
  const missingHashtags = DESCRIPTION_HASHTAGS.filter((hashtag) =>
    !new RegExp(`(^|\\s)${hashtag.replace('#', '\\#')}(?=\\s|$)`, 'i').test(description),
  );
  if (missingHashtags.length === 0) {
    return description.trim();
  }

  const hashtags = missingHashtags.join(' ');
  const separator = description.trim() ? '\n\n' : '';
  const availableLength = 5000 - separator.length - hashtags.length;
  const body = description.trim().slice(0, availableLength).trimEnd();
  return `${body}${body ? separator : ''}${hashtags}`;
}

export async function uploadVideoToYouTube(
  channelId,
  { filePath, title, description, tags },
  { privacyStatus: requestedPrivacyStatus } = {},
) {
  const credential = await YouTubeCredential.findOne({ channelId }).lean();
  if (!credential) {
    const error = new Error('YouTube channel is not connected. Connect it in Settings before publishing.');
    error.statusCode = 401;
    throw error;
  }
  if (!credential.grantedScopes?.includes(UPLOAD_SCOPE)) {
    const error = new Error('YouTube upload permission is missing. Reconnect this channel in Settings and approve the new upload permission.');
    error.statusCode = 403;
    throw error;
  }
  if (!title?.trim()) {
    throw new Error('YouTube video title must contain 1-100 characters.');
  }
  if (typeof description !== 'string' || description.length > 5000) {
    throw new Error('YouTube video description must not exceed 5,000 characters.');
  }
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
    throw new Error('YouTube video tags must be an array of strings.');
  }
  const uploadTitle = appendShortsTitle(title);
  const uploadDescription = appendDescriptionHashtags(description);
  if (!uploadTitle || Array.from(uploadTitle).length > 100) {
    throw new Error('YouTube video title must contain 1-100 characters.');
  }
  const uploadTags = [];
  let tagCharacters = 0;
  for (const tag of tags.map((value) => value.trim()).filter(Boolean)) {
    if (uploadTags.length === 30 || tagCharacters + tag.length > 500) {
      break;
    }
    uploadTags.push(tag);
    tagCharacters += tag.length;
  }

  const videoFile = await stat(filePath).catch((cause) => {
    throw new Error(`Rendered video file is unavailable: ${cause.message}`, { cause });
  });
  if (!videoFile.isFile() || videoFile.size === 0) {
    throw new Error('Rendered video file is empty or invalid.');
  }

  const privacyStatus = requestedPrivacyStatus || process.env.YOUTUBE_UPLOAD_PRIVACY || 'public';
  if (!['private', 'unlisted', 'public'].includes(privacyStatus)) {
    throw new Error('YOUTUBE_UPLOAD_PRIVACY must be private, unlisted, or public.');
  }
  const categoryId = process.env.YOUTUBE_CATEGORY_ID || '22';
  if (!/^\d+$/.test(categoryId)) {
    throw new Error('YOUTUBE_CATEGORY_ID must contain only digits.');
  }
  const madeForKidsSetting = process.env.YOUTUBE_MADE_FOR_KIDS || 'false';
  if (!['true', 'false'].includes(madeForKidsSetting.toLowerCase())) {
    throw new Error('YOUTUBE_MADE_FOR_KIDS must be true or false.');
  }
  const auth = await getAuthorizedYouTubeClient(channelId);
  const youtube = google.youtube({ version: 'v3', auth });
  console.info('[youtube] Uploading video...');
  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: uploadTitle,
        description: uploadDescription,
        categoryId,
        tags: uploadTags,
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: madeForKidsSetting.toLowerCase() === 'true',
      },
    },
    media: {
      body: createReadStream(filePath),
    },
  });

  const videoId = response.data.id;
  if (!videoId) {
    throw new Error('YouTube upload completed without returning a video ID.');
  }
  console.info(`[youtube] Upload complete: ${videoId}`);
  return {
    videoId,
    title: response.data.snippet?.title ?? uploadTitle,
    privacyStatus: response.data.status?.privacyStatus ?? privacyStatus,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
  };
}
