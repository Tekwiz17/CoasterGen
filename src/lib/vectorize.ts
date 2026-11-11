import type { Artwork, Vec2 } from "../types";
type RGB = [number, number, number];
const rgb = (hex: string): RGB =>
  hex
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16)) as RGB;
const hex = (c: RGB) =>
  "#" +
  c
    .map((x) =>
      Math.max(0, Math.min(255, Math.round(x)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
function lab(c: RGB): RGB {
  const [r, g, b] = c.map((x) => {
    x /= 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const dist = (a: RGB, b: RGB) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
export function vectorize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  count: number,
  base: string,
  removeBackground: boolean,
): Artwork {
  const transparent = new Uint8Array(width * height);
  let removed = 0;
  for (let i = 0; i < transparent.length; i++)
    if (data[i * 4 + 3] < 128) transparent[i] = 1;
  if (removeBackground) {
    const corners = [
      0,
      width - 1,
      width * (height - 1),
      width * height - 1,
    ].filter((i) => !transparent[i]);
    if (corners.length) {
      const bg = lab([
        data[corners[0] * 4],
        data[corners[0] * 4 + 1],
        data[corners[0] * 4 + 2],
      ]);
      const visited = new Uint8Array(transparent.length),
        queue: number[] = [];
      const add = (i: number) => {
        if (visited[i]) return;
        visited[i] = 1;
        const color = lab([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
        if (transparent[i] || dist(color, bg) < 0.014) {
          transparent[i] = 1;
          queue.push(i);
          removed++;
        }
      };
      for (let x = 0; x < width; x++) {
        add(x);
        add((height - 1) * width + x);
      }
      for (let y = 0; y < height; y++) {
        add(y * width);
        add(y * width + width - 1);
      }
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q],
          x = i % width,
          y = Math.floor(i / width);
        if (x) add(i - 1);
        if (x < width - 1) add(i + 1);
        if (y) add(i - width);
        if (y < height - 1) add(i + width);
      }
    }
  }
  const hist = new Map<number, { color: RGB; lab: RGB; n: number }>();
  for (let i = 0; i < transparent.length; i++)
    if (!transparent[i]) {
      const r = data[i * 4],
        g = data[i * 4 + 1],
        b = data[i * 4 + 2],
        key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const e = hist.get(key);
      if (e) e.n++;
      else {
        const color: RGB = [r, g, b];
        hist.set(key, { color, lab: lab(color), n: 1 });
      }
    }
  const points = Array.from(hist.values());
  const centers: RGB[] = [lab(rgb(base))],
    colors: RGB[] = [rgb(base)];
  while (centers.length < count) {
    let best = points[0],
      score = -1;
    for (const p of points) {
      const d =
        Math.min(...centers.map((c) => dist(c, p.lab))) * Math.sqrt(p.n);
      if (d > score) {
        best = p;
        score = d;
      }
    }
    const color = best?.color ?? [128, 128, 128];
    colors.push(color);
    centers.push(lab(color));
  }
  const nearest = (p: RGB) => {
    let best = 0,
      d = Infinity;
    centers.forEach((c, i) => {
      const n = dist(c, p);
      if (n < d) {
        d = n;
        best = i;
      }
    });
    return best;
  };
  for (let it = 0; it < 14; it++) {
    const sums = Array.from({ length: count }, () => [0, 0, 0, 0]);
    for (const p of points) {
      const j = nearest(p.lab);
      for (let c = 0; c < 3; c++) sums[j][c] += p.color[c] * p.n;
      sums[j][3] += p.n;
    }
    for (let j = 1; j < count; j++)
      if (sums[j][3]) {
        colors[j] = sums[j].slice(0, 3).map((x) => x / sums[j][3]) as RGB;
        centers[j] = lab(colors[j]);
      }
  }
  const lookup = new Map<number, number>();
  for (const [key, p] of hist) lookup.set(key, nearest(p.lab));
  const labels = new Uint8Array(width * height).fill(255);
  for (let i = 0; i < labels.length; i++)
    if (!transparent[i])
      labels[i] = lookup.get(
        ((data[i * 4] >> 3) << 10) |
          ((data[i * 4 + 1] >> 3) << 5) |
          (data[i * 4 + 2] >> 3),
      )!;
  // Remove isolated one-pixel noise without blurring intentional connected lines.
  const filtered = labels.slice();
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        c = labels[i];
      if (c === 255) continue;
      const ns = [
        labels[i - 1],
        labels[i + 1],
        labels[i - width],
        labels[i + width],
      ];
      if (!ns.includes(c)) {
        const v = ns.find((n) => ns.filter((m) => m === n).length >= 3);
        if (v !== undefined) filtered[i] = v;
      }
    }
  const counts = Array(count).fill(0);
  for (const v of filtered) if (v !== 255) counts[v]++;
  return {
    width,
    height,
    loops: Array.from({ length: count }, (_, c) =>
      trace(filtered, width, height, c),
    ),
    sourceColors: colors.map(hex),
    counts,
    pixels: counts.reduce((a, b) => a + b, 0),
    removed,
  };
}
function trace(
  labels: Uint8Array,
  w: number,
  h: number,
  color: number,
): Vec2[][] {
  const stride = w + 1;
  type Edge = { end: number; dir: number };
  const edges = new Map<number, Edge[]>();
  const add = (x: number, y: number, ex: number, ey: number, dir: number) => {
    const key = y * stride + x;
    const list = edges.get(key) ?? [];
    list.push({ end: ey * stride + ex, dir });
    edges.set(key, list);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (labels[y * w + x] === color) {
        if (y === 0 || labels[(y - 1) * w + x] !== color)
          add(x, y, x + 1, y, 0);
        if (x === w - 1 || labels[y * w + x + 1] !== color)
          add(x + 1, y, x + 1, y + 1, 1);
        if (y === h - 1 || labels[(y + 1) * w + x] !== color)
          add(x + 1, y + 1, x, y + 1, 2);
        if (x === 0 || labels[y * w + x - 1] !== color) add(x, y + 1, x, y, 3);
      }
  const loops: Vec2[][] = [];
  while (edges.size) {
    const start = edges.keys().next().value!;
    let key = start,
      prev = -1;
    const loop: Vec2[] = [];
    let guard = 0;
    do {
      loop.push([key % stride, Math.floor(key / stride)]);
      const list = edges.get(key);
      if (!list?.length) break;
      let j = 0;
      if (list.length > 1 && prev >= 0) {
        const rank = (d: number) => [1, 0, 3, 2][(d - prev + 4) % 4];
        for (let i = 1; i < list.length; i++)
          if (rank(list[i].dir) < rank(list[j].dir)) j = i;
      }
      const edge = list.splice(j, 1)[0];
      if (!list.length) edges.delete(key);
      key = edge.end;
      prev = edge.dir;
    } while (key !== start && ++guard < 2e6);
    if (key === start && loop.length >= 4) {
      const clean = loop.filter((p, i) => {
        const a = loop[(i + loop.length - 1) % loop.length],
          b = loop[(i + 1) % loop.length];
        return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
      });
      const area = Math.abs(
        clean.reduce((a, p, i) => {
          const n = clean[(i + 1) % clean.length];
          return a + p[0] * n[1] - n[0] * p[1];
        }, 0) / 2,
      );
      if (area >= 2) loops.push(simplifyClosed(clean, 0.35));
    }
  }
  return loops;
}
function simplifyClosed(loop: Vec2[], eps: number): Vec2[] {
  if (loop.length < 6) return loop;
  let far = 1,
    ds = 0;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > ds) {
      ds = d;
      far = i;
    }
  }
  return [
    ...rdp(loop.slice(0, far + 1), eps).slice(0, -1),
    ...rdp([...loop.slice(far), loop[0]], eps).slice(0, -1),
  ];
}
function rdp(points: Vec2[], eps: number): Vec2[] {
  if (points.length <= 2) return points;
  const a = points[0],
    b = points.at(-1)!,
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    d = dx * dx + dy * dy;
  let max = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      t = d
        ? Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d),
          )
        : 0;
    const ds = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
    if (ds > max) {
      max = ds;
      index = i;
    }
  }
  return max > eps * eps
    ? [
        ...rdp(points.slice(0, index + 1), eps).slice(0, -1),
        ...rdp(points.slice(index), eps),
      ]
    : [a, b];
}
