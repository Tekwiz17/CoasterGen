import { loadHoodie, exportHoodie, type Hoodie, type Raster } from "./hoodie";
import { quantize, findEdgeBlends, resolveEdgeBlends } from "./palette";
import { removeEdgeBackground } from "./background";
import type { ModelData } from "../types";
export const BASE_URL =
  "https://makerworld.com/en/models/2735879-blank-bookmark-kit#profileId-3033042";
export const CREDIT = `Made with BookmarkGen on MakerGen: https://makergen.vercel.app/#/bookmarkgen\nOriginal model: Blank Bookmark Kit by Tekwiz17 — ${BASE_URL}\nOriginal model license: CC0.`;
// The source's circular head is radius 17.960512 mm, centered here.
// Keep 0.8 mm of unpainted rim inside the original polygonal circumference.
export const HEAD_Y = 48.1697447;
export const PRINT_RADIUS = 17.1;
export type BookmarkDesign = {
  image?: Raster;
  colors: string[];
  auto: boolean;
  remove: boolean;
  smooth: boolean;
  size: number;
  rotation: number;
};
export function loadBookmark(bytes: Uint8Array) {
  return loadHoodie(bytes, "BLANK BOOKMARK KIT");
}
// Conforming subdivision: both neighbors share every split edge. The original
// 268-face mesh has enormous planar triangles, so centroid painting alone loses logos.
export function prepareBookmark(base: Hoodie) {
  let points = base.points.slice(),
    faces = base.faces;
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let pass = 0; pass < 12; pass++) {
    const edges = new Map<string, number>();
    for (const f of faces) {
      if (
        !f.every((i) => points[i][2] > 0.99) ||
        Math.max(...f.map((i) => points[i][1])) < HEAD_Y - PRINT_RADIUS
      )
        continue;
      for (let j = 0; j < 3; j++) {
        const a = f[j],
          b = f[(j + 1) % 3];
        if (Math.hypot(...points[a].map((v, k) => v - points[b][k])) > 0.3)
          edges.set(key(a, b), -1);
      }
    }
    if (!edges.size) break;
    const next: number[][] = [];
    const mid = (a: number, b: number) => {
      const k = key(a, b);
      let i = edges.get(k)!;
      if (i < 0) {
        i = points.length;
        points.push(points[a].map((v, k) => (v + points[b][k]) / 2));
        edges.set(k, i);
      }
      return i;
    };
    for (const f of faces) {
      const split = f.map((a, j) => edges.has(key(a, f[(j + 1) % 3]))),
        n = split.filter(Boolean).length;
      if (!n) {
        next.push(f);
        continue;
      }
      if (n === 3) {
        const [a, b, c] = f,
          ab = mid(a, b),
          bc = mid(b, c),
          ca = mid(c, a);
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
        continue;
      }
      const j = n === 1 ? split.indexOf(true) : (split.indexOf(false) + 1) % 3,
        a = f[j],
        b = f[(j + 1) % 3],
        c = f[(j + 2) % 3],
        ab = mid(a, b);
      if (n === 1) next.push([a, ab, c], [ab, b, c]);
      else {
        const bc = mid(b, c);
        next.push([b, bc, ab], [a, ab, c], [ab, bc, c]);
      }
    }
    faces = next;
    if (faces.length > 600000)
      throw Error("Bookmark detail exceeds the browser's mesh budget.");
  }
  return { ...base, points, faces };
}
export function colorBookmark(h: Hoodie, d: BookmarkDesign) {
  const r = d.image,
    mask = new Uint8Array(r ? r.width * r.height : 0);
  if (r)
    for (let i = 0; i < mask.length; i++)
      mask[i] = r.data[i * 4 + 3] < 128 ? 1 : 0;
  if (r && d.remove) removeEdgeBackground(r.data, r.width, r.height, mask);
  const q = r
    ? quantize(
        r.data,
        r.width,
        r.height,
        d.colors.length,
        d.colors[0],
        mask,
        true,
        false,
        d.auto ? undefined : d.colors,
      )
    : null;
  const colors = q
    ? q.colors.map((c) =>
        typeof c === "string"
          ? c
          : "#" +
            c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""),
      )
    : d.colors;
  if (q && r && d.smooth)
    q.labels.set(
      resolveEdgeBlends(
        q.labels,
        r.width,
        findEdgeBlends(r.data, r.width, r.height, mask),
        r.data,
        q.colors,
      ),
    );
  const slots = new Uint8Array(h.faces.length),
    groups = colors.map(() => [] as number[]);
  const angle = (d.rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  // Fit the entire rectangle in the circle, including portrait and landscape images.
  const width = r
    ? (2 * PRINT_RADIUS * d.size) /
      100 /
      Math.sqrt(1 + (r.height / r.width) ** 2)
    : 1;
  const height = r ? (width * r.height) / r.width : 1;
  h.faces.forEach((f, i) => {
    const p = f.map((v) => h.points[v]);
    const x = (p[0][0] + p[1][0] + p[2][0]) / 3,
      y = (p[0][1] + p[1][1] + p[2][1]) / 3 - HEAD_Y;
    if (
      r &&
      q &&
      p.every((v) => v[2] > 0.99) &&
      x * x + y * y <= PRINT_RADIUS ** 2
    ) {
      const u = (x * cos + y * sin) / width + 0.5,
        v = 0.5 - (-x * sin + y * cos) / height;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        const px = Math.floor(v * r.height) * r.width + Math.floor(u * r.width);
        if (!mask[px]) slots[i] = q.labels[px];
      }
    }
    groups[slots[i]].push(...f);
  });
  const positions = new Float32Array(h.points.flat());
  const model: ModelData = {
    parts: groups.flatMap((g, i) =>
      g.length
        ? [
            {
              name: `Bookmark filament ${i + 1}`,
              colorIndex: i,
              positions,
              indices: new Uint32Array(g),
              volume: 0,
            },
          ]
        : [],
    ),
    volume: 0,
    triangles: h.faces.length,
    warnings: [],
  };
  return { model, slots, colors };
}
export function exportBookmark(h: Hoodie, slots: Uint8Array, colors: string[]) {
  return exportHoodie(h, slots, colors, {
    name: "BookmarkGen",
    part: "Bookmark",
    original: "Blank Bookmark Kit by Tekwiz17",
    credit: CREDIT,
  });
}
