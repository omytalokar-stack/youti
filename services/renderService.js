import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpeg from 'fluent-ffmpeg';
import { fitSubtitleBeatsToDuration } from './subtitleTiming.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKGROUND_DIRECTORY = path.join(PROJECT_ROOT, 'assets', 'backgrounds');
const SFX_DIRECTORY = path.join(PROJECT_ROOT, 'assets', 'sfx');
const AUDIO_DIRECTORY = path.join(PROJECT_ROOT, 'assets', 'audio');
const FONT_DIRECTORY = path.join(PROJECT_ROOT, 'assets', 'fonts');
const TEMP_DIRECTORY = path.join(PROJECT_ROOT, 'temp');
const MAX_DURATION_SECONDS = 20;
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FALLBACK_BACKGROUND = "color=c=black:s=540x960:r=30,format=rgb24,geq=r='10+25*Y/960':g='12+12*Y/960':b='24+36*Y/960',noise=alls=3:allf=t+u,vignette=PI/4,format=yuv420p";
const executeFile = promisify(execFile);

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}
if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
}

async function listFiles(directory, extensions) {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(directory, entry.name));
}

async function createFallbackBackground(outputPath) {
  const ffmpegPath = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  try {
    await executeFile(ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', FALLBACK_BACKGROUND,
      '-t', '4',
      '-an',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      outputPath,
    ], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`Could not create fallback gradient background: ${error.message}`, { cause: error });
  }
}

function escapeFilterPath(filePath) {
  return path.resolve(filePath)
    .replaceAll('\\', '/')
    .replaceAll(':', '\\:')
    .replaceAll("'", "\\'")
    .replaceAll(',', '\\,');
}

function escapeAssText(text) {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('\r', '')
    .replaceAll('\n', '\\N');
}

function formatAssTime(value) {
  const centiseconds = Math.round(value * 100);
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const remainder = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainder).padStart(2, '0')}`;
}

function highlightBeat(text, highlightedWord, index) {
  const escapedText = escapeAssText(text.toUpperCase());
  const escapedWord = escapeAssText(highlightedWord.toUpperCase());
  const wordIndex = escapedText.toUpperCase().indexOf(escapedWord.toUpperCase());
  if (wordIndex < 0) {
    return escapedText;
  }

  const before = escapedText.slice(0, wordIndex);
  const word = escapedText.slice(wordIndex, wordIndex + escapedWord.length);
  const after = escapedText.slice(wordIndex + escapedWord.length);
  const highlightColor = index % 2 === 0 ? '&H0000E6FF&' : '&H0066FF00&';
  return `${before}{\\c${highlightColor}\\b1}${word}{\\rDefault}${after}`;
}

function splitHookLines(hook) {
  const words = hook.trim().split(/\s+/);
  if (words.length < 2 || hook.length <= 28) {
    return hook;
  }

  const midpoint = Math.ceil(words.length / 2);
  return `${words.slice(0, midpoint).join(' ')}\n${words.slice(midpoint).join(' ')}`;
}

function createAssContent(subtitleBeats, hook) {
  const fontName = (process.env.SUBTITLE_FONT || 'Noto Sans Devanagari').replaceAll(',', '');
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${VIDEO_WIDTH}`,
    `PlayResY: ${VIDEO_HEIGHT}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${fontName},80,&H00FFFFFF,&H0000E6FF,&H00101010,&H64000000,-1,0,0,0,100,100,0,0,1,6,2,2,70,70,280,1`,
    `Style: Hook,${fontName},118,&H0000E6FF,&H0000E6FF,&H00000000,&HC8000000,-1,0,0,0,100,100,1,0,3,12,0,5,60,60,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const hookEvent = hook?.trim()
    ? `Dialogue: 1,0:00:00.00,0:00:00.50,Hook,,0,0,0,,{\\an5\\pos(540,850)}${escapeAssText(splitHookLines(hook.toUpperCase()))}`
    : null;
  const events = subtitleBeats.map((beat, index) =>
    `Dialogue: 0,${formatAssTime(beat.start)},${formatAssTime(beat.end)},Default,,0,0,0,,${highlightBeat(beat.text, beat.highlightedWord, index)}`,
  );
  if (hookEvent) {
    events.unshift(hookEvent);
  }
  return `${header.concat(events).join('\n')}\n`;
}

function probeDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) {
        reject(new Error(`Could not inspect rendered video duration: ${error.message}`, { cause: error }));
        return;
      }
      const duration = Number(metadata.format?.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('FFprobe did not report a valid rendered video duration.'));
        return;
      }
      resolve(duration);
    });
  });
}

function getFfmpegFilters() {
  const ffmpegPath = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, ['-filters'], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

export async function assertFfmpegAvailable() {
  try {
    const filters = await getFfmpegFilters();
    if (!/^\s*[.\w]{2,3}\s+subtitles\s+V->V\b/m.test(filters)) {
      throw new Error('The installed FFmpeg build does not include the subtitles/libass filter.');
    }
  } catch (error) {
    throw new Error(
      `FFmpeg is required to render videos. Install an FFmpeg build with libass, or set FFMPEG_PATH and FFPROBE_PATH. ${error.message}`,
      { cause: error },
    );
  }
}

export async function renderShort({ voiceoverPath, hook, subtitleBeats, outputPath }) {
  if (!Array.isArray(subtitleBeats) || subtitleBeats.length === 0) {
    throw new Error('At least one timestamped subtitle beat is required to render a Short.');
  }
  const voiceover = await stat(voiceoverPath).catch((error) => {
    throw new Error(`Voiceover file is unavailable: ${error.message}`, { cause: error });
  });
  if (!voiceover.isFile() || voiceover.size === 0) {
    throw new Error('Voiceover file is empty or invalid.');
  }

  await assertFfmpegAvailable();
  const voiceDurationSeconds = await probeDuration(voiceoverPath);
  if (voiceDurationSeconds > MAX_DURATION_SECONDS) {
    throw new Error(`Voiceover is ${voiceDurationSeconds.toFixed(1)} seconds long; Shorts are limited to ${MAX_DURATION_SECONDS} seconds.`);
  }
  const fittedSubtitleBeats = fitSubtitleBeatsToDuration(subtitleBeats, voiceDurationSeconds);
  if (fittedSubtitleBeats !== subtitleBeats) {
    console.warn('[render] Scaled subtitle timings to match the generated voiceover duration.');
  }
  await mkdir(TEMP_DIRECTORY, { recursive: true });
  await mkdir(FONT_DIRECTORY, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });
  const subtitlePath = path.join(TEMP_DIRECTORY, `subtitles-${randomUUID()}.ass`);
  let fallbackBackgroundPath;

  try {
    await writeFile(subtitlePath, createAssContent(fittedSubtitleBeats, hook), 'utf8');
    const backgrounds = await listFiles(BACKGROUND_DIRECTORY, new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']));
    const audioExtensions = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
    const [soundEffects, audioTracks] = await Promise.all([
      listFiles(SFX_DIRECTORY, audioExtensions),
      listFiles(AUDIO_DIRECTORY, audioExtensions),
    ]);
    let background = backgrounds.length
      ? backgrounds[Math.floor(Math.random() * backgrounds.length)]
      : null;
    if (!background) {
      fallbackBackgroundPath = path.join(TEMP_DIRECTORY, `gradient-${randomUUID()}.mp4`);
      await createFallbackBackground(fallbackBackgroundPath);
      background = fallbackBackgroundPath;
    }
    const allAudioFiles = [...soundEffects, ...audioTracks];
    const musicFilePattern = /(?:ambient|bgm|music|suspense|tension)/i;
    const backgroundMusicFiles = allAudioFiles.filter((file) =>
      musicFilePattern.test(path.basename(file)),
    );
    const backgroundMusic = backgroundMusicFiles.length
      ? backgroundMusicFiles[Math.floor(Math.random() * backgroundMusicFiles.length)]
      : null;
    const hookEffects = allAudioFiles.filter((file) => {
      const name = path.basename(file);
      return /(?:whoosh|bass|thud|impact|hook)/i.test(name) || /(?:^|[-_.\s])hit(?:$|[-_.\s])/i.test(name);
    });
    const fallbackSoundEffects = soundEffects.filter((file) => !musicFilePattern.test(path.basename(file)));
    const soundEffect = hookEffects.length
      ? hookEffects[Math.floor(Math.random() * hookEffects.length)]
      : fallbackSoundEffects.length
        ? fallbackSoundEffects[Math.floor(Math.random() * fallbackSoundEffects.length)]
        : null;
    const subtitleFilter = `subtitles=filename='${escapeFilterPath(subtitlePath)}':fontsdir='${escapeFilterPath(FONT_DIRECTORY)}'`;
    const videoFilter = `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},fps=30,zoompan=z='min(zoom+0.0004,1.08)':d=1:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=30,${subtitleFilter}[vout]`;
    const command = ffmpeg();

    command.input(background).inputOptions(['-stream_loop', '-1']);
    command.input(voiceoverPath);
    const audioFilters = ['[1:a]aresample=44100,volume=1[voice]'];
    let mixInput = '[voice]';
    let inputIndex = 2;
    if (backgroundMusic) {
      command.input(backgroundMusic).inputOptions(['-stream_loop', '-1']);
      audioFilters.push(`[${inputIndex}:a]aresample=44100,volume=0.126[bgm]`);
      audioFilters.push(`${mixInput}[bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[voicebgm]`);
      mixInput = '[voicebgm]';
      inputIndex += 1;
    }
    if (soundEffect) {
      command.input(soundEffect);
      audioFilters.push(`[${inputIndex}:a]aresample=44100,atrim=duration=1.5,asetpts=PTS-STARTPTS,volume=0.8[sfx]`);
      audioFilters.push(`${mixInput}[sfx]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`);
    } else {
      audioFilters.push(`${mixInput}alimiter=limit=0.95[aout]`);
    }

    await new Promise((resolve, reject) => {
      command
        .complexFilter([videoFilter, ...audioFilters])
        .outputOptions([
          '-map', '[vout]',
          '-map', '[aout]',
          '-t', String(MAX_DURATION_SECONDS),
          '-shortest',
          '-r', '30',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
        ])
        .on('error', (error) => reject(new Error(`FFmpeg render failed: ${error.message}`, { cause: error })))
        .on('end', resolve)
        .save(outputPath);
    });

    const result = await stat(outputPath);
    if (!result.isFile() || result.size === 0) {
      throw new Error('FFmpeg completed without creating a valid video file.');
    }
    const durationSeconds = await probeDuration(outputPath);
    if (durationSeconds > MAX_DURATION_SECONDS + 0.25) {
      throw new Error(`Rendered video exceeds the ${MAX_DURATION_SECONDS}-second duration limit.`);
    }
    return { outputPath, durationSeconds };
  } finally {
    await Promise.all([
      rm(subtitlePath, { force: true }),
      ...(fallbackBackgroundPath ? [rm(fallbackBackgroundPath, { force: true })] : []),
    ]);
  }
}
