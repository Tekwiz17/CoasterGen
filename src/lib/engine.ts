import type { Artwork, ModelData, Project } from "../types";
const worker = new Worker(new URL("../engine.worker.ts", import.meta.url), {
  type: "module",
});
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
worker.onmessage = ({ data }) => {
  const promise = pending.get(data.id);
  if (!promise) return;
  pending.delete(data.id);
  if (data.error) promise.reject(new Error(data.error));
  else promise.resolve(data.result);
};
worker.onerror = () => {
  for (const p of pending.values())
    p.reject(
      new Error(
        "The local geometry engine could not load. Refresh the page to try again.",
      ),
    );
  pending.clear();
};
function call<T>(type: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}
export const vectorizeImage = (payload: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  count: number;
  base: string;
  remove: boolean;
}) => call<Artwork>("vectorize", payload);
export const generateModel = (project: Project, artwork: Artwork) =>
  call<ModelData>("model", { project, artwork });
