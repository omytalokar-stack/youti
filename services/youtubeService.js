import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { google } from 'googleapis';
import YouTubeCredential from '../models/YouTubeCredential.js';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

function invalidOAuthState(message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.statusCode = 400;
  return error;
}

function getOAuthClient() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REDIRECT_URI) {
    throw new Error('YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI are required.');
  }
  return new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI);
}

function getStateSecret() {
  if (!process.env.OAUTH_STATE_SECRET) {
    throw new Error('OAUTH_STATE_SECRET is required to protect the OAuth flow.');
  }
  return process.env.OAUTH_STATE_SECRET;
}

function getEncryptionKey() {
  const encodedKey = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
  if (!encodedKey || !/^[\da-f]{64}$/i.test(encodedKey)) {
    throw new Error('YOUTUBE_TOKEN_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters.');
  }
  return Buffer.from(encodedKey, 'hex');
}

function signState(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', getStateSecret()).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyState(state) {
  if (typeof state !== 'string') {
    throw invalidOAuthState('Missing OAuth state.');
  }
  const [encodedPayload, providedSignature, ...extra] = state.split('.');
  if (!encodedPayload || !providedSignature || extra.length) {
    throw invalidOAuthState('Invalid OAuth state.');
  }
  const expectedSignature = createHmac('sha256', getStateSecret()).update(encodedPayload).digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(providedSignature, 'base64url');
  } catch {
    throw invalidOAuthState('Invalid OAuth state signature.');
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    throw invalidOAuthState('Invalid OAuth state signature.');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch (error) {
    throw invalidOAuthState('Invalid OAuth state payload.', error);
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    (payload.channelId !== undefined && (typeof payload.channelId !== 'string' || !payload.channelId)) ||
    typeof payload.nonce !== 'string' ||
    !payload.nonce ||
    typeof payload.issuedAt !== 'number' ||
    Date.now() - payload.issuedAt > 10 * 60 * 1000 ||
    payload.issuedAt > Date.now() + 60 * 1000
  ) {
    throw invalidOAuthState('OAuth state is invalid or expired.');
  }
  return payload;
}

function encryptRefreshToken(refreshToken) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  return {
    refreshTokenEncrypted: encrypted.toString('base64'),
    refreshTokenIv: iv.toString('base64'),
    refreshTokenTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptRefreshToken(credential) {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(credential.refreshTokenIv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(credential.refreshTokenTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(credential.refreshTokenEncrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function generateAuthUrl(channelId) {
  const oauth2Client = getOAuthClient();
  const state = signState({
    ...(channelId ? { channelId } : {}),
    issuedAt: Date.now(),
    nonce: randomBytes(16).toString('hex'),
  });
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: YOUTUBE_SCOPES,
    state,
  });
}

export async function exchangeCodeAndStoreToken(code, state) {
  const statePayload = verifyState(state);
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const response = await youtube.channels.list({
    part: ['snippet', 'statistics'],
    mine: true,
    maxResults: 50,
  });
  const channels = response.data.items ?? [];
  const matchingChannel = statePayload.channelId
    ? channels.filter((channel) => channel.id === statePayload.channelId)
    : channels;
  if (!matchingChannel.length) {
    const error = new Error('No YouTube channel was found for this Google account.');
    error.statusCode = 404;
    throw error;
  }

  for (const channel of matchingChannel) {
    const existingCredential = await YouTubeCredential.findOne({ channelId: channel.id });
    const refreshToken = tokens.refresh_token ?? (
      existingCredential ? decryptRefreshToken(existingCredential) : null
    );
    if (!refreshToken) {
      throw new Error('Google did not return a refresh token. Revoke the app access and try connecting again.');
    }

    await YouTubeCredential.findOneAndUpdate(
      { channelId: channel.id },
      {
        $set: {
          channelId: channel.id,
          grantedScopes: (tokens.scope || YOUTUBE_SCOPES.join(' ')).split(/\s+/).filter(Boolean),
          ...encryptRefreshToken(refreshToken),
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  return {
    channels: matchingChannel.map((channel) => ({
      channelId: channel.id,
      title: channel.snippet?.title ?? '',
    })),
  };
}

export async function getAuthorizedYouTubeClient(channelId) {
  const credential = await YouTubeCredential.findOne({ channelId });
  if (!credential) {
    const error = new Error('This channel has not completed YouTube OAuth. Connect it first.');
    error.statusCode = 401;
    throw error;
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: decryptRefreshToken(credential) });
  return oauth2Client;
}

export async function listConnectedChannels() {
  const credentials = await YouTubeCredential.find({}, { channelId: 1 }).lean();
  return Promise.all(credentials.map((credential) => fetchChannelSummary(credential.channelId)));
}

export async function disconnectChannel(channelId) {
  const result = await YouTubeCredential.deleteOne({ channelId });
  return result.deletedCount > 0;
}

function toNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function isYouTubeAnalyticsApiDisabled(error) {
  const apiError = error?.response?.data?.error;
  const status = error?.response?.status ?? error?.code;
  const reasons = apiError?.errors?.map(({ reason }) => reason) ?? [];
  const message = apiError?.message ?? error?.message ?? '';
  return Number(status) === 403 && (
    reasons.includes('SERVICE_DISABLED') ||
    reasons.includes('accessNotConfigured') ||
    (message.includes('has not been used in project') && message.includes('or it is disabled'))
  );
}

export async function fetchChannelSummary(channelId) {
  const auth = await getAuthorizedYouTubeClient(channelId);
  const youtube = google.youtube({ version: 'v3', auth });
  const response = await youtube.channels.list({
    part: ['snippet', 'statistics'],
    id: [channelId],
  });
  const channel = response.data.items?.[0];
  if (!channel) {
    const error = new Error(`YouTube channel ${channelId} was not found or is unavailable.`);
    error.statusCode = 404;
    throw error;
  }

  return {
    channelId,
    title: channel.snippet?.title ?? '',
    description: channel.snippet?.description ?? '',
    totalViews: toNumber(channel.statistics?.viewCount),
    totalSubscribers: channel.statistics?.hiddenSubscriberCount
      ? null
      : toNumber(channel.statistics?.subscriberCount),
    totalVideos: toNumber(channel.statistics?.videoCount),
  };
}

export async function fetchVideoAnalytics(channelId) {
  const auth = await getAuthorizedYouTubeClient(channelId);
  const analytics = google.youtubeAnalytics({ version: 'v2', auth });
  const endDate = new Date().toISOString().slice(0, 10);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 90);
  const startDate = start.toISOString().slice(0, 10);
  const rows = [];
  const pageSize = 200;
  const maxRows = 1000;
  for (let startIndex = 1; startIndex <= maxRows; startIndex += pageSize) {
    let response;
    try {
      response = await analytics.reports.query({
        ids: `channel==${channelId}`,
        startDate,
        endDate,
        metrics: 'views,subscribersGained,subscribersLost,estimatedMinutesWatched',
        dimensions: 'video',
        sort: '-views',
        maxResults: pageSize,
        startIndex,
      });
    } catch (error) {
      if (isYouTubeAnalyticsApiDisabled(error)) {
        const message = 'YouTube Analytics API is disabled for the Google Cloud project used by this app. Enable it in Google Cloud Console, wait a few minutes, then refresh analytics.';
        const configurationError = new Error(message, { cause: error });
        configurationError.statusCode = 503;
        configurationError.publicMessage = message;
        throw configurationError;
      }
      throw error;
    }
    const page = response.data.rows ?? [];
    rows.push(...page);
    if (page.length < pageSize || rows.length >= maxRows) {
      break;
    }
  }

  return rows.map(([videoId, views, subscribersGained, subscribersLost, estimatedMinutesWatched]) => ({
    videoId,
    views: toNumber(views),
    subscribersGained: toNumber(subscribersGained),
    subscribersLost: toNumber(subscribersLost),
    watchTimeHours: toNumber(estimatedMinutesWatched) / 60,
  }));
}

export async function fetchVideoCatalog(channelId) {
  const auth = await getAuthorizedYouTubeClient(channelId);
  const youtube = google.youtube({ version: 'v3', auth });
  const channelResponse = await youtube.channels.list({
    part: ['contentDetails'],
    id: [channelId],
  });
  const uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    return [];
  }

  const playlistResponse = await youtube.playlistItems.list({
    part: ['snippet'],
    playlistId: uploadsPlaylistId,
    maxResults: 10,
  });
  const playlistVideos = (playlistResponse.data.items ?? [])
    .map((item) => ({
      videoId: item.snippet?.resourceId?.videoId ?? '',
      title: item.snippet?.title ?? '',
      thumbnail: item.snippet?.thumbnails?.high?.url
        ?? item.snippet?.thumbnails?.medium?.url
        ?? item.snippet?.thumbnails?.default?.url
        ?? '',
      uploadDate: item.snippet?.publishedAt ?? null,
    }))
    .filter((item) => item.videoId);
  const videoIds = playlistVideos.map((video) => video.videoId);
  if (!videoIds.length) {
    return [];
  }

  const videosResponse = await youtube.videos.list({
    part: ['snippet', 'statistics'],
    id: videoIds,
  });
  const videoDetails = new Map((videosResponse.data.items ?? []).map((video) => [video.id, video]));

  return playlistVideos.map((playlistVideo) => {
    const video = videoDetails.get(playlistVideo.videoId);
    return {
      ...playlistVideo,
      title: video?.snippet?.title ?? playlistVideo.title,
      thumbnail: video?.snippet?.thumbnails?.maxres?.url
        ?? video?.snippet?.thumbnails?.high?.url
        ?? video?.snippet?.thumbnails?.medium?.url
        ?? video?.snippet?.thumbnails?.default?.url
        ?? playlistVideo.thumbnail,
      uploadDate: video?.snippet?.publishedAt ?? playlistVideo.uploadDate,
      views: toNumber(video?.statistics?.viewCount),
      likes: toNumber(video?.statistics?.likeCount),
    };
  });
}
