import type { ManifoldToplevel, CrossSection, Manifold } from "manifold-3d";
import type { Project, Artwork, Vec2, ModelData, MeshPart } from "../types";
import { insetShape, fitsPocket } from "./shapes";
export function outlines(p: Project, inset = 0): Vec2[][] {
  if (p.shape !== "custom") return [outline(p, inset)];
  return insetShape(
    p.shapeContours.map((loop) =>
      loop.map(([x, y]): Vec2 => [
        (x * p.diameter) / 100,
        (y * p.diameter) / 100,
      ]),
    ),
    inset,
  );
}
export function outline(p: Project, inset = 0): Vec2[] {
  if (p.shape === "custom") return outlines(p, inset)[0] ?? [];
  const r = p.diameter / 2 - inset;
  if (p.shape === "circle")
    return Array.from({ length: 256 }, (_, i) => {
      const a = (i / 256) * Math.PI * 2;
      return [r * Math.cos(a), r * Math.sin(a)];
    });
  if (p.shape === "hexagon") {
    const radius = p.diameter / 2 - inset / Math.cos(Math.PI / 6);
    return Array.from({ length: 6 }, (_, i) => [
      radius * Math.cos((i * Math.PI) / 3),
      radius * Math.sin((i * Math.PI) / 3),
    ]);
  }
  const cr = Math.max(0.5, p.diameter * 0.14 - inset),
    v: Vec2[] = [];
  for (let c = 0; c < 4; c++) {
    const angle = (c * Math.PI) / 2;
    const cx = (c === 0 || c === 3 ? 1 : -1) * (r - cr),
      cy = (c < 2 ? 1 : -1) * (r - cr);
    for (let i = 0; i <= 32; i++) {
      const a = angle + ((i / 32) * Math.PI) / 2;
      v.push([cx + cr * Math.cos(a), cy + cr * Math.sin(a)]);
    }
  }
  return v;
}
export function magnetCenters(p: Project): Vec2[] {
  if (p.magnetMode === "none") return [];
  if (p.magnetMode === "center") return [[0, 0]];
  const inradius =
    (p.diameter / 2) * (p.shape === "hexagon" ? Math.cos(Math.PI / 6) : 1);
  const r = inradius - p.edgeGap - (p.magnetDiameter + p.clearance) / 2;
  return Array.from({ length: p.magnetCount }, (_, i) => {
    const a = (2 * Math.PI * i) / p.magnetCount + Math.PI / 4;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
}
export function validate(p: Project): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(p.diameter) || p.diameter < 30 || p.diameter > 250)
    errors.push("Coaster size must be between 30 and 250 mm.");
  if (!Number.isFinite(p.thickness) || p.thickness < 1.2 || p.thickness > 20)
    errors.push("Thickness must be between 1.2 and 20 mm.");
  if (
    !Number.isFinite(p.inlayDepth) ||
    p.inlayDepth < 0.2 ||
    p.inlayDepth > p.thickness - 0.6
  )
    errors.push("Leave at least 0.6 mm of solid base under the color layer.");
  if (
    !Number.isFinite(p.margin) ||
    p.margin < 0 ||
    p.margin >= p.diameter / 2 - 2
  )
    errors.push("The border must leave room for your artwork.");
  if (p.shape === "custom") {
    if (!p.shapeContours.length)
      errors.push("Upload an SVG for your custom coaster shape.");
    else if (!outlines(p, p.margin).length)
      errors.push(
        "The border is too wide for this outline. Reduce the border.",
      );
  }
  if (p.magnetMode !== "none") {
    const pocket = p.magnetDiameter + p.clearance,
      depth = p.magnetDepth + 0.1;
    if (
      ![p.magnetDiameter, p.magnetDepth, p.clearance, p.edgeGap].every(
        Number.isFinite,
      ) ||
      p.magnetDiameter < 1 ||
      p.magnetDepth < 0.5 ||
      p.clearance < 0
    )
      errors.push("Enter a positive magnet size and nonnegative clearance.");
    if (depth > p.thickness - p.inlayDepth - 0.6)
      errors.push(
        "Magnets are too deep. Increase coaster thickness or use thinner magnets to leave a 0.6 mm roof beneath the artwork.",
      );
    const centers = magnetCenters(p),
      inradius =
        (p.diameter / 2) * (p.shape === "hexagon" ? Math.cos(Math.PI / 6) : 1);
    if (p.magnetMode === "outer" && p.edgeGap + pocket / 2 >= inradius)
      errors.push(
        "The edge gap leaves no room for outer magnets. Reduce the gap or magnet diameter.",
      );
    if (
      centers.some(([x, y]) =>
        p.shape === "custom"
          ? !fitsPocket(outlines(p), x, y, pocket / 2 + 0.8)
          : Math.hypot(x, y) + pocket / 2 > inradius - 0.8,
      ) ||
      (p.magnetMode === "outer" && p.edgeGap < 0.8)
    )
      errors.push(
        "Magnet pockets need at least 0.8 mm of material to the edge.",
      );
    for (let i = 0; i < centers.length; i++)
      for (let j = i + 1; j < centers.length; j++)
        if (
          Math.hypot(
            centers[i][0] - centers[j][0],
            centers[i][1] - centers[j][1],
          ) <
          pocket + 0.8
        ) {
          errors.push(
            "Magnet pockets are too close. Reduce their size or count, or move them outward.",
          );
          return errors;
        }
  }
  return errors;
}
export function artContours(p: Project, art: Artwork): Vec2[][][] {
  const unit =
      (p.diameter * p.artScale) / 100 / Math.max(art.width, art.height),
    a = (p.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return art.loops.map((loops) =>
    loops.map((loop) =>
      loop.map(([x, y]) => {
        x = (x - art.width / 2) * unit * (p.mirror ? -1 : 1);
        y = (art.height / 2 - y) * unit;
        return [x * c - y * s + p.artX, x * s + y * c + p.artY] as Vec2;
      }),
    ),
  );
}
export function paintContours(p: Project, art: Artwork): Vec2[][][] {
  return art.paintLoops
    ? artContours(p, { ...art, loops: art.paintLoops })
    : [];
}
export function buildModel(
  api: ManifoldToplevel,
  p: Project,
  art: Artwork,
): ModelData {
  const errors = validate(p);
  if (errors.length) throw new Error(errors[0]);
  const refs: Array<{ delete: () => void }> = [];
  const keep = <T extends { delete: () => void }>(x: T): T => {
    refs.push(x);
    return x;
  };
  const { CrossSection: CS, Manifold: M } = api;
  const parts: MeshPart[] = [];
  try {
    const outer = keep(new CS(outlines(p), "EvenOdd"));
    const clip = keep(new CS(outlines(p, p.margin), "EvenOdd"));
    const contours = artContours(p, art),
      painted = paintContours(p, art);
    let occupied = keep(CS.square(0));
    const regions: Array<{ section: CrossSection; colorIndex: number }> = [];
    for (let slot = 1; slot < p.colorCount; slot++) {
      const all = [
        ...contours.flatMap((loops, i) =>
          (p.mapping[i] ?? i) === slot ? loops : [],
        ),
        ...(painted[slot] ?? []),
      ];
      if (!all.length) continue;
      const raw = keep(new CS(all, "EvenOdd"));
      const clipped = keep(raw.intersect(clip));
      const section = keep(clipped.subtract(occupied));
      if (section.isEmpty()) continue;
      occupied = keep(occupied.add(section));
      regions.push({ section, colorIndex: slot });
    }
    const topBase = keep(outer.subtract(occupied));
    let base = keep(outer.extrude(p.thickness - p.inlayDepth));
    if (!topBase.isEmpty()) {
      const cap = keep(topBase.extrude(p.inlayDepth));
      const at = keep(cap.translate([0, 0, p.thickness - p.inlayDepth]));
      base = keep(base.add(at));
    }
    for (const [x, y] of magnetCenters(p)) {
      const hole = keep(
        M.cylinder(
          p.magnetDepth + 0.11,
          (p.magnetDiameter + p.clearance) / 2,
          undefined,
          96,
        ),
      );
      const at = keep(hole.translate([x, y, -0.01]));
      base = keep(base.subtract(at));
    }
    function part(solid: Manifold, colorIndex: number, name: string) {
      if (solid.status() !== "NoError")
        throw new Error(
          "The model could not be made watertight. Try a lower detail level.",
        );
      const mesh = solid.getMesh();
      const positions = new Float32Array(mesh.numVert * 3);
      for (let v = 0; v < mesh.numVert; v++)
        for (let c = 0; c < 3; c++)
          positions[v * 3 + c] = mesh.vertProperties[v * mesh.numProp + c];
      parts.push({
        name,
        colorIndex,
        positions,
        indices: new Uint32Array(mesh.triVerts),
        volume: solid.volume(),
      });
    }
    part(base, 0, "Coaster base");
    for (const { section, colorIndex } of regions) {
      const slab = keep(section.extrude(p.inlayDepth));
      const at = keep(slab.translate([0, 0, p.thickness - p.inlayDepth]));
      part(at, colorIndex, `Artwork · color ${colorIndex + 1}`);
    }
    return {
      parts,
      volume: parts.reduce((a, b) => a + b.volume, 0),
      triangles: parts.reduce((a, b) => a + b.indices.length / 3, 0),
      warnings:
        art.pixels === 0 && (p.source || p.sample !== "blank")
          ? [
              "The artwork is fully transparent. Only the base will be exported.",
            ]
          : [],
    };
  } finally {
    for (let i = refs.length - 1; i >= 0; i--) refs[i].delete();
  }
}
export function pathData(loops: Vec2[][]): string {
  return loops
    .map(
      (loop) =>
        "M" +
        loop.map(([x, y]) => `${x.toFixed(3)},${(-y).toFixed(3)}`).join("L") +
        "Z",
    )
    .join("");
}
