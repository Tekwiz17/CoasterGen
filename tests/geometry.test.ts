import test from "node:test";
import assert from "node:assert/strict";
import Module from "manifold-3d";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import {
  buildModel,
  validate,
  magnetCenters,
  outline,
  outlines,
} from "../src/lib/geometry";
import { vectorize } from "../src/lib/vectorize";
import { export3mf, exportSvg } from "../src/lib/export";
import { parseProject } from "../src/lib/storage";
import { alignArtwork, snapArtwork } from "../src/lib/alignment";
import {
  DEFAULT_PROJECT,
  type Artwork,
  type Project,
  type MeshPart,
} from "../src/types";
const api = await Module();
api.setup();
const project = (patch: Partial<Project> = {}): Project => ({
  ...DEFAULT_PROJECT,
  colors: [...DEFAULT_PROJECT.colors],
  mapping: [0, 1, 2, 3],
  ...patch,
});
const blank: Artwork = {
  width: 100,
  height: 100,
  loops: [[], [], [], []],
  sourceColors: DEFAULT_PROJECT.colors,
  counts: [0, 0, 0, 0],
  pixels: 0,
  removed: 0,
};
const drawing: Artwork = {
  ...blank,
  loops: [
    [],
    [
      [
        [10, 10],
        [50, 10],
        [50, 90],
        [10, 90],
      ],
    ],
    [
      [
        [50, 10],
        [90, 10],
        [90, 90],
        [50, 90],
      ],
    ],
    [],
  ],
  pixels: 6400,
};
function watertight(part: MeshPart) {
  const edges = new Map<string, { n: number; sum: number }>();
  for (let i = 0; i < part.indices.length; i += 3) {
    const t = part.indices.slice(i, i + 3);
    for (let j = 0; j < 3; j++) {
      const a = t[j],
        b = t[(j + 1) % 3],
        key = a < b ? `${a},${b}` : `${b},${a}`,
        v = edges.get(key) ?? { n: 0, sum: 0 };
      v.n++;
      v.sum += a < b ? 1 : -1;
      edges.set(key, v);
    }
  }
  for (const v of edges.values()) {
    assert.equal(v.n, 2, "Every mesh edge has exactly two adjacent faces");
    assert.equal(v.sum, 0, "Adjacent faces have consistent winding");
  }
  assert.ok(part.volume > 0);
}
test("coaster dimensions and all three outlines produce closed, positive-volume solids", () => {
  for (const shape of ["circle", "rounded", "hexagon"] as const) {
    const p = project({ shape }),
      model = buildModel(api, p, blank);
    assert.equal(model.parts.length, 1);
    model.parts.forEach(watertight);
    const vs = model.parts[0].positions;
    const xs = Array.from(vs).filter((_, i) => i % 3 === 0),
      zs = Array.from(vs).filter((_, i) => i % 3 === 2);
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - p.diameter) < 0.01);
    assert.equal(Math.min(...zs), 0);
    assert.equal(Math.max(...zs), p.thickness);
    assert.ok(model.volume > 25000);
  }
});
test("color inlays partition the top without changing total height or adding overlapping volume", () => {
  const p = project(),
    solid = buildModel(api, p, blank),
    colored = buildModel(api, p, drawing);
  assert.equal(colored.parts.length, 3);
  colored.parts.forEach(watertight);
  assert.ok(Math.abs(solid.volume - colored.volume) < 0.05);
  for (const part of colored.parts.slice(1)) {
    const z = Array.from(part.positions).filter((_, i) => i % 3 === 2);
    assert.ok(Math.abs(Math.min(...z) - (p.thickness - p.inlayDepth)) < 1e-5);
    assert.equal(Math.max(...z), p.thickness);
  }
});
test("center and outer magnet pockets remove the expected volume and stay open underneath", () => {
  const solid = buildModel(api, project(), drawing);
  for (const mode of ["center", "outer"] as const) {
    const p = project({ magnetMode: mode }),
      m = buildModel(api, p, drawing),
      count = mode === "center" ? 1 : 4;
    assert.equal(magnetCenters(p).length, count);
    m.parts.forEach(watertight);
    const removed = solid.volume - m.volume,
      expected =
        count *
        Math.PI *
        ((p.magnetDiameter + p.clearance) / 2) ** 2 *
        (p.magnetDepth + 0.1);
    assert.ok(Math.abs(removed / expected - 1) < 0.002);
  }
});
test("invalid depth, edge clearance, and overlapping pockets block model generation", () => {
  for (const patch of [
    { magnetMode: "center", magnetDepth: 4 },
    { magnetMode: "outer", edgeGap: 0.2 },
    { magnetMode: "outer", magnetCount: 8, magnetDiameter: 25, edgeGap: 15 },
    { thickness: 0 },
    { diameter: 0 },
  ] as Partial<Project>[]) {
    const p = project(patch);
    assert.ok(validate(p).length);
    assert.throws(() => buildModel(api, p, drawing));
  }
});
test("color remapping to base or another slot keeps the full coaster volume", () => {
  for (const mapping of [
    [0, 0, 2, 3],
    [0, 1, 1, 3],
  ]) {
    const m = buildModel(api, project({ mapping }), drawing);
    assert.equal(m.parts.length, 2);
    m.parts.forEach(watertight);
    assert.ok(
      Math.abs(m.volume - buildModel(api, project(), blank).volume) < 0.05,
    );
  }
});
test("artwork transforms, mirror, and clipping remain inside the coaster", () => {
  const p = project({
      artX: 32,
      artY: 8,
      rotation: 37,
      artScale: 150,
      mirror: true,
      shape: "hexagon",
    }),
    m = buildModel(api, p, drawing);
  m.parts.forEach(watertight);
  for (const part of m.parts.slice(1))
    for (let i = 0; i < part.positions.length; i += 3)
      assert.ok(
        Math.hypot(part.positions[i], part.positions[i + 1]) <
          p.diameter / 2 + 0.01,
      );
});
test("vectorization traces holes and retains a four-color budget", () => {
  const w = 40,
    h = 40,
    data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x < 3 || y < 3 || x > 36 || y > 36) continue;
      const i = (y * w + x) * 4;
      data[i] = 220;
      data[i + 1] = 60;
      data[i + 2] = 30;
      data[i + 3] = 255;
      if (x > 12 && x < 27 && y > 12 && y < 27) data[i + 3] = 0;
    }
  const a = vectorize(data, w, h, 4, "#F2E9D8", false);
  assert.equal(a.sourceColors.length, 4);
  assert.ok(
    a.loops.some((l) => l.length === 2),
    "A transparent inner hole is traced",
  );
  buildModel(api, project(), a).parts.forEach(watertight);
});
test("background removal removes only edge-connected background, not internal white detail", () => {
  const w = 30,
    h = 30,
    data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 5; y < 25; y++)
    for (let x = 5; x < 25; x++) {
      const i = (y * w + x) * 4;
      data[i] = 200;
      data[i + 1] = 50;
      data[i + 2] = 30;
    }
  for (let y = 12; y < 18; y++)
    for (let x = 12; x < 18; x++) {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
  const a = vectorize(data, w, h, 4, "#F2E9D8", true);
  assert.equal(a.removed, 500);
  assert.equal(a.pixels, 400);
});
test("3MF preserves standard material colors, Bambu filament settings, part assignments, and grouped geometry", () => {
  const p = project({ name: "A & B <test>", magnetMode: "outer" }),
    m = buildModel(api, p, drawing),
    files = unzipSync(export3mf(p, m));
  assert.ok(files["[Content_Types].xml"]);
  assert.ok(files["_rels/.rels"]);
  const parser = new XMLParser({ ignoreAttributes: false }),
    doc = parser.parse(strFromU8(files["3D/3dmodel.model"]));
  assert.equal(doc.model["@_unit"], "millimeter");
  assert.equal(doc.model.resources.basematerials.base.length, 4);
  assert.equal(doc.model.resources.object.length, 4);
  assert.equal(doc.model.build.item["@_objectid"], "100");
  const settings = JSON.parse(
    strFromU8(files["Metadata/project_settings.config"]),
  );
  assert.deepEqual(settings.filament_colour, p.colors);
  assert.equal(settings.filament_settings_id.length, 4);
  const config = parser.parse(
    strFromU8(files["Metadata/model_settings.config"]),
  );
  assert.equal(config.config.object.part.length, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(
      config.config.object.part[i].metadata.find(
        (x: any) => x["@_key"] === "extruder",
      )["@_value"],
      String(m.parts[i].colorIndex + 1),
    );
  }
  assert.ok(
    strFromU8(files["3D/3dmodel.model"]).includes("A &amp; B &lt;test&gt;"),
  );
  assert.ok(
    !strFromU8(files["Metadata/coastergen.json"]).includes("data:image"),
  );
});
test("SVG is valid XML and its physical dimensions match the coaster", () => {
  const p = project({ artX: 10, rotation: 25 }),
    doc = new XMLParser({ ignoreAttributes: false }).parse(
      exportSvg(p, drawing),
    );
  assert.equal(doc.svg["@_width"], "100mm");
  assert.equal(doc.svg["@_viewBox"], "-50 -50 100 100");
  assert.ok(doc.svg.defs.clipPath);
});
test("project import rejects malformed numeric and image inputs, and preserves valid color mapping", () => {
  assert.deepEqual(parseProject(project()), project());
  assert.throws(() => parseProject(project({ diameter: NaN })));
  assert.throws(() =>
    parseProject(project({ source: "https://somewhere.test/image.png" })),
  );
  assert.throws(() => parseProject(project({ mapping: [0, 100, 2, 3] })));
});
test("alignment centers actual artwork bounds and snaps to center and border", () => {
  const p = project(),
    offset: Artwork = {
      ...drawing,
      loops: [
        [],
        [
          [
            [20, 20],
            [70, 20],
            [70, 80],
            [20, 80],
          ],
        ],
        [],
        [],
      ],
    };
  const center = alignArtwork("center", p, offset);
  assert.ok(Math.abs(center.artX! - 4.5) < 0.001);
  assert.ok(Math.abs(center.artY!) < 0.001);
  const snap = snapArtwork(p, offset, center.artX! + 0.8, 0.9, 1.5);
  assert.equal(snap.x, center.artX);
  assert.equal(snap.guideX, 0);
  assert.equal(snap.guideY, 0);
  const left = alignArtwork("left", p, offset);
  const edge = snapArtwork(p, offset, left.artX! + 0.5, 9, 1.5);
  assert.equal(edge.x, left.artX);
  assert.equal(edge.guideX, -47);
  assert.equal(edge.guideY, undefined);
});

test("smoothing removes stair steps while preserving a circular silhouette and its hole", () => {
  const w = 96,
    data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      if (
        Math.hypot(x - 47.5, y - 47.5) > 38 ||
        Math.hypot(x - 47.5, y - 47.5) < 10
      )
        continue;
      const i = (y * w + x) * 4;
      data.set([30, 40, 60, 255], i);
    }
  const raw = vectorize(data, w, w, 2, "#FFFFFF", false, false);
  const smooth = vectorize(data, w, w, 2, "#FFFFFF", false, true);
  const perimeter = (art: Artwork) =>
    art.loops.flat().reduce(
      (total, loop) =>
        total +
        loop.reduce((sum, p, i) => {
          const n = loop[(i + 1) % loop.length];
          return sum + Math.hypot(n[0] - p[0], n[1] - p[1]);
        }, 0),
      0,
    );
  assert.equal(smooth.loops[1].length, 2, "The hole survives smoothing");
  assert.ok(
    perimeter(smooth) < perimeter(raw) * 0.93,
    "Pixel stairs are substantially reduced",
  );
  const signedArea = (loop: number[][]) =>
    loop.reduce((sum, p, i) => {
      const n = loop[(i + 1) % loop.length];
      return sum + p[0] * n[1] - n[0] * p[1];
    }, 0) / 2;
  const area = (art: Artwork) =>
    Math.abs(art.loops[1].reduce((sum, loop) => sum + signedArea(loop), 0));
  assert.ok(
    Math.abs(area(smooth) / area(raw) - 1) < 0.01,
    "Area changes by less than one percent",
  );
  const p = project({
    colorCount: 2,
    colors: smooth.sourceColors,
    mapping: [0, 1],
  });
  const model = buildModel(api, p, smooth);
  model.parts.forEach(watertight);
  assert.ok(Math.abs(model.volume - buildModel(api, p, blank).volume) < 0.05);
});

test("adjacent smoothed colors reuse identical shared boundaries and remain watertight at 2–8 colors", () => {
  const w = 48,
    data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      data.set(
        x + y < w ? [220, 40, 20, 255] : [20, 60, 210, 255],
        (y * w + x) * 4,
      );
    }
  const art = vectorize(data, w, w, 3, "#FFFFFF", false, true);
  const edges = (loops: number[][][]) =>
    new Set(
      loops.flatMap((loop) =>
        loop.map((point, i) => {
          const next = loop[(i + 1) % loop.length];
          return [point.join(","), next.join(",")].sort().join("|");
        }),
      ),
    );
  const first = edges(art.loops[1]),
    second = edges(art.loops[2]);
  assert.ok(
    [...first].filter((edge) => second.has(edge)).length > 0,
    "Color interfaces match exactly",
  );
  for (const count of [8, 4, 2, 3, 2]) {
    const art = vectorize(data, w, w, count, "#FFFFFF", false, true);
    const p = project({
      colorCount: count,
      colors: art.sourceColors,
      mapping: Array.from({ length: count }, (_, i) => i),
    });
    const m = buildModel(api, p, art);
    m.parts.forEach(watertight);
    assert.ok(m.parts.every((part) => part.colorIndex < count));
    assert.ok(Math.abs(m.volume - buildModel(api, p, blank).volume) < 0.05);
  }
});

test("legacy saved projects gain smooth edges and impossible outer magnet gaps are rejected", () => {
  const legacy = { ...project() } as Partial<Project>;
  delete legacy.smoothEdges;
  assert.equal(parseProject(legacy).smoothEdges, true);
  assert.ok(
    validate(project({ magnetMode: "outer", edgeGap: 50 })).some((e) =>
      e.includes("no room"),
    ),
  );
  assert.throws(() =>
    vectorize(new Uint8ClampedArray(4), 1, 1, 0, "#FFFFFF", false),
  );
});

test("antialiased cream/black curves do not grow unrelated blue or red fringe regions", () => {
  const n = 128,
    data = new Uint8ClampedArray(n * n * 4);
  const base = [242, 233, 216],
    ink = [10, 12, 12];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let color: number[];
      if (x < 25 && y < 25) color = [210, 35, 40];
      else if (x > 102 && y < 25) color = [25, 105, 205];
      else {
        const coverage = Math.max(
          0,
          Math.min(1, 30.4 - Math.hypot(x - 63.5, y - 75.5)),
        );
        color = base.map((v, i) => v * (1 - coverage) + ink[i] * coverage);
      }
      data.set([...color, 255], (y * n + x) * 4);
    }
  const art = vectorize(data, n, n, 4, "#F2E9D8", false, true);
  for (const [i, color] of art.sourceColors.entries()) {
    const r = parseInt(color.slice(1, 3), 16),
      b = parseInt(color.slice(5, 7), 16);
    if ((r > 170 && b < 80) || (b > 120 && r < 80)) {
      assert.equal(
        art.loops[i].length,
        1,
        "Only the intended solid color block remains",
      );
      assert.ok(
        art.loops[i].flat().every(([, y]) => y < 26),
        "No colored shards around the monochrome circle",
      );
    }
  }
  buildModel(api, project({ colors: art.sourceColors }), art).parts.forEach(
    watertight,
  );
});

test("pixel-art mode retains isolated pixel details and exact square corners", () => {
  const n = 32,
    data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 3; y < 14; y++)
    for (let x = 3; x < 14; x++) data.set([0, 0, 0, 255], (y * n + x) * 4);
  data.set([0, 0, 0, 255], (27 * n + 27) * 4);
  const pixel = vectorize(data, n, n, 2, "#FFFFFF", false, false);
  assert.equal(pixel.loops[1].length, 2);
  assert.ok(pixel.loops[1].flat().every((p) => p.every(Number.isInteger)));
  const smooth = vectorize(data, n, n, 2, "#FFFFFF", false, true);
  assert.equal(
    smooth.loops[1].length,
    1,
    "Smoothing removes the isolated one-pixel fleck",
  );
});

test("inch and mm entries convert predictably without accepting invalid dimensions", async () => {
  const { parseMillimeters: mm } = await import("../src/lib/units");
  for (const [input, expected] of [
    ["4in", 101.6],
    ["4 IN", 101.6],
    [".25in", 6.35],
    ["2 inches", 50.8],
    ['2"', 50.8],
    ["100", 100],
    ["100mm", 100],
    ["-2.5 mm", -2.5],
  ] as const)
    assert.equal(mm(input), expected);
  for (const input of [
    "",
    "in",
    "3cm",
    "NaN",
    "Infinity",
    "4in + 1",
    "1e309",
    "1/4in",
    "12abc",
  ])
    assert.equal(mm(input), null);
});

test("custom SVG outlines preserve holes, true border offsets, watertight geometry and project round trips", async () => {
  const { cleanShape, shapeError } = await import("../src/lib/shapes");
  const shapeContours = cleanShape([
    [
      [-50, -40],
      [50, -40],
      [50, 40],
      [-50, 40],
    ],
    [
      [-10, -10],
      [-10, 10],
      [10, 10],
      [10, -10],
    ],
  ]);
  assert.equal(shapeError(shapeContours), "");
  const p = project({
    shape: "custom",
    shapeContours,
    shapeName: "cutout.svg",
  });
  const solid = buildModel(api, p, blank),
    colored = buildModel(api, p, drawing);
  [...solid.parts, ...colored.parts].forEach(watertight);
  assert.ok(Math.abs(solid.volume - 7600 * p.thickness) < 0.1);
  assert.ok(Math.abs(colored.volume - solid.volume) < 0.1);
  const inset = new api.CrossSection(outlines(p, 3), "EvenOdd");
  assert.ok(
    inset.area() < 94 * 74 - 26 * 26 + 10,
    "The border also expands the inner cutout",
  );
  inset.delete();
  assert.ok(
    validate({ ...p, magnetMode: "center" }).some((s) => s.includes("edge")),
    "A pocket cannot lie inside an SVG cutout",
  );
  assert.deepEqual(parseProject(p).shapeContours, shapeContours);
  const svg = new XMLParser({ ignoreAttributes: false }).parse(
    exportSvg(p, drawing),
  ).svg;
  assert.equal(svg.path["@_fill-rule"], "evenodd");
  assert.equal(svg.defs.clipPath.path["@_clip-rule"], "evenodd");
  assert.throws(() =>
    parseProject({
      ...p,
      shapeContours: [
        [
          [NaN, 1],
          [2, 3],
          [4, 5],
        ],
      ],
    }),
  );
  assert.throws(() => parseProject({ ...p, shapeContours: [] }));
  assert.ok(
    shapeError([
      [
        [-50, -30],
        [-10, -30],
        [-10, 30],
        [-50, 30],
      ],
      [
        [10, -30],
        [50, -30],
        [50, 30],
        [10, 30],
      ],
    ]).includes("connected"),
  );
});

test("erasing a color preserves the remaining source palette and filament slot assignments", () => {
  const n = 48,
    data = new Uint8ClampedArray(n * n * 4);
  for (let y = 4; y < 44; y++)
    for (let x = 4; x < 44; x++)
      data.set(
        x < 24 ? [240, 40, 40, 255] : [20, 70, 220, 255],
        (y * n + x) * 4,
      );
  const before = vectorize(data, n, n, 3, "#FFFFFF", false);
  const blue = before.sourceColors.findIndex(
    (c) =>
      parseInt(c.slice(5, 7), 16) > 150 && parseInt(c.slice(1, 3), 16) < 50,
  );
  assert.ok(blue > 0);
  assert.deepEqual(
    vectorize(data, n, n, 3, "#FFFFFF", false, true, before.sourceColors),
    before,
    "Saved RGB palette produces identical geometry before editing",
  );
  const erased = data.slice();
  for (let y = 0; y < n; y++)
    for (let x = 0; x < 24; x++) erased[(y * n + x) * 4 + 3] = 0;
  const after = vectorize(
    erased,
    n,
    n,
    3,
    "#FFFFFF",
    false,
    true,
    before.sourceColors,
  );
  assert.deepEqual(after.sourceColors, before.sourceColors);
  assert.equal(after.counts[blue], before.counts[blue]);
  assert.equal(after.pixels, 800);
  const saved = parseProject(
    project({
      colorCount: 3,
      colors: before.sourceColors,
      mapping: [0, 2, 1],
      sourcePalette: before.sourceColors,
    }),
  );
  assert.deepEqual(saved.sourcePalette, before.sourceColors);
  assert.throws(() => parseProject({ ...saved, sourcePalette: ["#FFFFFF"] }));
});

test("antialiasing does not muddy the interior colors of solid artwork", () => {
  const n = 80,
    data = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const coverage = Math.max(
        0,
        Math.min(1, 28.3 - Math.hypot(x - 39.5, y - 39.5)),
      );
      data.set(
        [18, 110, 202]
          .map((v) => Math.round(v * coverage + 255 * (1 - coverage)))
          .concat(255),
        (y * n + x) * 4,
      );
    }
  const art = vectorize(data, n, n, 2, "#FFFFFF", false, true);
  assert.equal(art.sourceColors[1], "#126ECA");
});
