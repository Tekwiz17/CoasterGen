import type { Artwork, Project } from "../types";
import { artContours, paintContours, outlines } from "./geometry";
export type Alignment =
  "left" | "centerX" | "right" | "top" | "centerY" | "bottom" | "center";
export function alignmentTargets(p: Project, art: Artwork) {
  const centered = { ...p, artX: 0, artY: 0 };
  const points = [
    ...artContours(centered, art).flatMap((loops, i) =>
      (p.mapping[i] ?? i) === 0 ? [] : loops.flat(),
    ),
    ...paintContours(centered, art).flatMap((loops, i) =>
      i === 0 ? [] : loops.flat(),
    ),
  ];
  if (!points.length) points.push([0, 0]);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const inset = outlines(p, p.margin).flat();
  const border = inset.length ? inset : outlines(p).flat(),
    xs = border.map((v) => v[0]),
    ys = border.map((v) => v[1]);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    bottom = Math.min(...ys),
    top = Math.max(...ys);
  return {
    left: left - minX,
    centerX: -(minX + maxX) / 2,
    right: right - maxX,
    top: top - maxY,
    centerY: -(minY + maxY) / 2,
    bottom: bottom - minY,
    border: { left, right, top, bottom },
  };
}
export function alignArtwork(
  alignment: Alignment,
  p: Project,
  art: Artwork,
): Partial<Project> {
  if (alignment === "center") return { artX: 0, artY: 0 };
  const t = alignmentTargets(p, art);
  return ["left", "centerX", "right"].includes(alignment)
    ? { artX: t[alignment as "left" | "centerX" | "right"] }
    : { artY: t[alignment as "top" | "centerY" | "bottom"] };
}
export function snapArtwork(
  p: Project,
  art: Artwork,
  x: number,
  y: number,
  tolerance: number,
) {
  const t = alignmentTargets(p, art);
  let sx = x,
    sy = y,
    gx: number | undefined,
    gy: number | undefined;
  let dx = tolerance,
    dy = tolerance;
  for (const [value, line] of [
    [t.centerX, 0],
    [t.left, t.border.left],
    [t.right, t.border.right],
  ]) {
    const d = Math.abs(x - value);
    if (d < dx) {
      dx = d;
      sx = value;
      gx = line;
    }
  }
  for (const [value, line] of [
    [t.centerY, 0],
    [t.top, t.border.top],
    [t.bottom, t.border.bottom],
  ]) {
    const d = Math.abs(y - value);
    if (d < dy) {
      dy = d;
      sy = value;
      gy = line;
    }
  }
  return { x: sx, y: sy, guideX: gx, guideY: gy };
}
