import {
  loadHoodie,
  colorHoodie,
  exportHoodie,
  type Hoodie,
} from "./lib/hoodie";
let hoodie: Hoodie;
self.onmessage = ({ data }) => {
  try {
    if (data.type === "load") {
      hoodie = loadHoodie(data.bytes);
      self.postMessage({ id: data.id, height: hoodie.height });
    } else {
      if (!hoodie) throw Error("Load a hoodie first.");
      const result = colorHoodie(hoodie, data.design);
      if (data.type === "export")
        self.postMessage({
          id: data.id,
          bytes: exportHoodie(result.hoodie, result.slots, result.colors),
        });
      else
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
