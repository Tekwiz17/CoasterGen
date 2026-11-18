import {
  loadHoodie,
  colorHoodie,
  exportHoodie,
  type Hoodie,
} from "./lib/hoodie";
let hoodie: Hoodie;
let preview:
  | {
      mesh: ReturnType<typeof loadHoodie>;
      slots: Uint8Array;
      colors: string[];
      revision: number;
    }
  | undefined;
self.onmessage = ({ data }) => {
  try {
    if (data.type === "export") {
      if (!preview || preview.revision !== data.revision)
        throw Error("Wait for the current preview before exporting.");
      const bytes = exportHoodie(preview.mesh, preview.slots, preview.colors);
      self.postMessage({ id: data.id, bytes });
      return;
    }
    if (data.type === "load") {
      preview = undefined;
      hoodie = loadHoodie(data.bytes);
      self.postMessage({ id: data.id, height: hoodie.height });
    } else {
      if (!hoodie) throw Error("Load a hoodie first.");
      const result = colorHoodie(hoodie, data.design);
      preview = {
        mesh: result.hoodie,
        slots: result.slots,
        colors: result.colors,
        revision: data.revision,
      };
      self.postMessage({
        id: data.id,
        model: result.model,
        colors: result.colors,
      });
    }
  } catch (e) {
    self.postMessage({ id: data.id, error: (e as Error).message });
  }
};
