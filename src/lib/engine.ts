import type { Artwork, ModelData, Project } from "../types";
const worker = new Worker(new URL("../engine.worker.ts", import.meta.url), {
  type: "module",
});
let nextId = 0;
let failure: Error | null = null;
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
  failure = new Error(
    "The local geometry engine could not load. Refresh the page to try again.",
  );
  for (const p of pending.values()) p.reject(failure);
  pending.clear();
};
function call<T>(type: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (failure) {
      reject(failure);
      return;
    }
    const id = nextId++;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(
          "Processing took too long. Try fewer colors or a lower image detail setting.",
        ),
      );
    }, 120000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
    try {
      worker.postMessage({ id, type, payload });
    } catch (e) {
      clearTimeout(timeout);
      pending.delete(id);
      reject(e);
    }
  });
}
export const vectorizeImage = (payload: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  count: number;
  base: string;
  remove: boolean;
  smooth: boolean;
  palette?: string[];
  preserveDetails?: boolean;
  overrides?: Uint8Array;
}) => call<Artwork>("vectorize", payload);
export const generateModel = (project: Project, artwork: Artwork) =>
  call<ModelData>("model", { project, artwork });
