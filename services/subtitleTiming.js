export function fitSubtitleBeatsToDuration(subtitleBeats, durationSeconds) {
  const lastBeatEnd = Math.max(...subtitleBeats.map((beat) => beat.end));
  if (Math.abs(lastBeatEnd - durationSeconds) < 0.001) {
    return subtitleBeats;
  }

  const scale = durationSeconds / lastBeatEnd;
  return subtitleBeats.map((beat) => ({
    ...beat,
    start: beat.start * scale,
    end: beat.end * scale,
  }));
}
