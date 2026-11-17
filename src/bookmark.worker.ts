import {
  loadBookmark,
  prepareBookmark,
  colorBookmark,
  exportBookmark,
} from "./lib/bookmark";
let base: ReturnType<typeof loadBookmark>;
let detailed: ReturnType<typeof loadBookmark> | undefined;
self.onmessage = ({ data }) => {
  try {
    if (data.type === "load") {
      base = loadBookmark(data.bytes);
      detailed = undefined;
      self.postMessage({ id: data.id });
      return;
    }
    if (!base) throw Error("The bookmark is still loading.");
    const h = data.design.image ? (detailed ??= prepareBookmark(base)) : base;
    const r = colorBookmark(h, data.design);
    self.postMessage(
      data.type === "export"
        ? { id: data.id, bytes: exportBookmark(h, r.slots, r.colors) }
        : { id: data.id, model: r.model, colors: r.colors },
    );
  } catch (e) {
    self.postMessage({ id: data.id, error: (e as Error).message });
  }
};
