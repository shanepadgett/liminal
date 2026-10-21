/** A span of seconds the way the transcript writes it: `12s`, `2m 5s`. */
export const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return minutes === 0 ? `${rest}s` : `${minutes}m ${rest}s`;
};
