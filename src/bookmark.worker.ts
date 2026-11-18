import {
  loadBookmark,
  prepareBookmark,
  colorBookmark,
  exportBookmark,
} from "./lib/bookmark";
let base: ReturnType<typeof loadBookmark>;
let detailed: ReturnType<typeof loadBookmark> | undefined;
let preview:
  | {
      mesh: ReturnType<typeof loadBookmark>;
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
      const bytes = exportBookmark(preview.mesh, preview.slots, preview.colors);
      self.postMessage({ id: data.id, bytes });
      return;
    }
    if (data.type === "load") {
      preview = undefined;
      base = loadBookmark(data.bytes);
      detailed = undefined;
      self.postMessage({ id: data.id });
      return;
    }
    if (!base) throw Error("The bookmark is still loading.");
    const h = data.design.image ? (detailed ??= prepareBookmark(base)) : base;
    const r = colorBookmark(h, data.design);
    preview = {
      mesh: h,
      slots: r.slots,
      colors: r.colors,
      revision: data.revision,
    };
    self.postMessage({ id: data.id, model: r.model, colors: r.colors });
  } catch (e) {
    self.postMessage({ id: data.id, error: (e as Error).message });
  }
};
