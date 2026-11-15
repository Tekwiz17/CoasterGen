import test from "node:test";
import assert from "node:assert/strict";
import Module from "manifold-3d";
import { read3mf, type SplitPart, type Fit } from "../src/lib/spitgen";
import { splitModel } from "../src/lib/spitfit";
import { part3mf, splitBundle } from "../src/lib/spitexport";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
const api = await Module();
api.setup();
function blocks(): SplitPart[] {
  return [0, 1].map((i) => {
    const original = api.Manifold.cube([18, 24, 12]),
      s = original.translate([i * 18, 0, 0]),
      m = s.getMesh();
    const p = {
      name: i ? "Accent" : "Body",
      group: "Group 1",
      color: i ? "#E7AE54" : "#298769",
      colorIndex: i,
      positions: new Float32Array(m.vertProperties),
      indices: new Uint32Array(m.triVerts),
      volume: s.volume(),
    };
    s.delete();
    original.delete();
    return p;
  });
}
for (const fit of ["SnapFit", "ClickFit", "GlueFit", "TightFit"] as Fit[])
  test(`${fit} produces closed printable pieces with real matching connectors`, () => {
    const result = splitModel(api, blocks(), "groups", fit, 0.15, 3);
    assert.equal(result.parts.length, 2);
    assert.equal(result.connectors, 1, JSON.stringify(result.warnings));
    assert.ok(result.parts[0].volume > 18 * 24 * 12);
    assert.ok(result.parts[1].volume < 18 * 24 * 12);
    for (const p of result.parts) {
      const mesh = new api.Mesh({
        numProp: 3,
        vertProperties: p.positions,
        triVerts: p.indices,
      });
      mesh.merge();
      const s = api.Manifold.ofMesh(mesh);
      assert.equal(s.status(), "NoError");
      assert.ok(s.volume() > 0);
      s.delete();
    }
    const files = unzipSync(splitBundle(result, "Test", fit, 0.15, 3));
    assert.equal(Object.keys(files).length, 7);
    assert.ok(files["print-layout.3mf"]);
    assert.match(strFromU8(files["assembly-guide.txt"]), new RegExp(fit));
    const loaded = read3mf(files["assembly-reference.3mf"]);
    assert.equal(loaded.length, 2);
    assert.deepEqual(
      loaded.map((p) => p.color),
      result.parts.map((p) => p.color),
    );
  });
test("color grouping merges matching colors; connected grouping keeps islands separate", () => {
  const p = blocks().map((v) => ({ ...v, color: "#298769" }));
  p[1].positions = p[1].positions.map((v, i) => (i % 3 === 0 ? v + 10 : v));
  assert.equal(splitModel(api, p, "colors", "GlueFit", 0.2, 3).parts.length, 1);
  const merged = splitModel(api, p, "colors", "GlueFit", 0.2, 3).parts;
  assert.equal(
    splitModel(api, merged, "pieces", "GlueFit", 0.2, 3).parts.length,
    2,
  );
});
test("3MF import preserves build/component transforms, names, colors and inch units", () => {
  const archive = unzipSync(part3mf(blocks(), "Fixture"));
  const text = strFromU8(archive["3D/3dmodel.model"])
    .replace('unit="millimeter"', 'unit="inch"')
    .replace(
      'objectid="2"/>',
      'objectid="2" transform="1 0 0 0 1 0 0 0 1 10 0 0"/>',
    );
  archive["3D/3dmodel.model"] = strToU8(text);
  const parts = read3mf(zipSync(archive));
  assert.equal(parts.length, 2);
  assert.equal(parts[0].name, "Body");
  assert.ok(Math.abs(parts[0].positions[0] - 254) < 0.01);
});
test("thin or separated parts export with explicit fit notes instead of fake connectors", () => {
  const p = blocks();
  p[1].positions = p[1].positions.map((v, i) => (i % 3 === 0 ? v + 20 : v));
  const r = splitModel(api, p, "groups", "SnapFit", 0.2, 3);
  assert.equal(r.connectors, 0);
  assert.match(r.warnings[0], /No connectors/);
});
test("invalid, open and non-solid color shell inputs fail clearly", () => {
  assert.throws(() => read3mf(new Uint8Array([1, 2, 3])));
  const p = blocks();
  p[0].indices = p[0].indices.slice(0, 3);
  assert.throws(
    () => splitModel(api, p, "groups", "GlueFit", 0.2, 3),
    /closed solid/,
  );
  assert.throws(
    () => splitModel(api, blocks(), "groups", "GlueFit", -1, 3),
    /clearance/,
  );
});
