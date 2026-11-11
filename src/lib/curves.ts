import fitCurve from "fit-curve";
import type { Vec2 } from "../types";

const distance = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Return a point for every input vertex. Shared color boundaries are refined
// once and both adjoining colors look up these identical points.
export function refineBoundary(input: Vec2[]): Vec2[] {
  if (input.length < 8 || input.length > 12000) return input;
  const simplified = simplifyIndices(input, 0.65);
  const corners = [0];
  for (let k = 1; k < simplified.length - 1; k++) {
    const i = simplified[k],
      a = input[simplified[k - 1]],
      p = input[i],
      b = input[simplified[k + 1]];
    const ux = p[0] - a[0],
      uy = p[1] - a[1],
      vx = b[0] - p[0],
      vy = b[1] - p[1];
    const denominator = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    // Keep intentional sharp corners; the fitted segments meet at this point.
    if (denominator && (ux * vx + uy * vy) / denominator < 0.42)
      corners.push(i);
  }
  corners.push(input.length - 1);
  const result = input.slice();
  for (let c = 0; c < corners.length - 1; c++) {
    const start = corners[c],
      end = corners[c + 1];
    const points = input.slice(start, end + 1);
    if (points.length < 6) continue;
    const curves = fitCurve(points, 0.7 * 0.7);
    const samples: Vec2[] = [points[0]];
    for (const [a, b, d, e] of curves) {
      const length = distance(a, b) + distance(b, d) + distance(d, e);
      const steps = Math.max(3, Math.ceil(length / 0.5));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps,
          s = 1 - t;
        samples.push([
          s * s * s * a[0] +
            3 * s * s * t * b[0] +
            3 * s * t * t * d[0] +
            t * t * t * e[0],
          s * s * s * a[1] +
            3 * s * s * t * b[1] +
            3 * s * t * t * d[1] +
            t * t * t * e[1],
        ]);
      }
    }
    const lengths = (path: Vec2[]) => {
      const cumulative = [0];
      for (let i = 1; i < path.length; i++)
        cumulative.push(cumulative[i - 1] + distance(path[i - 1], path[i]));
      return cumulative;
    };
    const before = lengths(points),
      after = lengths(samples);
    if (!before.at(-1) || !after.at(-1)) continue;
    const fitted: Vec2[] = [];
    let j = 1;
    let valid = true;
    for (let i = 0; i < points.length; i++) {
      const target = (before[i] / before.at(-1)!) * after.at(-1)!;
      while (j < samples.length - 1 && after[j] < target) j++;
      const fraction = (target - after[j - 1]) / (after[j] - after[j - 1] || 1);
      const a = samples[j - 1],
        b = samples[j];
      const p: Vec2 = [
        a[0] + (b[0] - a[0]) * fraction,
        a[1] + (b[1] - a[1]) * fraction,
      ];
      // Keep the refinement local. Do not let a fitted curve pull an eye,
      // narrow channel, corner or junction away from the traced silhouette.
      if (!p.every(Number.isFinite) || distance(p, points[i]) > 1.1) {
        valid = false;
        break;
      }
      fitted.push(p);
    }
    if (valid)
      for (let i = 1; i < fitted.length - 1; i++) result[start + i] = fitted[i];
  }
  return result;
}

export function simplifyIndices(points: Vec2[], tolerance: number): number[] {
  if (points.length < 3) return points.map((_, i) => i);
  const keep = new Set([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!,
      a = points[start],
      b = points[end];
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy;
    let distance = tolerance * tolerance,
      far = -1;
    for (let i = start + 1; i < end; i++) {
      const p = points[i];
      const t = length
        ? Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
          )
        : 0;
      const d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (d > distance) {
        distance = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep.add(far);
      stack.push([start, far], [far, end]);
    }
  }
  return [...keep].sort((a, b) => a - b);
}
