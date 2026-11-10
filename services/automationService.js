import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import BrainMemory from '../models/BrainMemory.js';
import VideoLog from '../models/VideoLog.js';
import YouTubeCredential from '../models/YouTubeCredential.js';
import { generateAutomatedShort } from './geminiService.js';
import { assertFfmpegAvailable, renderShort } from './renderService.js';
import { generateVoiceover } from './ttsService.js';
import { fetchChannelSummary } from './youtubeService.js';
import { uploadVideoToYouTube } from './youtubeUploadService.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_DIRECTORY = path.join(PROJECT_ROOT, 'temp');
const RENDERS_DIRECTORY = path.join(PROJECT_ROOT, 'renders');
const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

export async function publishAutomatedShort(channelId, { privacyStatus } = {}) {
  const credential = await YouTubeCredential.findOne({ channelId }).lean();
  if (!credential) {
    const error = new Error('YouTube channel is not connected.');
    error.statusCode = 401;
    throw error;
  }
  if (!credential.grantedScopes?.includes(UPLOAD_SCOPE)) {
    const error = new Error('Upload permission has not been granted for this channel. Reconnect it in Settings before automation can publish.');
    error.statusCode = 403;
    throw error;
  }

  await mkdir(TEMP_DIRECTORY, { recursive: true });
  await mkdir(RENDERS_DIRECTORY, { recursive: true });
  const voiceoverPath = path.join(TEMP_DIRECTORY, `voiceover-${randomUUID()}.mp3`);
  const renderPath = path.join(RENDERS_DIRECTORY, 'short_output.mp4');

  try {
    await assertFfmpegAvailable();
    const memory = await BrainMemory.findOneAndUpdate(
      { channelId },
      { $setOnInsert: { channelId } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    const channel = await fetchChannelSummary(channelId);
    const generated = await generateAutomatedShort(memory, channel);
    if (!generated.title.trim() || generated.title.length > 100 || generated.description.length > 5000) {
      throw new Error('Gemini generated YouTube metadata outside the supported title or description length.');
    }
    await generateVoiceover(generated.script, voiceoverPath);
    const rendered = await renderShort({
      voiceoverPath,
      hook: generated.hook,
      subtitleBeats: generated.subtitleBeats,
      outputPath: renderPath,
    });
    const uploaded = await uploadVideoToYouTube(channelId, {
      filePath: rendered.outputPath,
      title: generated.title,
      description: generated.description,
      tags: generated.tags,
    }, { privacyStatus });

    await VideoLog.findOneAndUpdate(
      { channelId, videoId: uploaded.videoId },
      {
        $set: {
          channelId,
          videoId: uploaded.videoId,
          title: uploaded.title,
          hookUsed: generated.hook,
          tags: generated.tags,
          uploadDate: new Date(),
          status: uploaded.privacyStatus,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    memory.lastAutonomousRun = new Date();
    await memory.save();

    return {
      channelId,
      videoId: uploaded.videoId,
      title: uploaded.title,
      url: uploaded.url,
      privacyStatus: uploaded.privacyStatus,
      durationSeconds: rendered.durationSeconds,
      uploadedAt: memory.lastAutonomousRun.toISOString(),
    };
  } finally {
    await rm(voiceoverPath, { force: true });
  }
}
