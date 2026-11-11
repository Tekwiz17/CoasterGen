import { distance, hex, lab, rgb, type RGB } from "./color";
interface Sample {
  color: RGB;
  lab: RGB;
  n: number;
  reliable: number;
  sum: RGB;
  cleanSum: RGB;
}
export interface EdgeBlends {
  pairs: Uint8Array;
  mix: Uint8Array;
}
const packed = (data: Uint8ClampedArray, i: number) =>
  (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
const unpack = (key: number): RGB => [key >> 16, (key >> 8) & 255, key & 255];
const nearest = (color: RGB, centers: RGB[]) => {
  let best = 0,
    score = Infinity;
  for (let j = 0; j < centers.length; j++) {
    const d = distance(color, centers[j]);
    if (d < score) {
      best = j;
      score = d;
    }
  }
  return best;
};
function edgeBlend(
  data: Uint8ClampedArray,
  i: number,
  a: number,
  b: number,
): number {
  const ar = data[a * 4],
    ag = data[a * 4 + 1],
    ab = data[a * 4 + 2],
    vr = data[b * 4] - ar,
    vg = data[b * 4 + 1] - ag,
    vb = data[b * 4 + 2] - ab;
  const length = vr * vr + vg * vg + vb * vb;
  if (length < 1600) return -1;
  const pr = data[i * 4] - ar,
    pg = data[i * 4 + 1] - ag,
    pb = data[i * 4 + 2] - ab;
  const t = (pr * vr + pg * vg + pb * vb) / length;
  if (t < 0.04 || t > 0.96) return -1;
  return (pr - t * vr) ** 2 + (pg - t * vg) ** 2 + (pb - t * vb) ** 2 <= 36
    ? t
    : -1;
}
// Recognize edge mixtures before choosing colors. They should not displace a
// real, even very small accent from a limited filament palette.
export function findEdgeBlends(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  transparent: Uint8Array,
): EdgeBlends {
  const pairs = new Uint8Array(w * h),
    mix = new Uint8Array(w * h);
  const offsets = [
    [-1, 1],
    [-w, w],
    [-w - 1, w + 1],
    [-w + 1, w - 1],
  ];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (transparent[i]) continue;
      let best = -1,
        span = 0;
      for (let p = 0; p < offsets.length; p++) {
        if (
          (p !== 1 && (x === 0 || x === w - 1)) ||
          (p !== 0 && (y === 0 || y === h - 1))
        )
          continue;
        const a = i + offsets[p][0],
          b = i + offsets[p][1];
        if (transparent[a] || transparent[b]) continue;
        const t = edgeBlend(data, i, a, b);
        if (t < 0) continue;
        const length =
          (data[a * 4] - data[b * 4]) ** 2 +
          (data[a * 4 + 1] - data[b * 4 + 1]) ** 2 +
          (data[a * 4 + 2] - data[b * 4 + 2]) ** 2;
        if (length > span) {
          span = length;
          best = p;
          pairs[i] = p + 1;
          mix[i] = Math.round(t * 255);
        }
      }
      if (best < 0) pairs[i] = 0;
    }
  return { pairs, mix };
}
export function quantize(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  count: number,
  base: string,
  transparent: Uint8Array,
  preserve: boolean,
  smooth: boolean,
  palette?: string[],
) {
  if (
    palette &&
    (palette.length !== count ||
      !palette.every((c) => /^#[0-9a-f]{6}$/i.test(c)))
  )
    throw new Error("The image palette is invalid.");
  const blends = smooth ? findEdgeBlends(data, w, h, transparent) : undefined;
  let colors: RGB[] = palette ? palette.map(rgb) : [rgb(base)];
  if (!palette) {
    // Keep exact colors for illustrations. Bound work on photographs instead of
    // reducing subtle neighboring illustration colors to the same RGB bucket.
    const unique = new Set<number>();
    if (preserve)
      for (let i = 0; i < transparent.length && unique.size <= 8192; i++)
        if (!transparent[i]) unique.add(packed(data, i));
    const shift = preserve ? (unique.size <= 8192 ? 0 : 2) : 3,
      bits = 8 - shift;
    const histogram = new Map<number, Sample>(),
      anchors = new Map<number, number>();
    for (let i = 0; i < transparent.length; i++)
      if (!transparent[i]) {
        const r = data[i * 4],
          g = data[i * 4 + 1],
          b = data[i * 4 + 2],
          key =
            ((r >> shift) << (bits * 2)) |
            ((g >> shift) << bits) |
            (b >> shift);
        let e = histogram.get(key);
        if (!e) {
          const color: RGB = [r, g, b];
          e = {
            color,
            lab: lab(color),
            n: 0,
            reliable: 0,
            sum: [0, 0, 0],
            cleanSum: [0, 0, 0],
          };
          histogram.set(key, e);
        }
        e.n++;
        for (let c = 0; c < 3; c++) e.sum[c] += data[i * 4 + c];
        if (!blends?.pairs[i]) {
          e.reliable++;
          for (let c = 0; c < 3; c++) e.cleanSum[c] += data[i * 4 + c];
        }
        const x = i % w,
          y = Math.floor(i / w),
          exact = packed(data, i);
        if (
          x > 0 &&
          x < w - 1 &&
          y > 0 &&
          y < h - 1 &&
          data[i * 4 + 3] >= 224 &&
          [-1, 1, -w, w].every(
            (d) => !transparent[i + d] && packed(data, i + d) === exact,
          )
        )
          anchors.set(exact, (anchors.get(exact) ?? 0) + 1);
      }
    const points = Array.from(histogram.values());
    const targets = new Map<Sample, { mean: RGB; score: number }>();
    for (const p of points) {
      const mean = (p.reliable ? p.cleanSum : p.sum).map(
        (v) => v / (p.reliable || p.n),
      ) as RGB;
      targets.set(p, { mean, score: Infinity });
    }
    // A bucket's average RGB need not occur in the photograph. Pick an actual
    // sample near that average before fitting perceptual palette medoids.
    for (let i = 0; i < transparent.length; i++)
      if (!transparent[i]) {
        const r = data[i * 4],
          g = data[i * 4 + 1],
          b = data[i * 4 + 2],
          key =
            ((r >> shift) << (bits * 2)) |
            ((g >> shift) << bits) |
            (b >> shift),
          p = histogram.get(key)!;
        if (p.reliable && blends?.pairs[i]) continue;
        const target = targets.get(p)!;
        if (target.score === 0) continue;
        const d =
          (r - target.mean[0]) ** 2 +
          (g - target.mean[1]) ** 2 +
          (b - target.mean[2]) ** 2;
        if (d < target.score) {
          p.color = [r, g, b];
          target.score = d;
        }
      }
    for (const p of points) p.lab = lab(p.color);
    let centers = colors.map(lab);
    while (colors.length < count) {
      let best: Sample | undefined,
        score = 1e-12;
      for (const p of points) {
        if (!p.reliable) continue;
        const d =
          distance(p.lab, centers[nearest(p.lab, centers)]) *
          Math.sqrt(preserve ? Math.min(64, p.reliable) : p.reliable);
        if (d > score) {
          best = p;
          score = d;
        }
      }
      colors.push(best?.color ?? rgb(base));
      centers.push(lab(colors[colors.length - 1]));
    }
    // Weighted squared-distance medoids in Oklab: each fitted color is a real
    // source sample nearest its cluster's perceptual centroid, not an RGB blend.
    for (let iteration = 0; iteration < 12; iteration++) {
      const sums = Array.from({ length: count }, () => [0, 0, 0, 0]),
        members: Sample[][] = Array.from({ length: count }, () => []);
      for (const p of points) {
        const slot = nearest(p.lab, centers),
          weight = p.reliable ? p.reliable : 0.0001 * p.n;
        for (let c = 0; c < 3; c++) sums[slot][c] += p.lab[c] * weight;
        sums[slot][3] += weight;
        members[slot].push(p);
      }
      let changed = false;
      for (let j = 1; j < count; j++)
        if (sums[j][3]) {
          const mean = sums[j].slice(0, 3).map((v) => v / sums[j][3]) as RGB;
          let best: Sample | undefined,
            score = Infinity;
          const reliable = members[j].some((p) => p.reliable > 0);
          for (const p of members[j]) {
            if (reliable && !p.reliable) continue;
            const d = distance(p.lab, mean);
            if (
              d < score - 1e-14 ||
              (Math.abs(d - score) < 1e-14 && p.n > (best?.n ?? 0))
            ) {
              score = d;
              best = p;
            }
          }
          if (best) {
            const next = rgb(hex(best.color));
            if (hex(next) !== hex(colors[j])) changed = true;
            colors[j] = next;
            centers[j] = lab(next);
          }
        }
      if (!changed) break;
    }
    // Snap only nearby, well supported solid colors to their exact RGB values.
    // This keeps branding and line-art colors from drifting a few RGB levels.
    const stable = Array.from(anchors, ([key, n]) => ({
      color: unpack(key),
      lab: lab(unpack(key)),
      n,
    }))
      .filter((p) => p.n >= 2)
      .sort((a, b) => b.n - a.n);
    const mass = Array(count).fill(0);
    for (const point of points)
      mass[nearest(point.lab, centers)] += point.reliable;
    for (let j = 1; j < count; j++) {
      const anchor = stable.find(
        (p) =>
          (distance(p.lab, centers[j]) < 0.025 ** 2 ||
            (p.n >= mass[j] * 0.5 && distance(p.lab, centers[j]) < 0.1 ** 2)) &&
          nearest(p.lab, centers) === j,
      );
      if (anchor) {
        colors[j] = anchor.color;
        centers[j] = anchor.lab;
      }
    }
  }
  colors = colors.map((c) => rgb(hex(c)));
  const centers = colors.map(lab),
    cache = new Map<number, number>(),
    labels = new Uint8Array(w * h).fill(255);
  for (let i = 0; i < labels.length; i++)
    if (!transparent[i]) {
      const key = packed(data, i);
      let slot = cache.get(key);
      if (slot === undefined) {
        slot = nearest(lab(unpack(key)), centers);
        cache.set(key, slot);
      }
      labels[i] = slot;
    }
  return { labels, colors, blends };
}
export function resolveEdgeBlends(
  labels: Uint8Array,
  w: number,
  blends: EdgeBlends,
  data: Uint8ClampedArray,
  colors: RGB[],
): Uint8Array {
  const result = labels.slice(),
    offsets = [
      [-1, 1],
      [-w, w],
      [-w - 1, w + 1],
      [-w + 1, w - 1],
    ];
  for (let i = 0; i < labels.length; i++)
    if (blends.pairs[i]) {
      const current = labels[i];
      if (
        current !== 255 &&
        distance(
          [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]],
          colors[current],
        ) <= 9
      )
        continue;
      const pair = offsets[blends.pairs[i] - 1],
        a = labels[i + pair[0]],
        b = labels[i + pair[1]];
      if (a !== 255 && b !== 255 && a !== b)
        result[i] = blends.mix[i] < 128 ? a : b;
    }
  return result;
}
