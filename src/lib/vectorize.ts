import type { Artwork, Vec2 } from "../types";
import { refineBoundary, simplifyIndices } from "./curves";
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
  smooth = true,
): Artwork {
  if (!Number.isInteger(count) || count < 2 || count > 8)
    throw new Error("Choose between 2 and 8 total colors.");
  if (width < 1 || height < 1 || data.length !== width * height * 4)
    throw new Error("The image has invalid dimensions.");
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
  // Antialiased pixels between two colors can be nearest to an unrelated
  // palette color (e.g. red between cream and black). Resolve that blend
  // against the two colors actually present on the local boundary.
  const filtered = labels.slice();
  if (smooth)
    for (let y = 1; y < height - 1; y++)
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x,
          current = labels[i];
        if (current === 255) continue;
        const neighbors = new Map<number, number>();
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const c = labels[i + dy * width + dx];
            if (c !== 255) neighbors.set(c, (neighbors.get(c) ?? 0) + 1);
          }
        if ((neighbors.get(current) ?? 0) > 4) continue;
        const others = [...neighbors]
          .filter(([c]) => c !== current)
          .sort((a, b) => b[1] - a[1]);
        if (others.length < 2 || others[0][1] < 2 || others[1][1] < 2) continue;
        const a = colors[others[0][0]],
          b = colors[others[1][0]];
        const pixel: RGB = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
        const v = b.map((c, j) => c - a[j]),
          length = v.reduce((sum, c) => sum + c * c, 0);
        if (length < 100) continue;
        const t = Math.max(
          0,
          Math.min(
            1,
            v.reduce((sum, c, j) => sum + (pixel[j] - a[j]) * c, 0) / length,
          ),
        );
        const blend: RGB = a.map((c, j) => c + t * v[j]) as RGB;
        const residual = dist(pixel, blend);
        if (residual < 160 && residual * 4 < dist(pixel, colors[current]))
          filtered[i] = others[t < 0.5 ? 0 : 1][0];
      }
  // Remove one-pixel burrs while retaining continuous thin lines. Work from
  // a snapshot each pass so color/scan ordering cannot affect the result.
  if (smooth)
    for (let pass = 0; pass < 2; pass++) {
      const snapshot = filtered.slice();
      for (let y = 1; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x,
            c = snapshot[i];
          if (c === 255) continue;
          const offsets = [
            -width - 1,
            -width,
            -width + 1,
            -1,
            1,
            width - 1,
            width,
            width + 1,
          ];
          const ns = offsets.map((offset) => snapshot[i + offset]);
          const same = ns.filter((v) => v === c).length;
          const continuous = [
            [0, 7],
            [1, 6],
            [2, 5],
            [3, 4],
          ].some(([a, b]) => ns[a] === c && ns[b] === c);
          if (same > 2 || continuous) continue;
          const votes = new Map<number, number>();
          for (const v of ns)
            if (v !== c && v !== 255) votes.set(v, (votes.get(v) ?? 0) + 1);
          const best = [...votes].sort((a, b) => b[1] - a[1])[0];
          if (best?.[1] >= 5) filtered[i] = best[0];
        }
    }
  // Remove isolated one-pixel noise without blurring intentional connected lines.
  if (smooth)
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
  // Reassign tiny disconnected color flecks (often antialiasing/compression
  // artifacts). Work from a snapshot so scan direction cannot change results.
  if (smooth) {
    const labels = filtered.slice();
    const seen = new Uint8Array(labels.length);
    for (let start = 0; start < labels.length; start++) {
      if (seen[start] || labels[start] === 255) continue;
      const color = labels[start],
        component = [start];
      const neighbors = new Map<number, number>();
      seen[start] = 1;
      for (let q = 0; q < component.length; q++) {
        const i = component[q],
          x = i % width,
          y = Math.floor(i / width);
        const adjacent = [
          x > 0 ? i - 1 : -1,
          x < width - 1 ? i + 1 : -1,
          y > 0 ? i - width : -1,
          y < height - 1 ? i + width : -1,
        ];
        for (const n of adjacent) {
          if (n < 0) continue;
          if (labels[n] === color) {
            if (!seen[n]) {
              seen[n] = 1;
              component.push(n);
            }
          } else if (labels[n] !== 255) {
            neighbors.set(labels[n], (neighbors.get(labels[n]) ?? 0) + 1);
          }
        }
      }
      const speckArea = Math.max(
        3,
        Math.round(((width * height) / (512 * 512)) * 9),
      );
      if (component.length <= speckArea && neighbors.size) {
        const replacement = [...neighbors].sort((a, b) => b[1] - a[1])[0][0];
        for (const i of component) filtered[i] = replacement;
      }
    }
  }
  const vertices = smooth
    ? smoothBoundaries(filtered, width, height)
    : undefined;
  const counts = Array(count).fill(0);
  for (const v of filtered) if (v !== 255) counts[v]++;
  return {
    width,
    height,
    loops: Array.from({ length: count }, (_, c) =>
      trace(filtered, width, height, c, vertices),
    ),
    sourceColors: colors.map(hex),
    counts,
    pixels: counts.reduce((a, b) => a + b, 0),
    removed,
  };
}
// Every color uses the SAME boundary graph. Smoothing each color separately
// creates slivers and gaps in both the preview and the printed inlays. Junctions
// stay fixed; only degree-two boundary vertices move, by less than one pixel.
function smoothBoundaries(labels: Uint8Array, w: number, h: number) {
  const stride = w + 1;
  const graph = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (graph.get(a) ?? (graph.set(a, []), graph.get(a)!)).push(b);
    (graph.get(b) ?? (graph.set(b, []), graph.get(b)!)).push(a);
  };
  const label = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 255 : labels[y * w + x];
  for (let y = 0; y <= h; y++)
    for (let x = 0; x < w; x++)
      if (label(x, y - 1) !== label(x, y))
        link(y * stride + x, y * stride + x + 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x <= w; x++)
      if (label(x - 1, y) !== label(x, y))
        link(y * stride + x, (y + 1) * stride + x);
  let points = new Map<number, Vec2>();
  for (const key of graph.keys())
    points.set(key, [key % stride, Math.floor(key / stride)]);
  for (let pass = 0; pass < 4; pass++) {
    const next = new Map<number, Vec2>();
    for (const [key, adjacent] of graph) {
      const p = points.get(key)!;
      if (adjacent.length !== 2) {
        next.set(key, p);
        continue;
      }
      const a = points.get(adjacent[0])!,
        b = points.get(adjacent[1])!;
      next.set(key, [
        p[0] * 0.4 + (a[0] + b[0]) * 0.3,
        p[1] * 0.4 + (a[1] + b[1]) * 0.3,
      ]);
    }
    points = next;
  }
  // Simplify shared chains once so adjoining inlays keep identical vertices.
  const keep = new Set<number>();
  const visited = new Set<string>();
  const edgeKey = (a: number, b: number) => (a < b ? a + "," + b : b + "," + a);
  const simplify = (chain: number[]) => {
    const refined = refineBoundary(chain.map((key) => points.get(key)!));
    for (let i = 0; i < chain.length; i++) points.set(chain[i], refined[i]);
    for (const i of simplifyIndices(refined, 0.06)) keep.add(chain[i]);
  };
  const walk = (start: number, first: number) => {
    const chain = [start];
    let prev = start,
      key = first;
    visited.add(edgeKey(start, first));
    while (true) {
      chain.push(key);
      if (key === start || graph.get(key)!.length !== 2) break;
      const next = graph.get(key)!.find((n) => n !== prev)!;
      visited.add(edgeKey(key, next));
      prev = key;
      key = next;
    }
    if (key === start) {
      let far = 1,
        distance = 0;
      const a = points.get(start)!;
      for (let i = 1; i < chain.length - 1; i++) {
        const p = points.get(chain[i])!,
          d = (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
        if (d > distance) {
          distance = d;
          far = i;
        }
      }
      simplify(chain.slice(0, far + 1));
      simplify(chain.slice(far));
    } else simplify(chain);
  };
  for (const [key, adjacent] of graph)
    if (adjacent.length !== 2) {
      keep.add(key);
      for (const next of adjacent)
        if (!visited.has(edgeKey(key, next))) walk(key, next);
    }
  for (const [key, adjacent] of graph)
    for (const next of adjacent)
      if (!visited.has(edgeKey(key, next))) walk(key, next);
  return { points, keep };
}
function trace(
  labels: Uint8Array,
  w: number,
  h: number,
  color: number,
  vertices?: { points: Map<number, Vec2>; keep: Set<number> },
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
      if (!vertices || vertices.keep.has(key))
        loop.push(
          vertices?.points.get(key) ?? [key % stride, Math.floor(key / stride)],
        );
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
    if (key === start && loop.length >= 3) {
      const clean = loop.filter((p, i) => {
        const a = loop[(i + loop.length - 1) % loop.length],
          b = loop[(i + 1) % loop.length];
        return (
          Math.abs(
            (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]),
          ) > 1e-8
        );
      });
      const area = Math.abs(
        clean.reduce((a, p, i) => {
          const n = clean[(i + 1) % clean.length];
          return a + p[0] * n[1] - n[0] * p[1];
        }, 0) / 2,
      );
      // Collinear removal is reversible, so shared segments remain identical.
      if (area >= 1 && clean.length >= 3) loops.push(clean);
    }
  }
  return loops;
}
