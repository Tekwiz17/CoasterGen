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

import { atlasUV, panelPoint, panels, mapTemplate } from "../src/lib/hoodiemap";
test("flattened atlas samples each named garment piece within its bounds", () => {
  const points = [
    [0, -10, 40],
    [0, 10, 40],
    [45, -25, 40],
    [-45, 25, 40],
    [0, -10, 95],
    [0, 10, 95],
  ];
  points.forEach(([x, y, z], i) => {
    const [u, v] = atlasUV(x, y, z, 100, 125);
    const p = panels[i];
    assert.ok(u * 2048 >= p.x && u * 2048 <= p.x + p.w);
    assert.ok(v * 1024 >= p.y && v * 1024 <= p.y + p.h);
  });
  assert.match(mapTemplate(), /RIGHT SLEEVE/);
  assert.doesNotMatch(mapTemplate(false), /<text/);
});

test("body artwork keeps equal horizontal and vertical scale",()=>{
 const p=panelPoint(0,-25,40,100,118),a=panelPoint(1,-25,40,100,118),b=panelPoint(0,-25,41,100,118);
 assert.ok(Math.abs((a.u-p.u)*panels[0].w+(b.v-p.v)*panels[0].h)<1e-9);
});
test("mirrored sleeve points have identical local artwork coordinates",()=>{
 for(const z of [15,30,50,70])for(const x of [38,43,50]){
 const a=panelPoint(x,-25,z,106,118),b=panelPoint(-x,-25,z,106,118);
 assert.equal(a.index,2);assert.equal(b.index,3);assert.equal(a.u,b.u);assert.equal(a.v,b.v);
 }
});
test("zoom preserves aspect ratio and out-of-panel coordinates use base",()=>{
 const a=panelPoint(5,-25,40,100,118,1),b=panelPoint(5,-25,40,100,118,2);
 assert.ok(Math.abs((a.u-.5)/2-(b.u-.5))<1e-12);
 assert.ok(Math.abs((a.v-.5)/2-(b.v-.5))<1e-12);
 assert.deepEqual(atlasUV(30,-25,40,100,118,1,1),[-1,-1]);
});

test("V2 reaches body edges, hood sides and cuffs without unequal scaling",()=>{
 for(const [x,y,z] of [[-33,-25,5],[33,-25,40],[-33,25,75],[33,-20,95],[-33,-20,99],[45,-25,5],[-45,-25,85]]){
 const uv=atlasUV(x,y,z,106,118);assert.ok(uv[0]>=0 && uv[1]>=0,JSON.stringify([x,y,z]));
 }
 for(const x of [-32,0,32]){
 const a=panelPoint(x,-25,40,106,118),b=panelPoint(x+1,-25,41,106,118);
 assert.ok(Math.abs((b.u-a.u)*panels[0].w+(b.v-a.v)*panels[0].h)<1e-8);
 }
 assert.match(mapTemplate(),/FULL WRAP V3/);
});

test("V3 sleeve coordinates cross the outer side continuously without mirroring",()=>{
 const a=panelPoint(50,-1,40,106,118,1,3),b=panelPoint(50,1,40,106,118,1,3);
 assert.ok(a.u<.5);assert.ok(b.u>.5);assert.ok(Math.abs(a.u+b.u-1)<1e-10);
 const oldA=panelPoint(50,-1,40,106,118,1,2),oldB=panelPoint(50,1,40,106,118,1,2);
 assert.equal(oldA.u,oldB.u);
 assert.ok(panels[2].w/panels[2].h>.8);
});
