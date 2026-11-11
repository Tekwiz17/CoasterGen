import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { vectorize } from "./lib/vectorize";
import { buildModel } from "./lib/geometry";
const api = Module({ locateFile: () => wasmUrl }).then((m) => {
  m.setup();
  return m;
});
self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;
  try {
    if (type === "vectorize") {
      const {
        data,
        width,
        height,
        count,
        base,
        remove,
        smooth,
        palette,
        preserveDetails,
        overrides,
      } = payload;
      const result = vectorize(
        data,
        width,
        height,
        count,
        base,
        remove,
        smooth,
        palette,
        { preserveDetails, overrides },
      );
      self.postMessage({ id, result });
    } else {
      const m = await api;
      const result = buildModel(m, payload.project, payload.artwork);
      self.postMessage(
        { id, result },
        {
          transfer: result.parts.flatMap((p) => [
            p.positions.buffer,
            p.indices.buffer,
          ]),
        },
      );
    }
  } catch (err) {
    self.postMessage({
      id,
      error:
        err instanceof Error
          ? err.message
          : "Something went wrong while building your coaster.",
    });
  }
};
