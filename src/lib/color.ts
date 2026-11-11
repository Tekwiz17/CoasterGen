export type RGB = [number, number, number];
export const rgb = (hex: string): RGB =>
  hex
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16)) as RGB;
export const hex = (color: RGB) =>
  "#" +
  color
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
export const distance = (a: RGB, b: RGB) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
// Oklab coordinates used for both palette fitting and filament remapping.
export function lab(color: RGB): RGB {
  const [r, g, b] = color.map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function nearestColorIndex(color: string, choices: string[]): number {
  const target = lab(rgb(color));
  let best = 0,
    score = Infinity;
  for (let i = 0; i < choices.length; i++) {
    const d = distance(target, lab(rgb(choices[i])));
    if (d < score) {
      best = i;
      score = d;
    }
  }
  return best;
}
