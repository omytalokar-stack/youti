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

async function findBoldFont() {
  const assetFonts = await listFiles(FONT_DIRECTORY, new Set(['.ttf', '.otf', '.ttc']));
  const boldAsset = assetFonts.find((filePath) => /(?:bold|heavy|black|semibold)/i.test(path.basename(filePath)));
  if (boldAsset) {
    return boldAsset;
  }

  const systemFonts = process.platform === 'win32'
    ? [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arialbd.ttf')]
    : [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
      ];
  for (const fontPath of systemFonts) {
    try {
      if ((await stat(fontPath)).isFile()) {
        return fontPath;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return null;
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

async function createFallbackAudio(outputPath, type) {
  const ffmpegPath = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const musicFilter = [
    '[0:a]volume=0.22[tone1]',
    '[1:a]volume=0.12[tone2]',
    '[2:a]volume=0.05[tone3]',
    '[tone1][tone2][tone3]amix=inputs=3:duration=longest:normalize=0,lowpass=f=220,afade=t=in:st=0:d=1,afade=t=out:st=19:d=1[aout]',
  ].join(';');
  const effectFilter = [
    '[0:a]highpass=f=400,lowpass=f=8000,afade=t=in:st=0:d=0.08,afade=t=out:st=0.08:d=1.12,volume=2[noise]',
    '[1:a]lowpass=f=160,afade=t=out:st=0:d=0.35,volume=1.4[thump]',
    '[noise][thump]amix=inputs=2:duration=longest:normalize=0[aout]',
  ].join(';');
  const args = type === 'music'
    ? [
        '-y',
        '-f', 'lavfi', '-i', 'sine=frequency=55:sample_rate=44100:duration=20',
        '-f', 'lavfi', '-i', 'sine=frequency=82.41:sample_rate=44100:duration=20',
        '-f', 'lavfi', '-i', 'sine=frequency=110:sample_rate=44100:duration=20',
        '-filter_complex', musicFilter,
      ]
    : [
        '-y',
        '-f', 'lavfi', '-i', 'anoisesrc=color=white:sample_rate=44100:duration=1.2',
        '-f', 'lavfi', '-i', 'sine=frequency=90:sample_rate=44100:duration=0.35',
        '-filter_complex', effectFilter,
      ];
  try {
    await executeFile(ffmpegPath, [
      ...args,
      '-map', '[aout]',
      '-c:a', 'libmp3lame',
      '-b:a', '96k',
      outputPath,
    ], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`Could not create fallback ${type === 'music' ? 'background music' : 'hook sound effect'}: ${error.message}`, { cause: error });
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

function wrapSubtitleText(text) {
  const maxLineLength = 18;
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxLineLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines.join('\n');
}

function highlightBeat(text, highlightedWord) {
  const escapedText = escapeAssText(wrapSubtitleText(text).toUpperCase());
  const escapedWord = escapeAssText(highlightedWord.toUpperCase());
  const wordIndex = escapedText.toUpperCase().indexOf(escapedWord.toUpperCase());
  if (wordIndex < 0) {
    return escapedText;
  }

  const before = escapedText.slice(0, wordIndex);
  const word = escapedText.slice(wordIndex, wordIndex + escapedWord.length);
  const after = escapedText.slice(wordIndex + escapedWord.length);
  return `${before}{\\c&H0000E6FF&\\b1}${word}{\\rDefault}${after}`;
}

function splitHookLines(hook) {
  const normalized = hook
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase();
  const characters = Array.from(normalized);
  const concise = characters.length > 40
    ? `${characters.slice(0, 37).join('').trimEnd()}...`
    : normalized;
  const words = concise.split(/\s+/);
  if (words.length < 2 || concise.length <= 20) {
    return concise;
  }

  let firstLine = '';
  let secondLine = '';
  for (const word of words) {
    if (!firstLine || `${firstLine} ${word}`.length <= 17) {
      firstLine = firstLine ? `${firstLine} ${word}` : word;
    } else if (!secondLine || `${secondLine} ${word}`.length <= 17) {
      secondLine = secondLine ? `${secondLine} ${word}` : word;
    } else {
      secondLine = `${Array.from(secondLine).slice(0, 14).join('').trimEnd()}...`;
      break;
    }
  }
  return secondLine ? `${firstLine}\n${secondLine}` : firstLine;
}

function createAssContent(subtitleBeats) {
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
    `Style: Default,${fontName},82,&H00FFFFFF,&H0000E6FF,&H00101010,&H64000000,-1,0,0,0,100,100,0,0,1,6,2,2,70,70,650,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events = subtitleBeats.map((beat) =>
    `Dialogue: 0,${formatAssTime(beat.start)},${formatAssTime(beat.end)},Default,,0,0,0,,${highlightBeat(beat.text, beat.highlightedWord)}`,
  );
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
    if (
      !/^\s*[.\w]{2,3}\s+subtitles\s+V->V\b/m.test(filters) ||
      !/^\s*[.\w]{2,3}\s+drawtext\s+V->V\b/m.test(filters)
    ) {
      throw new Error('The installed FFmpeg build must include both the subtitles/libass and drawtext filters.');
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
  let hookTextPath;
  const generatedAudioPaths = [];

  try {
    await writeFile(subtitlePath, createAssContent(fittedSubtitleBeats), 'utf8');
    hookTextPath = path.join(TEMP_DIRECTORY, `hook-${randomUUID()}.txt`);
    await writeFile(hookTextPath, splitHookLines(hook?.trim() || fittedSubtitleBeats[0].text), 'utf8');
    const boldFontPath = await findBoldFont();
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
    let backgroundMusic = backgroundMusicFiles.length
      ? backgroundMusicFiles[Math.floor(Math.random() * backgroundMusicFiles.length)]
      : null;
    if (!backgroundMusic) {
      backgroundMusic = path.join(TEMP_DIRECTORY, `fallback-bgm-${randomUUID()}.mp3`);
      generatedAudioPaths.push(backgroundMusic);
      await createFallbackAudio(backgroundMusic, 'music');
    }
    const hookEffects = soundEffects.filter((file) => {
      const name = path.basename(file);
      return /(?:whoosh|bass|thud|impact|hook)/i.test(name) || /(?:^|[-_.\s])hit(?:$|[-_.\s])/i.test(name);
    });
    let soundEffect = hookEffects.length
      ? hookEffects[Math.floor(Math.random() * hookEffects.length)]
      : soundEffects.length
        ? soundEffects[Math.floor(Math.random() * soundEffects.length)]
        : null;
    if (!soundEffect) {
      soundEffect = path.join(TEMP_DIRECTORY, `fallback-whoosh-${randomUUID()}.mp3`);
      generatedAudioPaths.push(soundEffect);
      await createFallbackAudio(soundEffect, 'effect');
    }
    const subtitleFilter = `subtitles=filename='${escapeFilterPath(subtitlePath)}':fontsdir='${escapeFilterPath(FONT_DIRECTORY)}'`;
    const hookFont = boldFontPath
      ? `fontfile='${escapeFilterPath(boldFontPath)}'`
      : "font='Sans'";
    const hookCardFilter = `drawbox=x=54:y=518:w=972:h=300:color=black@0.7:t=fill:enable='between(t,0,0.6)',drawtext=${hookFont}:textfile='${escapeFilterPath(hookTextPath)}':text_align=center:fontcolor=0xFFE600:fontsize=82:borderw=4:bordercolor=black:shadowcolor=black@0.85:shadowx=4:shadowy=6:x=(w-text_w)/2:y=h*0.27+(300-text_h)/2:line_spacing=12:enable='between(t,0,0.6)'`;
    const videoFilter = `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},fps=30,zoompan=z='1+0.06*mod(floor(on/81),2)':d=1:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=30,${hookCardFilter},${subtitleFilter}[vout]`;
    const command = ffmpeg();

    command.input(background).inputOptions(['-stream_loop', '-1']);
    command.input(voiceoverPath);
    command.input(backgroundMusic).inputOptions(['-stream_loop', '-1']);
    command.input(soundEffect);
    const audioFilters = [
      '[1:a]aresample=44100,volume=1[voice]',
      '[2:a]aresample=44100,volume=0.10[bgm]',
      '[3:a]aresample=44100,atrim=duration=1.5,asetpts=PTS-STARTPTS,volume=0.85[sfx]',
      '[voice][bgm][sfx]amix=inputs=3:duration=first:dropout_transition=2:normalize=0,alimiter=limit=0.95[aout]',
    ];

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
        .on('error', (error, stdout, stderr) => {
          const diagnostic = typeof stderr === 'string'
            ? stderr.split(/\r?\n/).filter(Boolean).slice(-35).join('\n')
            : '';
          reject(new Error(`FFmpeg render failed: ${error.message}${diagnostic ? `\n${diagnostic}` : ''}`, { cause: error }));
        })
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
      ...(hookTextPath ? [rm(hookTextPath, { force: true })] : []),
      ...(fallbackBackgroundPath ? [rm(fallbackBackgroundPath, { force: true })] : []),
      ...generatedAudioPaths.map((filePath) => rm(filePath, { force: true })),
    ]);
  }
}
