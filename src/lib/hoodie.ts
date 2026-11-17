import { refineColorEdges } from "./hoodierefine";
import { panels, layoutPanels, atlasUV } from "./hoodiemap";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { quantize, findEdgeBlends, resolveEdgeBlends } from "./palette";
import { removeEdgeBackground } from "./background";
import type { ModelData } from "../types";
export const BASE_URL =
  "https://makerworld.com/en/models/2074420-hoodie-pen-pot#profileId-2240823";
export const CREDIT = `Made with HoodieGen on MakerGen: https://makergen.vercel.app/#/hoodiegen\nOriginal base: Hoodie Pen Pot by Morganja — ${BASE_URL}\nThe original model's license still applies. Credit does not grant redistribution or commercial rights.`;
export type Raster = { width: number; height: number; data: Uint8ClampedArray };
export type Placement = { width: number; x: number; z: number };
export type Design = {
  mode: "image" | "map";
  front?: Raster;
  back?: Raster;
  map?: Raster;
  frontPlace: Placement;
  backPlace: Placement;
  colors: string[];
  auto: boolean;
  remove: boolean;
  smooth: boolean;
  betaEdges?: boolean;
  smoothing?: number;
  mapScale?: number;
  mapLayout?: number;
};
export function paintCode(slot: number) {
  return slot < 3
    ? (slot * 4).toString(16)
    : `${(slot - 3).toString(16).toUpperCase()}C`;
}
export function surfaceUV(x: number, y: number, z: number, height: number) {
  const a = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
  return [(a / (Math.PI * 2) + 0.125) % 1, 1 - z / height];
}
export function loadHoodie(bytes: Uint8Array, expectedName = "Hoodie Pen Pot") {
  let total = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      total += f.originalSize;
      if (total > 180e6)
        throw Error(
          "This project is too large. Use the original Hoodie Pen Pot model.",
        );
      return true;
    },
  });
  const key = "3D/3dmodel.model";
  if (!files[key]) throw Error("Load the original Hoodie Pen Pot 3MF.");
  const xml = strFromU8(files[key]);
  if (/<!DOCTYPE|<!ENTITY/.test(xml)) throw Error("Unsupported model XML.");
  const verts = [
    ...xml.matchAll(
      /<vertex\s+[^>]*x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"[^>]*\/>/g,
    ),
  ].map((m) => [+m[1], +m[2], +m[3]]);
  const faces = [
    ...xml.matchAll(
      /<triangle\s+[^>]*v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"[^>]*\/>/g,
    ),
  ].map((m) => [+m[1], +m[2], +m[3]]);
  if (!verts.length || !faces.length || !xml.includes(expectedName))
    throw Error("Please choose the original Hoodie Pen Pot 3MF linked above.");
  if (
    verts.some((v) => !v.every(Number.isFinite)) ||
    faces.some((f) => f.some((i) => i >= verts.length))
  )
    throw Error("Invalid mesh.");
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const v of verts)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[k]);
      max[k] = Math.max(max[k], v[k]);
    }
  const points = verts.map((v) => [
    v[0] - (max[0] + min[0]) / 2,
    v[1] - (max[1] + min[1]) / 2,
    v[2] - min[2],
  ]);
  return { files, key, xml, points, faces, height: max[2] - min[2] };
}
export type Hoodie = ReturnType<typeof loadHoodie>;
export function colorHoodie(h: Hoodie, d: Design, pass = 0): {model:ModelData;slots:Uint8Array;colors:string[];hoodie:Hoodie} {
  const rasters = [
    d.mode === "map" ? d.map : d.front,
    d.mode === "image" ? d.back : undefined,
  ];
  // One shared CoasterGen palette, including base filament, for both sides.
  const valid = rasters.filter(Boolean) as Raster[];
  const pixels = new Uint8ClampedArray(
    valid.reduce((n, r) => n + r.data.length, 0),
  );
  const transparent = new Uint8Array(pixels.length / 4);
  let offset = 0;
  for (const r of valid) {
    pixels.set(r.data, offset * 4);
    const mask = new Uint8Array(r.width * r.height);
    for (let i = 0; i < mask.length; i++)
      mask[i] = r.data[i * 4 + 3] < 128 ? 1 : 0;
    if (d.remove && d.mode === "image")
      removeEdgeBackground(r.data, r.width, r.height, mask);
    transparent.set(mask, offset);
    offset += mask.length;
  }
  let baseColor = d.colors[0];
  if (d.mode === "map" && d.auto && valid.length) {
    const counts = new Map<string, number>();
    for (let i=0; i<pixels.length/4; i++) { if(transparent[i]) continue; const r=valid[0];const x=(i%r.width)/r.width*2048,y=Math.floor(i/r.width)/r.height*1024;if(!layoutPanels(d.mapLayout).some(p=>x>=p.x+p.w*.27&&x<=p.x+p.w*.73&&y>=p.y+p.h*.12&&y<=p.y+p.h*.95))continue; const k = "#" + Array.from(pixels.slice(i*4,i*4+3)).map(v=>v.toString(16).padStart(2,"0")).join(""); counts.set(k,(counts.get(k)||0)+1); }
    baseColor = [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? baseColor;
  }
  const q = valid.length
    ? quantize(
        pixels,
        pixels.length / 4,
        1,
        d.colors.length,
        baseColor,
        transparent,
        true,
        false,
        d.auto ? undefined : d.colors,
      )
    : null;
  if (q && d.smooth) {
    let start = 0;
    for (const r of valid) {
      const mask = transparent.slice(start, start + r.width * r.height);
      const labels = resolveEdgeBlends(
        q.labels.slice(start, start + mask.length),
        r.width,
        findEdgeBlends(r.data, r.width, r.height, mask),
        r.data,
        q.colors,
      );
      q.labels.set(labels, start);
      start += mask.length;
    }
  }
  const colors = q
    ? q.colors.map((c) =>
        typeof c === "string"
          ? c
          : "#" +
            c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""),
      )
    : d.colors;
  const sample = (
    r: Raster | undefined,
    u: number,
    v: number,
    start: number,
  ) => {
    if (!r || u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
    const i = Math.floor(v * r.height) * r.width + Math.floor(u * r.width);
    return transparent[start + i] ? 0 : q!.labels[start + i];
  };
  const quality=Math.max(1,Math.min(10,Math.round(d.smoothing??(d.betaEdges?6:1))));
  const passes=quality===1?0:Math.ceil((quality-1)/3);
  const slots = new Uint8Array(h.faces.length);
  let meshWidth=0;for(const p of h.points)meshWidth=Math.max(meshWidth,Math.abs(p[0])*2);

  h.faces.forEach((f, i) => {
    const a = h.points[f[0]],
      b = h.points[f[1]],
      c = h.points[f[2]],
      p = a.map((v, k) => (v + b[k] + c[k]) / 3),
      u = b.map((v, k) => v - a[k]),
      v = c.map((v, k) => v - a[k]),
      n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
    let slot = 0;
    if (d.mode === "map" && n[0]*p[0]+n[1]*p[1] > 0) {
      const uv = atlasUV(p[0], p[1], p[2], h.height, meshWidth, d.mapScale, d.mapLayout);
      slot = sample(d.map, uv[0], uv[1], 0);
    } else if (d.mode === "image") {
      const front = p[1] < 0;
      const r = front ? d.front : d.back,
        t = front ? d.frontPlace : d.backPlace;
      const norm = Math.hypot(...n);
      if (r && Math.abs(p[0]) < 34 && (front ? -n[1] : n[1]) > norm * 0.25) {
        const hh = (t.width * r.height) / r.width;
        slot = sample(
          r,
          ((front ? p[0] : -p[0]) - t.x) / t.width + 0.5,
          0.5 - (p[2] - t.z) / hh,
          front ? 0 : (d.front?.width ?? 0) * (d.front?.height ?? 0),
        );
      }
    }
    slots[i] = slot;

  });
  if (quality>1 && valid.length && pass < passes) {
    let refined;
    const at=(p:number[])=>{
      if(d.mode==="map"){const uv=atlasUV(p[0],p[1],p[2],h.height,meshWidth,d.mapScale,d.mapLayout);return sample(d.map,uv[0],uv[1],0);}
      const front=p[1]<0,r=front?d.front:d.back,t=front?d.frontPlace:d.backPlace;
      if(!r || Math.abs(p[0])>=34)return 0;
      return sample(r,((front?p[0]:-p[0])-t.x)/t.width+.5,.5-(p[2]-t.z)/(t.width*r.height/r.width),front?0:(d.front?.width??0)*(d.front?.height??0));
    };
    try { refined=refineColorEdges(h.points,h.faces,slots,1800000,at,quality+3,(11-quality)*.025); }
    catch(error) { if (!(error instanceof RangeError) || pass===0) throw error; }
    if(!refined) return colorHoodie(h,d,passes);
    if(refined.faces!==h.faces) return colorHoodie({...h,...refined}, {...d,auto:false,colors},pass+1);
  }
  if (d.smooth && valid.length && quality===1) {
    // Remove isolated facet speckles using shared mesh vertices. Strong boundaries survive.
    const counts = new Uint32Array(h.points.length);
    for (const f of h.faces) for (const v of f) counts[v]++;
    const offsets = new Uint32Array(counts.length + 1);
    for (let i=0;i<counts.length;i++) offsets[i+1]=offsets[i]+counts[i];
    const cursor=offsets.slice(), incidence=new Uint32Array(offsets[offsets.length-1]);
    h.faces.forEach((f,i)=>{for(const v of f) incidence[cursor[v]++]=i;});
    const original=slots.slice(), votes=new Uint32Array(colors.length);
    h.faces.forEach((f,i)=>{
      votes.fill(0);let total=0;
      for(const v of f) for(let k=offsets[v];k<offsets[v+1];k++) {
        const other=incidence[k];if(other===i)continue;
        votes[original[other]]++;total++;
      }
      let best=original[i];for(let k=0;k<votes.length;k++)if(votes[k]>votes[best])best=k;
      if(total>=6 && votes[original[i]]<=2 && votes[best]>=total*0.8)slots[i]=best;
    });
  }
  const groups = colors.map(() => [] as number[]);
  h.faces.forEach((f,i)=>groups[slots[i]].push(...f));
  const positions = new Float32Array(h.points.flat());
  const model: ModelData = {
    parts: groups.flatMap((g, i) =>
      g.length
        ? [
            {
              name: `Hoodie filament ${i + 1}`,
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
  return { model, slots, colors, hoodie:h };
}
export function exportHoodie(h: Hoodie, slots: Uint8Array, colors: string[], branding = { name: "HoodieGen", part: "Hoodie", original: "Hoodie Pen Pot by Morganja", credit: CREDIT }) {
  if (!h.points.length || !h.faces.length) throw Error("The hoodie has no geometry to export.");
  if (!colors.length || colors.some(c => !/^#[0-9a-f]{6}$/i.test(c)))
    throw Error("Choose at least one valid filament color before exporting.");
  if (slots.length !== h.faces.length || slots.some(s => s >= colors.length))
    throw Error("The hoodie colors are out of date. Generate the preview again.");

  // Write a new project, never copy the source archive's sliced plate records,
  // printer presets, relationships, or assembly/part IDs into a changed mesh.
  const origin = h.xml.match(/<vertex\s+[^>]*x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/);
  const offset = origin ? [+origin[1]-h.points[0][0], +origin[2]-h.points[0][1], +origin[3]-h.points[0][2]] : [0,0,0];
  const vertices = h.points.map(p => '<vertex x="'+(p[0]+offset[0])+'" y="'+(p[1]+offset[1])+'" z="'+(p[2]+offset[2])+'"/>').join("\n");
  const triangles = h.faces.map((f,i) => '<triangle v1="'+f[0]+'" v2="'+f[1]+'" v3="'+f[2]+'" paint_color="'+paintCode(slots[i]+1)+'"/>').join("\n");
  const transform = h.xml.match(/<item\b[^>]*\btransform="([^"]+)"/)?.[1] ?? "1 0 0 0 1 0 0 0 1 0 0 0";
  const attribution = [...h.xml.matchAll(/<metadata\b[^>]*\/?>(?:[^<]*<\/metadata>)?/g)]
    .map(m=>m[0]).filter(m=>!/name="(?:Application|BambuStudio:3mfVersion|HoodieGen|Profile[^"]*|ModelPreview[^"]*)"/.test(m)).join("\n");
  const model = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">\n'
    + '<metadata name="Application">BambuStudio-02.01.01.52</metadata>\n<metadata name="BambuStudio:3mfVersion">1</metadata>\n'
    + attribution + '\n<metadata name="'+branding.name+'">Made with '+branding.name+' on MakerGen. Original: '+branding.original+'.</metadata>\n'
    + '<resources><object id="2" type="model"><mesh><vertices>\n'+vertices+'\n</vertices><triangles>\n'+triangles+'\n</triangles></mesh></object></resources>\n'
    + '<build><item objectid="2" transform="'+transform+'"/></build></model>';
  const config = '<?xml version="1.0" encoding="UTF-8"?>\n<config><object id="2"><metadata key="name" value="'+branding.name+'"/><metadata key="extruder" value="1"/><metadata face_count="'+h.faces.length+'"/>'
    + '<part id="2" subtype="normal_part"><metadata key="name" value="'+branding.part+'"/><metadata key="extruder" value="1"/><mesh_stat face_count="'+h.faces.length+'" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/></part></object>'
    + '<plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="'+branding.name+'"/><metadata key="locked" value="false"/><model_instance><metadata key="object_id" value="2"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="1"/></model_instance></plate></config>';
  const originalSettings = h.files["Metadata/project_settings.config"];
  const settings: Record<string, unknown> = {
    ...(originalSettings ? JSON.parse(strFromU8(originalSettings)) : {}),
    name: "project_settings", version: "01.09.00.00", from: "User",
    filament_colour: colors,
    filament_settings_id: colors.map(()=>"Generic PLA"),
    filament_type: colors.map(()=>"PLA"),
    filament_diameter: colors.map(()=>"1.75"),
    filament_density: colors.map(()=>"1.24"),
  };
  // Source profiles are single-filament. Expand per-filament values for every slot.
  for (const [key,value] of Object.entries(settings)) {
    if (key.startsWith("filament_") && Array.isArray(value) && value.length === 1)
      settings[key] = colors.map(()=>value[0]);
  }
  settings.flush_volumes_matrix = colors.flatMap((_,i)=>colors.map((_,j)=>i===j?"0":"140"));
  settings.flush_volumes_vector = colors.flatMap(()=>["140","140"]);
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/octet-stream"/><Default Extension="txt" ContentType="text/plain"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    "3D/3dmodel.model": strToU8(model),
    "Metadata/model_settings.config": strToU8(config),
    "Metadata/project_settings.config": strToU8(JSON.stringify(settings)),
    [branding.name + "-credits.txt"]: strToU8(branding.credit),
  }, {level:6});
}
