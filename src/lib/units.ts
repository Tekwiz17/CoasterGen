// Keep dimensions in millimeters throughout the model and exported files.
export function parseMillimeters(text: string): number | null {
  const match = text
    .trim()
    .match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|in|inch|inches|\")?$/i);
  if (!match) return null;
  const n =
    Number(match[1]) * (match[2] && match[2].toLowerCase() !== "mm" ? 25.4 : 1);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
}
