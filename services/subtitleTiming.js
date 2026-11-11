export function fitSubtitleBeatsToDuration(subtitleBeats, durationSeconds) {
  const lastBeatEnd = Math.max(...subtitleBeats.map((beat) => beat.end));
  if (lastBeatEnd <= durationSeconds) {
    return subtitleBeats;
  }

  const scale = durationSeconds / lastBeatEnd;
  return subtitleBeats.map((beat) => ({
    ...beat,
    start: beat.start * scale,
    end: beat.end * scale,
  }));
}
