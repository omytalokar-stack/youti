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
const MAX_DURATION_SECONDS = 25;
const FFMPEG_TIMEOUT_MS = 180 * 1000;
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FALLBACK_BACKGROUND = "color=c=0x202044:s=540x960:r=30,format=rgb24,geq=r='70+38*sin(X/95+T*1.3)+18*sin(Y/130-T*0.7)':g='65+28*sin(X/145-T*0.9)+16*sin(Y/105+T*1.1)':b='110+48*sin(X/165+T*0.8)+22*sin(Y/115-T*1.2)',noise=alls=4:allf=t+u,vignette=PI/4,format=yuv420p";
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

async function createFallbackBackground(outputPath, durationSeconds) {
  const ffmpegPath = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  try {
    await executeFile(ffmpegPath, [
      '-y',
      '-f', 'lavfi',
      '-i', FALLBACK_BACKGROUND,
      '-t', String(durationSeconds),
      '-an',
      '-c:v', 'libx264',
      '-threads', '1',
      '-filter_threads', '1',
      '-filter_complex_threads', '1',
      '-preset', 'ultrafast',
      '-crf', '26',
      '-maxrate', '4M',
      '-bufsize', '2M',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      outputPath,
    ], {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      timeout: FFMPEG_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
  } catch (error) {
    throw new Error(`Could not create fallback gradient background: ${error.message}`, { cause: error });
  }
}

async function createFallbackMusic(outputPath) {
  const ffmpegPath = process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const musicFilter = [
    '[0:a]volume=0.22[tone1]',
    '[1:a]volume=0.12[tone2]',
    '[2:a]volume=0.05[tone3]',
    '[tone1][tone2][tone3]amix=inputs=3:duration=longest:normalize=0,lowpass=f=220,volume=12,afade=t=in:st=0:d=1,afade=t=out:st=24:d=1[aout]',
  ].join(';');
  const args = [
    '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=55:sample_rate=44100:duration=25',
    '-f', 'lavfi', '-i', 'sine=frequency=82.41:sample_rate=44100:duration=25',
    '-f', 'lavfi', '-i', 'sine=frequency=110:sample_rate=44100:duration=25',
    '-filter_complex', musicFilter,
  ];
  try {
    await executeFile(ffmpegPath, [
      ...args,
      '-threads', '1',
      '-filter_threads', '1',
      '-filter_complex_threads', '1',
      '-map', '[aout]',
      '-c:a', 'libmp3lame',
      '-ac', '1',
      '-ar', '44100',
      '-b:a', '96k',
      outputPath,
    ], {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      timeout: FFMPEG_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
  } catch (error) {
    throw new Error(`Could not create fallback background music: ${error.message}`, { cause: error });
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
    execFile(ffmpegPath, ['-filters'], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      timeout: FFMPEG_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    }, (error, stdout) => {
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
      await createFallbackBackground(fallbackBackgroundPath, voiceDurationSeconds);
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
      await createFallbackMusic(backgroundMusic);
    }
    const hookEffects = soundEffects.filter((file) => {
      const name = path.basename(file);
      return /(?:whoosh|bass|thud|impact|hook)/i.test(name) || /(?:^|[-_.\s])hit(?:$|[-_.\s])/i.test(name);
    });
    const soundEffect = hookEffects.length
      ? hookEffects[Math.floor(Math.random() * hookEffects.length)]
      : soundEffects.length
        ? soundEffects[Math.floor(Math.random() * soundEffects.length)]
        : null;
    if (!soundEffect) {
      console.info('[render] No SFX asset found; rendering voiceover with ducked background music only.');
    }
    const subtitleFilter = `subtitles=filename='${escapeFilterPath(subtitlePath)}':fontsdir='${escapeFilterPath(FONT_DIRECTORY)}'`;
    const hookFont = boldFontPath
      ? `fontfile='${escapeFilterPath(boldFontPath)}'`
      : "font='Sans'";
    let hookCardFilter;
    try {
      hookCardFilter = `drawbox=x=54:y=518:w=972:h=300:color=black@0.7:t=fill:enable='between(t,0,0.5)',drawtext=${hookFont}:textfile='${escapeFilterPath(hookTextPath)}':fontcolor=0xFFE600:fontsize=82:borderw=4:bordercolor=black:shadowcolor=black@0.85:shadowx=4:shadowy=6:x=(w-text_w)/2:y=h*0.27+(300-text_h)/2:line_spacing=12:enable='between(t,0,0.5)'`;
    } catch (error) {
      console.warn(`[render] Could not configure the hook card; rendering without it: ${error.message}`);
    }

    const createVideoFilter = (includeHookCard) => {
      const filters = [
        'scale=540:960:force_original_aspect_ratio=increase',
        'crop=540:960',
        'fps=30',
        "zoompan=z='1+0.06*mod(floor(on/81),2)':d=1:s=540x960:fps=30",
        `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`,
      ];
      if (includeHookCard && hookCardFilter) {
        filters.push(hookCardFilter);
      }
      filters.push(subtitleFilter);
      return `[0:v]${filters.join(',')}[vout]`;
    };
    const audioFilters = [
      '[1:a]aresample=44100,aformat=channel_layouts=mono,volume=1[voice]',
      '[2:a]aresample=44100,aformat=channel_layouts=mono,volume=0.12[bgm]',
    ];
    if (soundEffect) {
      audioFilters.push(
        '[3:a]aresample=44100,aformat=channel_layouts=mono,atrim=duration=1.5,asetpts=PTS-STARTPTS,volume=0.85[sfx]',
        '[voice][bgm][sfx]amix=inputs=3:duration=first:dropout_transition=2:normalize=0,alimiter=limit=0.95[aout]',
      );
    } else {
      audioFilters.push(
        '[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2:normalize=0,alimiter=limit=0.95[aout]',
      );
    }
    const renderVideo = (videoFilter) => new Promise((resolve, reject) => {
      const command = ffmpeg();
      let settled = false;
      let timeout;
      const finishWithError = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const finishSuccessfully = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      command.input(background).inputOptions(['-stream_loop', '-1']);
      command.input(voiceoverPath);
      command.input(backgroundMusic).inputOptions(['-stream_loop', '-1']);
      if (soundEffect) {
        command.input(soundEffect);
      }

      command.complexFilter([videoFilter, ...audioFilters]);
      command.outputOptions([
        '-threads', '1',
        '-filter_threads', '1',
        '-filter_complex_threads', '1',
        '-map', '[vout]',
        '-map', '[aout]',
        '-t', String(voiceDurationSeconds),
        '-shortest',
        '-r', '30',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-maxrate', '4M',
        '-bufsize', '2M',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '1',
        '-ar', '44100',
        '-movflags', '+faststart',
      ]);
      timeout = setTimeout(() => {
        try {
          command.kill('SIGKILL');
        } catch (error) {
          console.error('[render] Could not terminate FFmpeg after its timeout:', error);
        }
        finishWithError(new Error(`FFmpeg render timed out after ${FFMPEG_TIMEOUT_MS / 1000} seconds and was terminated.`));
      }, FFMPEG_TIMEOUT_MS);
      command
        .on('error', (error, stdout, stderr) => {
          const diagnostic = typeof stderr === 'string'
            ? stderr.split(/\r?\n/).filter(Boolean).slice(-35).join('\n')
            : '';
          finishWithError(new Error(`FFmpeg render failed: ${error.message}${diagnostic ? `\n${diagnostic}` : ''}`, { cause: error }));
        })
        .on('end', finishSuccessfully)
        .save(outputPath);
    });

    let encodeStartedAt = Date.now();
    try {
      global.gc?.();
      console.info('[render] Starting FFmpeg encode...');
      await renderVideo(createVideoFilter(true));
      console.info(`[render] FFmpeg finished in ${((Date.now() - encodeStartedAt) / 1000).toFixed(1)}s`);
    } catch (error) {
      if (!hookCardFilter || !/drawtext|option ['"].*['"] not found/i.test(error.message)) {
        throw error;
      }
      console.warn(`[render] Hook-card drawtext failed; retrying without the hook overlay: ${error.message}`);
      await rm(outputPath, { force: true });
      global.gc?.();
      encodeStartedAt = Date.now();
      console.info('[render] Starting FFmpeg encode...');
      await renderVideo(createVideoFilter(false));
      console.info(`[render] FFmpeg finished in ${((Date.now() - encodeStartedAt) / 1000).toFixed(1)}s`);
    }

    const result = await stat(outputPath);
    if (!result.isFile() || result.size === 0) {
      throw new Error('FFmpeg completed without creating a valid video file.');
    }
    const durationSeconds = await probeDuration(outputPath);
    if (Math.abs(durationSeconds - voiceDurationSeconds) > 0.3) {
      throw new Error(
        `Rendered video duration (${durationSeconds.toFixed(2)}s) differs from voiceover duration (${voiceDurationSeconds.toFixed(2)}s) by more than 0.3 seconds.`,
      );
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
