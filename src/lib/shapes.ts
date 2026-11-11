import Clipper from "clipper-lib";
import type { Vec2 } from "../types";
const SCALE = 10000;
const paths = (loops: Vec2[][]): Clipper.Paths =>
  loops.map((loop) =>
    loop.map(([x, y]) => ({
      X: Math.round(x * SCALE),
      Y: Math.round(y * SCALE),
    })),
  );
const vectors = (polygons: Clipper.Paths): Vec2[][] =>
  polygons.map((loop) => loop.map(({ X, Y }) => [X / SCALE, Y / SCALE]));
export function cleanShape(loops: Vec2[][]): Vec2[][] {
  return vectors(
    Clipper.Clipper.SimplifyPolygons(
      paths(loops),
      Clipper.PolyFillType.pftEvenOdd,
    ),
  );
}
export function insetShape(loops: Vec2[][], inset: number): Vec2[][] {
  if (!inset) return loops;
  const offset = new Clipper.ClipperOffset(2, 0.01 * SCALE);
  offset.AddPaths(
    paths(loops),
    Clipper.JoinType.jtRound,
    Clipper.EndType.etClosedPolygon,
  );
  const result: Clipper.Paths = [];
  offset.Execute(result, -inset * SCALE);
  return vectors(result);
}
export function shapeError(value: unknown): string {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 64 ||
    value.some(
      (loop) =>
        !Array.isArray(loop) ||
        loop.length < 3 ||
        loop.some(
          (pt) =>
            !Array.isArray(pt) ||
            pt.length !== 2 ||
            !pt.every(
              (n) =>
                typeof n === "number" &&
                Number.isFinite(n) &&
                Math.abs(n) <= 100,
            ),
        ),
    )
  )
    return "Choose a filled SVG with a clear, closed outline.";
  const loops = value as Vec2[][];
  if (loops.reduce((n, loop) => n + loop.length, 0) > 12000)
    return "This outline is too complex. Simplify the SVG and try again.";
  const tree = new Clipper.PolyTree(),
    clip = new Clipper.Clipper();
  clip.AddPaths(paths(loops), Clipper.PolyType.ptSubject, true);
  clip.Execute(
    Clipper.ClipType.ctUnion,
    tree,
    Clipper.PolyFillType.pftEvenOdd,
    Clipper.PolyFillType.pftEvenOdd,
  );
  let solids = 0;
  for (let node = tree.GetFirst(); node; node = node.GetNext())
    if (!node.IsHole()) solids++;
  if (solids !== 1)
    return "Use one connected shape. Join separate pieces in your SVG first.";
  const pts = loops.flat(),
    xs = pts.map((pt) => pt[0]),
    ys = pts.map((pt) => pt[1]);
  const width = Math.max(...xs) - Math.min(...xs),
    height = Math.max(...ys) - Math.min(...ys);
  if (
    Math.min(width, height) < 1 ||
    Math.abs(Math.max(width, height) - 100) > 0.1 ||
    Math.abs(Math.max(...xs) + Math.min(...xs)) > 0.1 ||
    Math.abs(Math.max(...ys) + Math.min(...ys)) > 0.1
  )
    return "The saved custom outline has invalid dimensions. Upload the SVG again.";
  return "";
}
export function normalizeShape(loops: Vec2[][], height: number): Vec2[][] {
  const polygons = cleanShape(
    loops.map((loop) => loop.map(([x, y]) => [x, height - y])),
  );
  if (polygons.reduce((n, loop) => n + loop.length, 0) > 12000)
    throw new Error(
      "This outline is too complex. Simplify the SVG and try again.",
    );
  const pts = polygons.flat();
  if (!pts.length)
    throw new Error(
      "This SVG is empty. Use a filled shape on a transparent background.",
    );
  const xs = pts.map((pt) => pt[0]),
    ys = pts.map((pt) => pt[1]);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    bottom = Math.min(...ys),
    top = Math.max(...ys);
  const size = Math.max(right - left, top - bottom);
  const normalized = polygons.map((loop) =>
    loop.map(([x, y]): Vec2 => [
      ((x - (left + right) / 2) * 100) / size,
      ((y - (bottom + top) / 2) * 100) / size,
    ]),
  );
  const error = shapeError(normalized);
  if (error) throw new Error(error);
  return cleanShape(normalized);
}
export function fitsPocket(
  loops: Vec2[][],
  x: number,
  y: number,
  radius: number,
): boolean {
  let inside = false,
    distance = Infinity;
  for (const loop of loops)
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const [ax, ay] = loop[j],
        [bx, by] = loop[i];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
        inside = !inside;
      const dx = bx - ax,
        dy = by - ay,
        t = Math.max(
          0,
          Math.min(
            1,
            ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1),
          ),
        );
      distance = Math.min(
        distance,
        Math.hypot(x - ax - t * dx, y - ay - t * dy),
      );
    }
  return inside && distance >= radius;
}
