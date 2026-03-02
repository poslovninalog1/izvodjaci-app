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

/** Day label for message timeline: "Danas" | "Juče" | formatted date */
export function messageDayLabel(date: string | Date): string {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dDate = d.getDate();
  const dMonth = d.getMonth();
  const dYear = d.getFullYear();
  const tDate = today.getDate();
  const tMonth = today.getMonth();
  const tYear = today.getFullYear();
  const yDate = yesterday.getDate();
  const yMonth = yesterday.getMonth();
  const yYear = yesterday.getFullYear();

  if (dDate === tDate && dMonth === tMonth && dYear === tYear) return "Danas";
  if (dDate === yDate && dMonth === yMonth && dYear === yYear) return "Juče";
  return d.toLocaleDateString("sr-Latn", { day: "numeric", month: "long", year: "numeric" });
}
