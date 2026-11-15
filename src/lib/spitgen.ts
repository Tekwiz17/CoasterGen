import { unzipSync, strFromU8 } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { MeshPart } from "../types";
export type Fit = "SnapFit" | "ClickFit" | "GlueFit" | "TightFit";
export type Grouping = "groups" | "colors" | "pieces";
export interface SplitPart extends MeshPart {
  color: string;
  group: string;
}
export interface SplitResult {
  parts: SplitPart[];
  warnings: string[];
  connectors: number;
  bounds?: { min: number[]; max: number[] };
  recommendation?: { fit: Fit; reason: string };
}
const list = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
});
function xml(bytes: Uint8Array) {
  const text = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true)
    throw Error("The 3MF contains invalid or unsupported XML.");
  return parser.parse(text);
}
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
function matrix(s?: string) {
  const m = s ? String(s).trim().split(/\s+/).map(Number) : identity;
  if (m.length !== 12 || !m.every(Number.isFinite))
    throw Error("Invalid 3MF transform.");
  return m;
}
function point(v: number[], m: number[]) {
  return [
    v[0] * m[0] + v[1] * m[3] + v[2] * m[6] + m[9],
    v[0] * m[1] + v[1] * m[4] + v[2] * m[7] + m[10],
    v[0] * m[2] + v[1] * m[5] + v[2] * m[8] + m[11],
  ];
}
function path(base: string, target: string) {
  const out: string[] = [];
  for (const p of (target.startsWith("/")
    ? target
    : base.slice(0, base.lastIndexOf("/") + 1) + target
  ).split("/")) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}
export function read3mf(bytes: Uint8Array): SplitPart[] {
  if (bytes.length > 40 * 1024 * 1024) throw Error("Choose a 3MF under 40 MB.");
  let expanded = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      if (!/\.(model|config)$|^_rels\/\.rels$/i.test(f.name)) return false;
      expanded += f.originalSize;
      if (expanded > 100 * 1024 * 1024)
        throw Error("This 3MF is too large to unpack in the browser.");
      return true;
    },
  });
  let main = "3D/3dmodel.model";
  if (files["_rels/.rels"]) {
    const rel = list(
      xml(files["_rels/.rels"]).Relationships?.Relationship,
    ).find((r) => String(r.Type).endsWith("/3dmodel"));
    if (rel) main = path("", rel.Target);
  }
  if (!files[main])
    throw Error(
      "No 3D model found. Choose a model 3MF, not a printer-only or G-code project.",
    );
  let colors: string[] = [];
  try {
    colors =
      JSON.parse(strFromU8(files["Metadata/project_settings.config"]))
        .filament_colour ?? [];
  } catch {}
  const assignments = new Map<
    string,
    { base?: number; parts: Map<string, number> }
  >();
  if (files["Metadata/model_settings.config"]) {
    const config = xml(files["Metadata/model_settings.config"]).config;
    for (const o of list(config?.object)) {
      const slot = (p: any) => {
        const e = list(p.metadata).find((m) => m.key === "extruder");
        return e && Number(e.value) > 0 ? Number(e.value) - 1 : undefined;
      };
      const parts = new Map<string, number>();
      for (const p of list(o.part)) {
        const value = slot(p);
        if (value !== undefined) parts.set(String(p.id), value);
      }
      assignments.set(String(o.id), { base: slot(o), parts });
    }
  }
  const models = new Map<string, any>();
  const get = (file: string) => {
    if (!models.has(file)) {
      if (!files[file])
        throw Error("A component file is missing from this 3MF.");
      models.set(file, xml(files[file]).model);
    }
    return models.get(file);
  };
  const result: SplitPart[] = [];
  const walk = (
    file: string,
    id: string,
    transforms: number[][],
    group: string,
    stack: Set<string>,
    inherited?: number,
    slots: Map<string, number> = new Map(),
    rootObject = false,
  ) => {
    const key = file + ":" + id;
    if (stack.has(key) || stack.size > 32)
      throw Error("The 3MF contains a circular or overly nested assembly.");
    const next = new Set(stack).add(key),
      m = get(file),
      resources = m.resources;
    const obj = list(resources?.object).find(
      (o) => String(o.id) === String(id),
    );
    if (!obj) throw Error("A model object could not be found.");
    const extruder =
      (!rootObject ? slots.get(String(id)) : undefined) ?? inherited;
    if (obj.components) {
      for (const c of list(obj.components.component))
        walk(
          c.path ? path(file, c.path) : file,
          String(c.objectid),
          [matrix(c.transform), ...transforms],
          group,
          next,
          extruder,
          slots,
        );
      return;
    }
    if (!obj.mesh) return;
    const units: Record<string, number> = {
      micron: 0.001,
      millimeter: 1,
      centimeter: 10,
      meter: 1000,
      inch: 25.4,
      foot: 304.8,
    };
    const unit = units[m.unit ?? "millimeter"];
    if (!unit) throw Error("Unsupported 3MF units.");
    const vertices = list(obj.mesh.vertices?.vertex).map((v) => {
      let p = [Number(v.x), Number(v.y), Number(v.z)];
      for (const t of transforms) p = point(p, t);
      return p.map((n) => n * unit);
    });
    if (
      vertices.length > 600000 ||
      !vertices.every((v) => v.every(Number.isFinite))
    )
      throw Error("Mesh has too many or invalid vertices.");
    const mirrored =
      transforms.reduce(
        (sign, m) =>
          sign *
          (m[0] * (m[4] * m[8] - m[5] * m[7]) -
            m[3] * (m[1] * m[8] - m[2] * m[7]) +
            m[6] * (m[1] * m[5] - m[2] * m[4])),
        1,
      ) < 0;
    const buckets = new Map<string, number[]>();
    for (const t of list(obj.mesh.triangles?.triangle)) {
      if (t.paint_color || t.mmu_segmentation)
        throw Error(
          "Surface-painted models need solid color parts first. In Bambu Studio, use a model with separate parts rather than painted faces.",
        );
      const index = String(t.p1 ?? obj.pindex ?? 0),
        pid = String(t.pid ?? obj.pid ?? "");
      if (
        (t.p2 !== undefined && String(t.p2) !== index) ||
        (t.p3 !== undefined && String(t.p3) !== index)
      )
        throw Error(
          "Gradient or texture colors cannot be split into solid parts.",
        );
      const resource = [
        ...list(resources.basematerials),
        ...list(resources.colorgroup),
      ].find((r) => String(r.id) === pid);
      const color = String(
        list(resource?.base)[Number(index)]?.displaycolor ??
          list(resource?.color)[Number(index)]?.color ??
          (extruder !== undefined ? colors[extruder] : undefined) ??
          "#B8C4BC",
      )
        .slice(0, 7)
        .toUpperCase();
      if (!/^#[A-F0-9]{6}$/.test(color))
        throw Error("Unsupported material color.");
      const indices = [t.v1, t.v2, t.v3].map(Number);
      if (
        indices.some(
          (i) => !Number.isInteger(i) || i < 0 || i >= vertices.length,
        )
      )
        throw Error("Invalid triangle indices.");
      if (mirrored) [indices[1], indices[2]] = [indices[2], indices[1]];
      const bucket = buckets.get(color) ?? [];
      bucket.push(...indices);
      buckets.set(color, bucket);
    }
    for (const [color, indices] of buckets) {
      if (result.length >= 64)
        throw Error(
          "This model has more than 64 color parts. Split a smaller assembly first.",
        );
      const remap = new Map<number, number>(),
        compact: number[] = [];
      const triangles = indices.map((i) => {
        if (!remap.has(i)) {
          remap.set(i, remap.size);
          compact.push(...vertices[i]);
        }
        return remap.get(i)!;
      });
      result.push({
        name: String(obj.name ?? `Part ${id}`),
        group,
        color,
        colorIndex: 0,
        positions: new Float32Array(compact),
        indices: new Uint32Array(triangles),
        volume: 0,
      });
    }
  };
  const root = get(main);
  for (const [i, item] of list(root.build?.item).entries())
    walk(
      main,
      String(item.objectid),
      [matrix(item.transform)],
      `Group ${i + 1}`,
      new Set(),
      assignments.get(String(item.objectid))?.base,
      assignments.get(String(item.objectid))?.parts,
      true,
    );
  if (!result.length) throw Error("No printable mesh objects found.");
  return result;
}
