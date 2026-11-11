import { strToU8, zipSync } from "fflate";
import type { Artwork, ModelData, Project } from "../types";
import { artContours, paintContours, outlines, pathData } from "./geometry";
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const n = (v: number) => Number(v.toFixed(6)).toString();
export function export3mf(
  p: Project,
  model: ModelData,
): Uint8Array<ArrayBuffer> {
  const resources = [
    `<basematerials id="1">${p.colors
      .slice(0, p.colorCount)
      .map(
        (c, i) =>
          `<base name="${xml(i === 0 ? "Coaster base" : `Filament ${i + 1}`)}" displaycolor="${c.toUpperCase()}FF"/>`,
      )
      .join("")}</basematerials>`,
  ];
  model.parts.forEach((part, i) => {
    const vs: string[] = [],
      ts: string[] = [];
    for (let j = 0; j < part.positions.length; j += 3)
      vs.push(
        `<vertex x="${n(part.positions[j])}" y="${n(part.positions[j + 1])}" z="${n(part.positions[j + 2])}"/>`,
      );
    for (let j = 0; j < part.indices.length; j += 3)
      ts.push(
        `<triangle v1="${part.indices[j]}" v2="${part.indices[j + 1]}" v3="${part.indices[j + 2]}"/>`,
      );
    resources.push(
      `<object id="${i + 2}" type="model" name="${xml(part.name)}" pid="1" pindex="${part.colorIndex}"><mesh><vertices>${vs.join("")}</vertices><triangles>${ts.join("")}</triangles></mesh></object>`,
    );
  });
  const groupId = 100,
    shift = p.diameter / 2 + 2;
  resources.push(
    `<object id="${groupId}" type="model" name="${xml(p.name)}"><components>${model.parts.map((_, i) => `<component objectid="${i + 2}"/>`).join("")}</components></object>`,
  );
  const modelXml = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">CoasterGen</metadata><metadata name="Title">${xml(p.name)}</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><resources>${resources.join("")}</resources><build><item objectid="${groupId}" transform="1 0 0 0 1 0 0 0 1 ${n(shift)} ${n(shift)} 0"/></build></model>`;
  const config = `<?xml version="1.0" encoding="UTF-8"?><config><object id="${groupId}"><metadata key="name" value="${xml(p.name)}"/><metadata key="extruder" value="1"/>${model.parts.map((part, i) => `<part id="${i + 2}" subtype="normal_part"><metadata key="name" value="${xml(part.name)}"/><metadata key="extruder" value="${part.colorIndex + 1}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><mesh_stat face_count="${part.indices.length / 3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/></part>`).join("")}</object><plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="CoasterGen"/><metadata key="locked" value="false"/><model_instance><metadata key="object_id" value="${groupId}"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="0"/></model_instance></plate></config>`;
  const settings = {
    type: "project",
    version: "01.09.00.00",
    name: p.name,
    from: "User",
    filament_colour: p.colors.slice(0, p.colorCount),
    filament_settings_id: Array(p.colorCount).fill("Generic PLA"),
    filament_type: Array(p.colorCount).fill("PLA"),
    filament_diameter: Array(p.colorCount).fill("1.75"),
    filament_density: Array(p.colorCount).fill("1.24"),
  };
  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/octet-stream"/><Default Extension="json" ContentType="application/json"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
      ),
      "3D/3dmodel.model": strToU8(modelXml),
      "Metadata/model_settings.config": strToU8(config),
      "Metadata/project_settings.config": strToU8(JSON.stringify(settings)),
      "Metadata/coastergen.json": strToU8(
        JSON.stringify({ ...p, source: undefined, cleanupMask: undefined }),
      ),
    },
    { level: 6 },
  );
}
export function exportSvg(p: Project, art: Artwork): string {
  const r = p.diameter / 2,
    outer = pathData(outlines(p)),
    clip = pathData(outlines(p, p.margin)),
    contours = [
      ...artContours(p, art).map((loops, i) => ({
        loops,
        slot: p.mapping[i] ?? i,
      })),
      ...paintContours(p, art).map((loops, slot) => ({ loops, slot })),
    ];
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${p.diameter}mm" height="${p.diameter}mm" viewBox="${-r} ${-r} ${p.diameter} ${p.diameter}"><title>${xml(p.name)}</title><defs><clipPath id="art-area"><path d="${clip}" clip-rule="evenodd"/></clipPath></defs><path d="${outer}" fill-rule="evenodd" fill="${p.colors[0]}"/><g clip-path="url(#art-area)">${contours.map(({ loops, slot }) => (slot === 0 ? "" : `<path fill="${p.colors[slot]}" fill-rule="evenodd" d="${pathData(loops)}"/>`)).join("")}</g></svg>`;
}
export function exportStl(model: ModelData): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + model.triangles * 50),
    dv = new DataView(buffer);
  new Uint8Array(buffer, 0, 80).set(
    strToU8("CoasterGen | geometry only | units: mm"),
  );
  dv.setUint32(80, model.triangles, true);
  let offset = 84;
  for (const p of model.parts)
    for (let i = 0; i < p.indices.length; i += 3) {
      const verts = Array.from(p.indices.slice(i, i + 3), (v) =>
        Array.from(p.positions.slice(v * 3, v * 3 + 3)),
      );
      const a = verts[0],
        b = verts[1],
        c = verts[2],
        u = b.map((v, j) => v - a[j]),
        v = c.map((v, j) => v - a[j]);
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const len = Math.hypot(...normal) || 1;
      for (const value of [...normal.map((v) => v / len), ...verts.flat()]) {
        dv.setFloat32(offset, value, true);
        offset += 4;
      }
      offset += 2;
    }
  return buffer;
}
