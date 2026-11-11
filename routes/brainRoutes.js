import { Router } from 'express';
import BrainMemory from '../models/BrainMemory.js';
import { publishAutomatedShort } from '../services/automationService.js';
import { claimChannelLease, releaseChannelLease } from '../services/automationLockService.js';
import { markManualPublishAsScheduledSuccess } from '../services/automationScheduleStateService.js';
import { generateAutomatedShort, generateChatResponse } from '../services/geminiService.js';
import { fetchRecentVideoTopics } from '../services/scriptService.js';
import { fetchChannelSummary } from '../services/youtubeService.js';

const router = Router();

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

router.get('/:channelId', asyncHandler(async (req, res) => {
  const memory = await BrainMemory.findOneAndUpdate(
    { channelId: req.params.channelId },
    { $setOnInsert: { channelId: req.params.channelId } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  res.json(memory);
}));

router.patch('/:channelId', asyncHandler(async (req, res) => {
  const { selfCorrectionMode } = req.body;
  if (typeof selfCorrectionMode !== 'boolean') {
    return res.status(400).json({ error: 'selfCorrectionMode must be a boolean.' });
  }
  const memory = await BrainMemory.findOneAndUpdate(
    { channelId: req.params.channelId },
    {
      $set: { selfCorrectionMode },
      $setOnInsert: { channelId: req.params.channelId },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return res.json(memory);
}));

router.post('/chat', asyncHandler(async (req, res) => {
  const { prompt } = req.body;
  if (!isNonEmptyString(prompt)) {
    return res.status(400).json({ error: 'prompt is required.' });
  }
  if (prompt.length > 20000) {
    return res.status(400).json({ error: 'prompt must not exceed 20,000 characters.' });
  }
  const result = await generateChatResponse(prompt.trim());
  return res.json(result);
}));

router.post('/cycle', asyncHandler(async (req, res) => {
  const { channelId } = req.body;
  if (!isNonEmptyString(channelId)) {
    return res.status(400).json({ error: 'channelId is required.' });
  }

  const memory = await BrainMemory.findOneAndUpdate(
    { channelId: channelId.trim() },
    { $setOnInsert: { channelId: channelId.trim() } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const channel = await fetchChannelSummary(channelId.trim());
  const recentVideos = await fetchRecentVideoTopics(channelId.trim());
  const generated = await generateAutomatedShort(memory, channel, recentVideos);
  memory.lastAutonomousRun = new Date();
  await memory.save();
  return res.json({ generated, memory });
}));

router.post('/publish', asyncHandler(async (req, res) => {
  const { channelId } = req.body;
  if (!isNonEmptyString(channelId)) {
    return res.status(400).json({ error: 'channelId is required.' });
  }

  const normalizedChannelId = channelId.trim();
  const leaseId = await claimChannelLease(normalizedChannelId);
  if (!leaseId) {
    return res.status(409).json({ error: 'A video is already being generated or uploaded for this channel.' });
  }

  try {
    const result = await publishAutomatedShort(normalizedChannelId, { privacyStatus: 'public' });
    try {
      const completedScheduledCycle = await markManualPublishAsScheduledSuccess(normalizedChannelId);
      if (completedScheduledCycle) {
        console.log(`[automation] Manual upload completed the pending scheduled cycle for channel ${normalizedChannelId}.`);
      }
    } catch (error) {
      console.error(`[automation] Manual upload succeeded, but the scheduled cycle could not be marked complete for channel ${normalizedChannelId}:`, error);
    }
    return res.json(result);
  } finally {
    try {
      await releaseChannelLease(normalizedChannelId, leaseId);
    } catch (error) {
      console.error(`[automation] Could not release manual publishing lease for channel ${normalizedChannelId}:`, error);
    }
  }
}));

router.post('/mistake', asyncHandler(async (req, res) => {
  const { channelId, videoId, issue, retentionDropAt = '', ruleUpdated } = req.body;
  if (![channelId, videoId, issue, ruleUpdated].every(isNonEmptyString)) {
    return res.status(400).json({ error: 'channelId, videoId, issue, and ruleUpdated are required.' });
  }
  if (typeof retentionDropAt !== 'string') {
    return res.status(400).json({ error: 'retentionDropAt must be a string.' });
  }

  const memory = await BrainMemory.findOneAndUpdate(
    { channelId: channelId.trim() },
    {
      $setOnInsert: { channelId: channelId.trim() },
      $push: {
        mistakeLogs: {
          videoId: videoId.trim(),
          issue: issue.trim(),
          retentionDropAt: retentionDropAt.trim(),
          ruleUpdated: ruleUpdated.trim(),
        },
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return res.status(201).json(memory);
}));

router.post('/tactic', asyncHandler(async (req, res) => {
  const { channelId, title, impact, description } = req.body;
  if (![channelId, title, impact, description].every(isNonEmptyString)) {
    return res.status(400).json({ error: 'channelId, title, impact, and description are required.' });
  }

  const memory = await BrainMemory.findOneAndUpdate(
    { channelId: channelId.trim() },
    {
      $setOnInsert: { channelId: channelId.trim() },
      $push: {
        provenTactics: {
          title: title.trim(),
          impact: impact.trim(),
          description: description.trim(),
        },
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return res.status(201).json(memory);
}));

export default router;
