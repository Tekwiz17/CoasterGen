import type { SplitResult } from "./spitgen";
import { sourceBounds } from "./spitrecommend";
import { DEFAULT_PROJECT, type ModelData } from "../types";
const dot = (a: number[], b: number[]) =>
  a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: number[]) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};
export function splitPreview(
  result: SplitResult,
  amount: number,
  isolated: number,
  connections: boolean,
) {
  const bounds = result.bounds ?? sourceBounds(result.parts),
    center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2),
    d = Math.max(20, ...bounds.max.map((v, i) => v - bounds.min[i]));
  const gap = d * 0.15 + (amount / 100) * d * 0.7;
  let offset = 0;
  const parts = result.parts.map((p, j) => {
    const b = sourceBounds([p]),
      c = b.min.map((v, i) => (v + b.max[i]) / 2);
    const joint = result.joints?.find((q) => q.a === j || q.b === j);
    const n = joint
      ? joint.normal.map((v) => v * (joint.a === j ? 1 : -1))
      : [0, 0, 1];
    const u = unit(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], n)),
      v = cross(n, u);
    let dir = unit(c.map((x, i) => x - center[i]));
    if (Math.hypot(...c.map((x, i) => x - center[i])) < 0.01)
      dir = [Math.cos(j * 2.399), Math.sin(j * 2.399), 0];
    const positions = p.positions.map((x, i) => {
      const k = i - (i % 3),
        axis = i % 3;
      if (connections) {
        const pt = [
          p.positions[k] - c[0],
          p.positions[k + 1] - c[1],
          p.positions[k + 2] - c[2],
        ];
        return dot(pt, [u, v, n][axis]);
      }
      return (
        x -
        (axis === 2 ? bounds.min[2] : center[axis]) +
        ((dir[axis] * amount) / 100) * d * 0.7
      );
    });
    if (connections) {
      const box = sourceBounds([{ ...p, positions }]);
      for (let i = 0; i < positions.length; i++)
        positions[i] +=
          i % 3 === 0
            ? offset - box.min[0]
            : i % 3 === 2
              ? -box.min[2]
              : -(box.min[1] + box.max[1]) / 2;
      offset += box.max[0] - box.min[0] + gap;
    }
    return { ...p, colorIndex: j, positions };
  });
  if (connections) {
    const box = sourceBounds(parts);
    const shift = (box.min[0] + box.max[0]) / 2;
    for (const p of parts)
      for (let i = 0; i < p.positions.length; i += 3) p.positions[i] -= shift;
  } else {
    let z = Infinity;
    for (const p of parts)
      for (let i = 2; i < p.positions.length; i += 3)
        z = Math.min(z, p.positions[i]);
    if (z < 0)
      for (const p of parts)
        for (let i = 2; i < p.positions.length; i += 3) p.positions[i] -= z;
  }
  const box = sourceBounds(parts),
    size = Math.max(d, ...box.max.map((v, i) => v - box.min[i]));
  return {
    model: {
      parts: isolated < 0 ? parts : parts.filter((_, i) => i === isolated),
      volume: result.parts.reduce((s, p) => s + p.volume, 0),
      triangles: parts.reduce((s, p) => s + p.indices.length / 3, 0),
      warnings: [],
    } as ModelData,
    project: {
      ...DEFAULT_PROJECT,
      colors: result.parts.map((p) => p.color),
      diameter: connections ? size : d * (1 + (amount / 100) * 1.4),
      thickness: box.max[2] - box.min[2],
    },
  };
}
