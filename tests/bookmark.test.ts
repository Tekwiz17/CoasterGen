import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import {
  loadBookmark,
  prepareBookmark,
  colorBookmark,
  exportBookmark,
  HEAD_Y,
  PRINT_RADIUS,
  CREDIT,
  type BookmarkDesign,
} from "../src/lib/bookmark";
const base = loadBookmark(
  new Uint8Array(
    readFileSync(new URL("../public/bookmark-base.3mf", import.meta.url)),
  ),
);
const mesh = prepareBookmark(base);
const d: BookmarkDesign = {
  colors: ["#ffffff", "#ff0000", "#0000ff"],
  auto: false,
  remove: false,
  smooth: false,
  size: 100,
  rotation: 0,
  image: {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
  },
};
test("bookmark subdivision preserves closed surface, bounds and volume", () => {
  assert.equal(base.faces.length, 268);
  assert.ok(mesh.faces.length > 10000);
  const bounds = (p: number[][]) =>
    [0, 1, 2].map((k) =>
      p.reduce(
        (r, v) => [Math.min(r[0], v[k]), Math.max(r[1], v[k])],
        [Infinity, -Infinity],
      ),
    );
  assert.deepEqual(bounds(mesh.points), bounds(base.points));
  const edges = new Map<string, number>();
  for (const f of mesh.faces)
    for (let j = 0; j < 3; j++) {
      const a = f[j],
        b = f[(j + 1) % 3],
        k = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  assert.ok([...edges.values()].every((n) => n === 2));
  const volume = (h: typeof base) =>
    h.faces.reduce((s, f) => {
      const [a, b, c] = f.map((i) => h.points[i]);
      return (
        s +
        (a[0] * (b[1] * c[2] - b[2] * c[1]) +
          a[1] * (b[2] * c[0] - b[0] * c[2]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])) /
          6
      );
    }, 0);
  assert.ok(Math.abs(volume(mesh) - volume(base)) < 1e-6);
});
test("artwork is centered, correctly oriented, and confined to top circle", () => {
  const r = colorBookmark(mesh, d);
  assert.ok(r.slots.includes(1));
  assert.ok(r.slots.includes(2));
  const ext = [Infinity, -Infinity, Infinity, -Infinity];
  mesh.faces.forEach((f, i) => {
    if (!r.slots[i]) return;
    const p = f.map((v) => mesh.points[v]),
      x = p.reduce((s, v) => s + v[0], 0) / 3,
      y = p.reduce((s, v) => s + v[1], 0) / 3;
    assert.ok(p.every((v) => v[2] === 1));
    assert.ok(x * x + (y - HEAD_Y) ** 2 <= PRINT_RADIUS ** 2 + 0.001);
    assert.equal(r.slots[i], x < 0 ? 1 : 2);
    ext[0] = Math.min(ext[0], x);
    ext[1] = Math.max(ext[1], x);
    ext[2] = Math.min(ext[2], y);
    ext[3] = Math.max(ext[3], y);
  });
  assert.ok(Math.abs(ext[0] + ext[1]) < 0.3);
  assert.ok(Math.abs((ext[2] + ext[3]) / 2 - HEAD_Y) < 0.3);
});
test("transparent artwork leaves the original base unpainted", () => {
  const r = colorBookmark(mesh, {
    ...d,
    image: { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 0]) },
  });
  assert.ok(r.slots.every((s) => s === 0));
});
test("export contains painted mesh, palette, source attribution, and no stale slices", () => {
  const r = colorBookmark(mesh, d),
    files = unzipSync(exportBookmark(mesh, r.slots, r.colors)),
    xml = strFromU8(files["3D/3dmodel.model"]);
  assert.match(xml, /paint_color="8"/);
  assert.match(xml, /paint_color="0C"/);
  assert.match(xml, /BookmarkGen/);
  assert.match(xml, /Tekwiz17/);
  assert.match(xml, /name="License">CC0/);
  assert.doesNotMatch(xml, /Hoodie|<components>/);
  assert.equal(strFromU8(files["BookmarkGen-credits.txt"]), CREDIT);
  assert.ok(!Object.keys(files).some((k) => /plate_|slice_info/.test(k)));
  assert.equal((xml.match(/<triangle /g) || []).length, mesh.faces.length);
  const settings = JSON.parse(
    strFromU8(files["Metadata/project_settings.config"]),
  );
  assert.deepEqual(settings.filament_colour, r.colors);
  assert.equal(settings.flush_volumes_matrix.length, 9);
});
test("wrong base model and invalid filament assignments are rejected", () => {
  assert.throws(() =>
    loadBookmark(
      new Uint8Array(
        readFileSync(new URL("../public/hoodie-base.3mf", import.meta.url)),
      ),
    ),
  );
  assert.throws(() => exportBookmark(base, new Uint8Array(1), d.colors));
});
