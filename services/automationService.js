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
import { runPublishStage } from './publishStage.js';
import { fetchRecentVideoTopics } from './scriptService.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_DIRECTORY = path.join(PROJECT_ROOT, 'temp');
const RENDERS_DIRECTORY = path.join(PROJECT_ROOT, 'renders');
const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

export async function publishAutomatedShort(channelId, { privacyStatus } = {}) {
  const credential = await runPublishStage('loading-channel-credentials', () =>
    YouTubeCredential.findOne({ channelId }).lean());
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

  await runPublishStage('preparing-workspace', async () => {
    await mkdir(TEMP_DIRECTORY, { recursive: true });
    await mkdir(RENDERS_DIRECTORY, { recursive: true });
  });
  const voiceoverPath = path.join(TEMP_DIRECTORY, `voiceover-${randomUUID()}.mp3`);
  const renderPath = path.join(RENDERS_DIRECTORY, 'short_output.mp4');

  let pipelineError;
  try {
    await runPublishStage('checking-video-tools', () => assertFfmpegAvailable());
    const memory = await runPublishStage('loading-channel-memory', () => BrainMemory.findOneAndUpdate(
      { channelId },
      { $setOnInsert: { channelId } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ));
    const channel = await runPublishStage('loading-youtube-channel', () => fetchChannelSummary(channelId));
    const recentVideos = await runPublishStage('loading-recent-video-history', () =>
      fetchRecentVideoTopics(channelId));
    const generated = await runPublishStage('generating-short-script', () =>
      generateAutomatedShort(memory, channel, recentVideos));
    await runPublishStage('validating-generated-metadata', async () => {
      if (!generated.title.trim() || generated.title.length > 100 || generated.description.length > 5000) {
        throw new Error('Gemini generated YouTube metadata outside the supported title or description length.');
      }
    });
    await runPublishStage('generating-voiceover', () => generateVoiceover(generated.script, voiceoverPath));
    const rendered = await runPublishStage('rendering-video', () => renderShort({
      voiceoverPath,
      hook: generated.hook,
      subtitleBeats: generated.subtitleBeats,
      outputPath: renderPath,
    }));
    const uploaded = await runPublishStage('uploading-to-youtube', () => uploadVideoToYouTube(channelId, {
      filePath: rendered.outputPath,
      title: generated.title,
      description: generated.description,
      tags: generated.tags,
    }, { privacyStatus }));

    await runPublishStage('saving-upload-record', () => VideoLog.findOneAndUpdate(
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
    ));
    memory.lastAutonomousRun = new Date();
    await runPublishStage('saving-channel-memory', () => memory.save());

    return {
      channelId,
      videoId: uploaded.videoId,
      title: uploaded.title,
      url: uploaded.url,
      privacyStatus: uploaded.privacyStatus,
      durationSeconds: rendered.durationSeconds,
      uploadedAt: memory.lastAutonomousRun.toISOString(),
    };
  } catch (error) {
    pipelineError = error;
    throw error;
  } finally {
    try {
      await runPublishStage('cleaning-temporary-files', () => rm(voiceoverPath, { force: true }));
    } catch (cleanupError) {
      if (pipelineError) {
        console.error('[publish] temporary-file cleanup also failed after the pipeline error.');
        console.error(cleanupError);
      } else {
        throw cleanupError;
      }
    }
  }
}
