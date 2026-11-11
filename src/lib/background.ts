import { distance, lab, type RGB } from "./color";
export function removeEdgeBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  transparent: Uint8Array,
): number {
  const samples = new Map<number, { sum: RGB; n: number }>();
  const sample = (i: number) => {
    if (transparent[i]) return;
    const r = data[i * 4],
      g = data[i * 4 + 1],
      b = data[i * 4 + 2],
      key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = samples.get(key) ?? { sum: [0, 0, 0] as RGB, n: 0 };
    e.n++;
    e.sum[0] += r;
    e.sum[1] += g;
    e.sum[2] += b;
    samples.set(key, e);
  };
  for (let x = 0; x < w; x++) {
    sample(x);
    if (h > 1) sample((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    sample(y * w);
    if (w > 1) sample(y * w + w - 1);
  }
  const chosen = [...samples.values()].sort((a, b) => b.n - a.n)[0];
  if (!chosen) return 0;
  const background = lab(chosen.sum.map((v) => v / chosen.n) as RGB),
    visited = new Uint8Array(w * h),
    queue = new Uint32Array(w * h);
  let head = 0,
    tail = 0,
    removed = 0;
  const add = (i: number) => {
    if (visited[i]) return;
    visited[i] = 1;
    if (transparent[i]) queue[tail++] = i;
    else if (
      distance(
        lab([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]),
        background,
      ) <
      0.045 ** 2
    ) {
      transparent[i] = 1;
      queue[tail++] = i;
      removed++;
    }
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  while (head < tail) {
    const i = queue[head++],
      x = i % w;
    if (x) add(i - 1);
    if (x + 1 < w) add(i + 1);
    if (i >= w) add(i - w);
    if (i + w < w * h) add(i + w);
  }
  return removed;
}
