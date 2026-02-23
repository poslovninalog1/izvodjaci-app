export function relativeTime(date: string | Date): string {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = now - d;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "upravo";
  if (minutes < 60) return `pre ${minutes} min`;
  if (hours < 24) return `pre ${hours}h`;
  if (days === 1) return "juče";
  if (days < 7) return `pre ${days}d`;
  return new Date(date).toLocaleDateString("sr-Latn");
}
