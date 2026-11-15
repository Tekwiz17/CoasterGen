import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { read3mf, type SplitPart } from "./lib/spitgen";
import { recommendFit, sourceBounds } from "./lib/spitrecommend";
import { splitModel } from "./lib/spitfit";
const api = Module({ locateFile: () => wasmUrl }).then((m) => {
  m.setup();
  return m;
});
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ progress: "Reading solid parts and colors…" });
    const m = await api;
    let parts: SplitPart[];
    if (data.demo) {
      parts = [0, 1].map((i) => {
        const s = m.Manifold.cube([18, 24, 12]).translate([i * 18, 0, 0]),
          mesh = s.getMesh();
        const p = {
          name: i ? "Accent" : "Body",
          group: "Demo assembly",
          color: i ? "#E7AE54" : "#298769",
          colorIndex: i,
          positions: new Float32Array(mesh.vertProperties),
          indices: new Uint32Array(mesh.triVerts),
          volume: s.volume(),
        };
        s.delete();
        return p;
      });
    } else parts = read3mf(new Uint8Array(data.bytes));
    self.postMessage({
      progress: "Separating solids and checking connector locations…",
    });
    const result = splitModel(
      m,
      parts,
      data.grouping,
      data.fit,
      data.clearance,
      data.diameter,
    );
    self.postMessage({
      result: {
        ...result,
        bounds: sourceBounds(parts),
        recommendation: recommendFit(result.parts, result.connectors),
      },
    });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
