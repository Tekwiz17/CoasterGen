import type { Artwork, Vec2 } from "../types";
import { refineBoundary, simplifyIndices } from "./curves";
import { distance as dist, hex, type RGB } from "./color";
import { removeEdgeBackground } from "./background";
import { quantize, resolveEdgeBlends } from "./palette";
export function vectorize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  count: number,
  base: string,
  removeBackground: boolean,
  smooth = true,
  palette?: string[],
  options: { preserveDetails?: boolean; overrides?: Uint8Array } = {},
): Artwork {
  if (!Number.isInteger(count) || count < 2 || count > 8)
    throw new Error("Choose between 2 and 8 total colors.");
  if (width < 1 || height < 1 || data.length !== width * height * 4)
    throw new Error("The image has invalid dimensions.");
  const preserve = options.preserveDetails ?? false;
  if (options.overrides && options.overrides.length !== width * height)
    throw new Error("The cleanup layer has invalid dimensions.");
  const transparent = new Uint8Array(width * height);
  for (let i = 0; i < transparent.length; i++)
    if (data[i * 4 + 3] < 128) transparent[i] = 1;
  const removed = removeBackground
    ? removeEdgeBackground(data, width, height, transparent)
    : 0;
  const { labels, colors, blends } = quantize(
    data,
    width,
    height,
    count,
    base,
    transparent,
    preserve,
    smooth,
    palette,
  );
  // Antialiased pixels between two colors can be nearest to an unrelated
  // palette color (e.g. red between cream and black). Resolve that blend
  // against the two colors actually present on the local boundary.
  const filtered = blends
    ? resolveEdgeBlends(labels, width, blends, data, colors)
    : labels.slice();
  if (smooth && count > 2)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x,
          current = labels[i];
        if (current === 255) continue;
        const pixel: RGB = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]],
          error = dist(pixel, colors[current]);
        // Confident source matches, including one-pixel accents, need no voting.
        if (error < 100) continue;
        const votes = new Uint8Array(count);
        let total = 0;
        const gather = (radius: number) => {
          for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
              const xx = x + dx,
                yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
              const at = yy * width + xx,
                c = labels[at];
              if (c === 255) continue;
              // A whole fringe of weakly matched pixels must not vote itself into
              // an unrelated color. Use source neighbors that support their slot.
              const color = colors[c];
              if (
                (data[at * 4] - color[0]) ** 2 +
                  (data[at * 4 + 1] - color[1]) ** 2 +
                  (data[at * 4 + 2] - color[2]) ** 2 >
                900
              )
                continue;
              votes[c]++;
              total++;
            }
        };
        const bestPair = () => {
          let first = -1,
            second = -1;
          for (let c = 0; c < count; c++)
            if (c !== current && votes[c]) {
              if (first < 0 || votes[c] > votes[first]) {
                second = first;
                first = c;
              } else if (second < 0 || votes[c] > votes[second]) second = c;
            }
          return [first, second];
        };
        gather(1);
        let [first, second] = bestPair();
        if (first < 0 || second < 0 || votes[first] < 2 || votes[second] < 2) {
          gather(2);
          [first, second] = bestPair();
        }
        if (
          first < 0 ||
          second < 0 ||
          votes[first] < 2 ||
          votes[second] < 2 ||
          votes[current] > total * 0.5
        )
          continue;
        const a = colors[first],
          b = colors[second],
          v = b.map((c, j) => c - a[j]),
          length = v.reduce((sum, c) => sum + c * c, 0);
        if (length < 100) continue;
        const t = Math.max(
            0,
            Math.min(
              1,
              v.reduce((sum, c, j) => sum + (pixel[j] - a[j]) * c, 0) / length,
            ),
          ),
          blend = a.map((c, j) => c + t * v[j]) as RGB,
          residual = dist(pixel, blend);
        if (residual < 225 && residual * 4 < error)
          filtered[i] = t < 0.5 ? first : second;
      }
  // Remove one-pixel burrs while retaining continuous thin lines. Work from
  // a snapshot each pass so color/scan ordering cannot affect the result.
  if (smooth && !preserve)
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
  if (smooth && !preserve)
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
  if (smooth && !preserve) {
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
  // Paint chooses output filament slots, independent of the detected colors.
  // Apply it last so small strokes survive quantization and noise removal.
  const overrides = options.overrides;
  if (overrides)
    for (let i = 0; i < filtered.length; i++) {
      const code = overrides[i];
      if (code === 255) filtered[i] = 255;
      else if (code >= 1 && code <= 8)
        filtered[i] = count + Math.min(count - 1, code - 1);
    }
  const hasPaint = overrides?.some(
    (code) => (code >= 1 && code <= 8) || code === 255,
  );
  const vertices = smooth
    ? smoothBoundaries(filtered, width, height, preserve || !!hasPaint)
    : undefined;
  const counts = Array(count).fill(0),
    paintCounts = Array(count).fill(0);
  for (const v of filtered)
    if (v !== 255) {
      if (v < count) counts[v]++;
      else paintCounts[v - count]++;
    }
  return {
    width,
    height,
    loops: Array.from({ length: count }, (_, c) =>
      trace(filtered, width, height, c, vertices, preserve ? 0.05 : 1),
    ),
    ...(overrides
      ? {
          paintLoops: Array.from({ length: count }, (_, c) =>
            trace(filtered, width, height, count + c, vertices, 0.05),
          ),
          paintCounts,
        }
      : {}),
    sourceColors: colors.map(hex),
    counts,
    pixels: [...counts, ...paintCounts].reduce((a, b) => a + b, 0),
    removed,
  };
}
// Every color uses the SAME boundary graph. Smoothing each color separately
// creates slivers and gaps in both the preview and the printed inlays. Junctions
// stay fixed; only degree-two boundary vertices move, by less than one pixel.
function smallRegions(labels: Uint8Array, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(labels.length),
    small = new Uint8Array(labels.length),
    queue = new Uint32Array(labels.length);
  for (let start = 0; start < labels.length; start++) {
    if (seen[start] || labels[start] === 255) continue;
    const color = labels[start];
    let head = 0,
      tail = 1;
    queue[0] = start;
    seen[start] = 1;
    const add = (i: number) => {
      if (!seen[i] && labels[i] === color) {
        seen[i] = 1;
        queue[tail++] = i;
      }
    };
    while (head < tail) {
      const i = queue[head++],
        x = i % w;
      if (x) add(i - 1);
      if (x + 1 < w) add(i + 1);
      if (i >= w) add(i - w);
      if (i + w < labels.length) add(i + w);
    }
    // Preserve the actual footprint of tiny accents and small interior holes.
    if (tail <= 32) for (let i = 0; i < tail; i++) small[queue[i]] = 1;
  }
  return small;
}
function smoothBoundaries(
  labels: Uint8Array,
  w: number,
  h: number,
  preserve = false,
) {
  const stride = w + 1;
  const fixed = new Set<number>();
  const small = preserve ? smallRegions(labels, w, h) : undefined;
  const labelAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 255 : labels[y * w + x];
  if (preserve)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const color = labels[y * w + x];
        if (color === 255) continue;
        // A pixel in a one-pixel stroke or tiny island has no solid 2×2 core.
        // Pin its incident corners on the shared graph instead of rounding it away.
        let core = false;
        for (let dy = -1; dy <= 0 && !core; dy++)
          for (let dx = -1; dx <= 0; dx++) {
            const ax = x + dx,
              ay = y + dy;
            if (ax < 0 || ay < 0 || ax + 1 >= w || ay + 1 >= h) continue;
            if (
              [
                ay * w + ax,
                ay * w + ax + 1,
                (ay + 1) * w + ax,
                (ay + 1) * w + ax + 1,
              ].every((i) => labels[i] === color)
            ) {
              core = true;
              break;
            }
          }
        const narrow =
          (labelAt(x - 1, y) !== color && labelAt(x + 2, y) !== color) ||
          (labelAt(x + 1, y) !== color && labelAt(x - 2, y) !== color) ||
          (labelAt(x, y - 1) !== color && labelAt(x, y + 2) !== color) ||
          (labelAt(x, y + 1) !== color && labelAt(x, y - 2) !== color);
        if (!core || narrow || small?.[y * w + x])
          for (const key of [
            y * stride + x,
            y * stride + x + 1,
            (y + 1) * stride + x,
            (y + 1) * stride + x + 1,
          ])
            fixed.add(key);
      }
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
  if (preserve)
    for (const [key, adjacent] of graph) {
      if (adjacent.length !== 2) continue;
      const x = key % stride,
        y = Math.floor(key / stride);
      const a = adjacent[0],
        b = adjacent[1];
      if ((a % stride === x) === (b % stride === x)) continue;
      const straight = (first: number) => {
        let previous = key,
          at = first;
        const dx = (first % stride) - x,
          dy = Math.floor(first / stride) - y;
        for (let step = 1; step <= 4; step++) {
          if (
            at % stride !== x + dx * step ||
            Math.floor(at / stride) !== y + dy * step
          )
            return false;
          if (step === 4) return true;
          const next = graph.get(at);
          if (next?.length !== 2) return false;
          const follow = next[0] === previous ? next[1] : next[0];
          previous = at;
          at = follow;
        }
        return true;
      };
      if (straight(a) && straight(b)) fixed.add(key);
    }
  const bound = (key: number, p: Vec2): Vec2 => {
    if (!preserve) return p;
    const x = key % stride,
      y = Math.floor(key / stride),
      dx = p[0] - x,
      dy = p[1] - y,
      d = Math.hypot(dx, dy),
      factor = d > 0.45 ? 0.45 / d : 1;
    return [x + dx * factor, y + dy * factor];
  };
  let points = new Map<number, Vec2>();
  for (const key of graph.keys())
    points.set(key, [key % stride, Math.floor(key / stride)]);
  for (let pass = 0; pass < 4; pass++) {
    const next = new Map<number, Vec2>();
    for (const [key, adjacent] of graph) {
      const p = points.get(key)!;
      if (adjacent.length !== 2 || fixed.has(key)) {
        next.set(key, p);
        continue;
      }
      const a = points.get(adjacent[0])!,
        b = points.get(adjacent[1])!;
      next.set(
        key,
        bound(key, [
          p[0] * 0.4 + (a[0] + b[0]) * 0.3,
          p[1] * 0.4 + (a[1] + b[1]) * 0.3,
        ]),
      );
    }
    points = next;
  }
  // Simplify shared chains once so adjoining inlays keep identical vertices.
  const keep = new Set<number>();
  const visited = new Set<string>();
  const edgeKey = (a: number, b: number) => (a < b ? a + "," + b : b + "," + a);
  const simplify = (chain: number[]) => {
    const refined = refineBoundary(chain.map((key) => points.get(key)!)).map(
      (point, i) => bound(chain[i], point),
    );
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
      if (key === start || graph.get(key)!.length !== 2 || fixed.has(key))
        break;
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
    if (adjacent.length !== 2 || fixed.has(key)) {
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
  minArea = 1,
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
      if (area >= minArea && clean.length >= 3) loops.push(clean);
    }
  }
  return loops;
}
