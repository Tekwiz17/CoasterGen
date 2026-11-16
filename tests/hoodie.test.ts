import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import {
  loadHoodie,
  colorHoodie,
  exportHoodie,
  paintCode,
  surfaceUV,
  CREDIT,
} from "../src/lib/hoodie";
test("Bambu whole-facet color encoding and map panels", () => {
  assert.deepEqual([1, 2, 3, 4, 8].map(paintCode), [
    "4",
    "8",
    "0C",
    "1C",
    "5C",
  ]);
  assert.deepEqual(surfaceUV(0, -10, 50, 100), [0.125, 0.5]);
  assert.deepEqual(surfaceUV(10, 0, 50, 100), [0.375, 0.5]);
  assert.deepEqual(surfaceUV(0, 10, 50, 100), [0.625, 0.5]);
  assert.deepEqual(surfaceUV(-10, 0, 50, 100), [0.875, 0.5]);
});
test("invalid base rejected", () =>
  assert.throws(() => loadHoodie(new Uint8Array(10))));
const fixture = process.env.HOODIE_FIXTURE;
if (fixture)
  test("original hoodie retains geometry, credits and printable paint", () => {
    const h = loadHoodie(new Uint8Array(readFileSync(fixture)));
    const design = {
      mode: "map" as const,
      map: {
        width: 2,
        height: 1,
        data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
      },
      frontPlace: { width: 40, x: 0, z: 52 },
      backPlace: { width: 40, x: 0, z: 52 },
      colors: ["#ffffff", "#ff0000", "#0000ff"],
      auto: false,
      remove: false,
      smooth: true,
    };
    const r = colorHoodie(h, design);
    assert.equal(r.slots.length, h.faces.length);
    assert.ok(r.slots.includes(1));
    assert.ok(r.slots.includes(2));
    const out = unzipSync(exportHoodie(h, r.slots, r.colors));
    const xml = strFromU8(out[h.key]);
    assert.equal((xml.match(/<triangle /g) || []).length, h.faces.length);
    assert.equal((xml.match(/<vertex /g) || []).length, h.points.length);
    assert.match(xml, /paint_color="8"/);
    assert.match(xml, /Morganja/);
    assert.equal(strFromU8(out["HoodieGen-credits.txt"]), CREDIT);
    assert.match(strFromU8(out["Metadata/project_settings.config"]), /#ff0000/);
  });
