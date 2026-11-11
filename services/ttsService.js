import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { sanitizeSpokenText } from './geminiService.js';
import { getGeminiErrorStatus, runGeminiWithFallback } from './geminiApiKeys.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMP_DIRECTORY = path.join(PROJECT_ROOT, 'temp');
const executeFile = promisify(execFile);
const EDGE_TTS_VOICE = 'hi-IN-MadhurNeural';

function providerError(error) {
  const status = getGeminiErrorStatus(error);
  if (status !== 429 && status !== 503 && status !== 504) {
    return error;
  }

  const message = status === 429
    ? 'Gemini text-to-speech quota reached. Check the API quota or try again later.'
    : 'Gemini text-to-speech is temporarily unavailable. Please try again shortly.';
  return Object.assign(new Error(message, { cause: error }), {
    statusCode: status,
    publicMessage: message,
  });
}

function shouldFallbackToEdgeTts(error) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth += 1) {
    const status = getGeminiErrorStatus(current);
    if (status === 400 || status === 429) {
      return true;
    }
    if (typeof current.message === 'string' && /quota.{0,40}exceed|exceed.{0,40}quota|resource[_ ]exhausted/i.test(current.message)) {
      return true;
    }
  }
  return false;
}

async function generateEdgeTtsVoiceover(spokenText, outputPath) {
  const edgeTts = new MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 60000 });
  try {
    await edgeTts.setMetadata(EDGE_TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = edgeTts.toStream(spokenText);
    await pipeline(audioStream, createWriteStream(outputPath));
    const output = await stat(outputPath);
    if (!output.isFile() || output.size === 0) {
      throw new Error('Microsoft Edge TTS returned an empty audio file.');
    }
    return outputPath;
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  } finally {
    edgeTts.close();
  }
}

export async function generateVoiceover(text, outputPath) {
  const spokenText = sanitizeSpokenText(text);
  if (!spokenText) {
    throw new Error('Voiceover text must be a non-empty string.');
  }
  if (!outputPath || path.extname(outputPath).toLowerCase() !== '.mp3') {
    throw new Error('Voiceover output path must use the .mp3 extension.');
  }
  const ttsModel = process.env.GEMINI_TTS_MODEL?.trim() || 'gemini-3.8-flash-tts';
  if (!/(?:^|[-_])tts(?:$|[-_])/i.test(ttsModel)) {
    throw new Error('GEMINI_TTS_MODEL must name an audio-capable TTS model; text-only Gemini models cannot synthesize voiceover.');
  }
  let response;
  try {
    ({ value: response } = await runGeminiWithFallback({
      models: [ttsModel],
      invoke: ({ apiKey, model }) => {
        const client = new GoogleGenAI({
          apiKey,
          httpOptions: {
            timeout: 30000,
            retryOptions: { attempts: 1 },
          },
        });
        return client.models.generateContent({
          model,
          contents: [{
            parts: [{
              text: spokenText,
            }],
          }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: process.env.GEMINI_TTS_VOICE || 'Puck',
                },
              },
            },
          },
        });
      },
    }));
  } catch (error) {
    if (!shouldFallbackToEdgeTts(error)) {
      throw providerError(error);
    }
    console.warn(`[tts] Gemini TTS failed with a quota or request error; using Edge TTS voice ${EDGE_TTS_VOICE}.`);
    await mkdir(TEMP_DIRECTORY, { recursive: true });
    await mkdir(path.dirname(outputPath), { recursive: true });
    try {
      return await generateEdgeTtsVoiceover(spokenText, outputPath);
    } catch (fallbackError) {
      throw new AggregateError(
        [error, fallbackError],
        'Gemini TTS failed and the Microsoft Edge TTS fallback could not generate audio.',
        { cause: fallbackError },
      );
    }
  }

  const audio = response.candidates?.[0]?.content?.parts
    ?.find((part) => part.inlineData?.data)?.inlineData;
  if (!audio?.data || !audio.mimeType) {
    throw new Error('Gemini did not return usable voiceover audio.');
  }

  const mimeType = audio.mimeType.toLowerCase();
  const extension = mimeType.startsWith('audio/wav')
    ? '.wav'
    : mimeType.startsWith('audio/pcm') || mimeType.startsWith('audio/l16')
      ? '.pcm'
      : mimeType.startsWith('audio/mpeg') || mimeType.startsWith('audio/mp3')
        ? '.mp3'
        : null;
  if (!extension) {
    throw new Error(`Gemini returned an unsupported voiceover format: ${audio.mimeType}.`);
  }

  await mkdir(TEMP_DIRECTORY, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });
  const audioPath = path.join(TEMP_DIRECTORY, `voiceover-${randomUUID()}${extension}`);
  try {
    await writeFile(audioPath, Buffer.from(audio.data, 'base64'));
    if (extension === '.mp3') {
      await writeFile(outputPath, await readFile(audioPath));
    } else {
      const ffmpegPath = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      const pcmRate = Number(mimeType.match(/(?:rate|samplerate)=(\d+)/i)?.[1]) || 24000;
      const pcmOptions = extension === '.pcm'
        ? ['-f', 's16le', '-ar', String(pcmRate), '-ac', '1']
        : [];
      try {
        await executeFile(ffmpegPath, [
          '-y',
          ...pcmOptions,
          '-i', audioPath,
          '-vn',
          '-codec:a', 'libmp3lame',
          '-q:a', '4',
          outputPath,
        ], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      } catch (error) {
        throw new Error(`Could not convert Gemini voiceover audio to MP3: ${error.message}`, { cause: error });
      }
    }

    const output = await stat(outputPath);
    if (!output.isFile() || output.size === 0) {
      throw new Error('Text-to-speech returned an empty audio file.');
    }
    return outputPath;
  } finally {
    await rm(audioPath, { force: true });
  }
}
