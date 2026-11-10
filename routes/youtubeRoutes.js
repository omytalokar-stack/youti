import { Router } from 'express';
import {
  exchangeCodeAndStoreToken,
  fetchChannelSummary,
  fetchVideoCatalog,
  fetchVideoAnalytics,
  generateAuthUrl,
  listConnectedChannels,
  disconnectChannel,
} from '../services/youtubeService.js';

const router = Router();

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function frontendRedirect(query) {
  const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:3000';
  const redirectUrl = new URL(frontendUrl);
  for (const [key, value] of Object.entries(query)) {
    redirectUrl.searchParams.set(key, value);
  }
  return redirectUrl;
}

router.get('/stats/:channelId', asyncHandler(async (req, res) => {
  const [channel, videos, catalog] = await Promise.all([
    fetchChannelSummary(req.params.channelId),
    fetchVideoAnalytics(req.params.channelId),
    fetchVideoCatalog(req.params.channelId),
  ]);
  const catalogById = new Map(catalog.map((video) => [video.videoId, video]));
  const analyticsById = new Map(videos.map((video) => [video.videoId, video]));
  const mergedVideoIds = new Set();
  const mergedVideos = catalog.map((catalogVideo) => {
    mergedVideoIds.add(catalogVideo.videoId);
    const analyticsVideo = analyticsById.get(catalogVideo.videoId);
    return {
      ...analyticsVideo,
      ...catalogVideo,
      subscribersGained: analyticsVideo?.subscribersGained ?? 0,
      subscribersLost: analyticsVideo?.subscribersLost ?? 0,
      watchTimeHours: analyticsVideo?.watchTimeHours ?? 0,
    };
  });
  for (const video of videos) {
    if (!mergedVideoIds.has(video.videoId)) {
      mergedVideos.push({
        ...video,
        ...catalogById.get(video.videoId),
        title: catalogById.get(video.videoId)?.title || video.videoId,
        thumbnail: catalogById.get(video.videoId)?.thumbnail || '',
        uploadDate: catalogById.get(video.videoId)?.uploadDate || null,
      });
    }
  }
  const recentVideoViews = catalog.reduce((total, video) => total + (video.views ?? 0), 0);
  res.json({
    channel: {
      ...channel,
      totalViews: channel.totalViews || recentVideoViews,
    },
    videos: mergedVideos,
  });
}));

router.get('/channels', asyncHandler(async (req, res) => {
  res.json(await listConnectedChannels());
}));

router.delete('/channels/:channelId', asyncHandler(async (req, res) => {
  const deleted = await disconnectChannel(req.params.channelId);
  if (!deleted) {
    return res.status(404).json({ error: 'Connected channel was not found.' });
  }
  return res.json({ disconnected: true });
}));

router.get('/auth-url', (req, res, next) => {
  try {
    const { channelId } = req.query;
    if (channelId !== undefined && (typeof channelId !== 'string' || !channelId.trim())) {
      return res.status(400).json({ error: 'channelId must be a non-empty string when provided.' });
    }
    return res.json({ url: generateAuthUrl(typeof channelId === 'string' ? channelId.trim() : undefined) });
  } catch (error) {
    return next(error);
  }
});

router.get('/oauth2callback', asyncHandler(async (req, res) => {
  if (typeof req.query.error === 'string') {
    return res.redirect(frontendRedirect({ youtubeError: 'Google authorization was denied.' }).toString());
  }
  if (typeof req.query.code !== 'string' || typeof req.query.state !== 'string') {
    return res.status(400).json({ error: 'Google OAuth callback is missing code or state.' });
  }

  try {
    const result = await exchangeCodeAndStoreToken(req.query.code, req.query.state);
    return res.redirect(frontendRedirect({
      youtubeConnected: '1',
      ...(result.channels[0] ? { channelId: result.channels[0].channelId } : {}),
    }).toString());
  } catch (error) {
    if (!Number.isInteger(error.statusCode) || error.statusCode >= 500) {
      console.error('YouTube OAuth callback failed:', error);
    }
    const message = Number.isInteger(error.statusCode) && error.statusCode < 500
      ? error.message
      : 'Could not finish YouTube authorization. Check the backend configuration and logs.';
    return res.redirect(frontendRedirect({ youtubeError: message }).toString());
  }
}));

export default router;
