import { DEFAULT_PROJECT, type Project } from "../types";
const openDB = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("coastergen", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("projects");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export async function saveLocal(p: Project) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(p, "latest");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
export async function loadLocal(): Promise<Project | null> {
  try {
    const db = await openDB();
    const result = await new Promise<unknown>((resolve, reject) => {
      const r = db
        .transaction("projects")
        .objectStore("projects")
        .get("latest");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return result ? parseProject(result) : null;
  } catch {
    return null;
  }
}
export function parseProject(value: unknown): Project {
  if (!value || typeof value !== "object" || (value as any).version !== 1)
    throw new Error("Choose a CoasterGen .coaster.json project.");
  const obj = value as Record<string, unknown>,
    p = { ...DEFAULT_PROJECT };
  for (const key of Object.keys(DEFAULT_PROJECT) as Array<keyof Project>) {
    const v = obj[key];
    if (v === undefined) continue;
    if (typeof DEFAULT_PROJECT[key] === "number") {
      if (typeof v !== "number" || !Number.isFinite(v))
        throw new Error("The project contains invalid dimensions.");
      (p as any)[key] = v;
    } else if (typeof DEFAULT_PROJECT[key] === "boolean") {
      if (typeof v !== "boolean") throw new Error("Invalid project options.");
      (p as any)[key] = v;
    } else if (typeof DEFAULT_PROJECT[key] === "string") {
      if (typeof v !== "string") throw new Error("Invalid project format.");
      (p as any)[key] = v;
    }
  }
  if (
    !["circle", "rounded", "hexagon"].includes(p.shape) ||
    !["none", "center", "outer"].includes(p.magnetMode)
  )
    throw new Error("Invalid coaster or magnet shape.");
  if (!Number.isInteger(p.colorCount) || p.colorCount < 2 || p.colorCount > 8)
    throw new Error("Projects must use 2–8 colors.");
  if (
    !Array.isArray(obj.colors) ||
    obj.colors.length < p.colorCount ||
    !obj.colors.every((c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
  )
    throw new Error("Invalid project colors.");
  p.colors = obj.colors.slice(0, 8) as string[];
  if (!/^#[0-9a-f]{6}$/i.test(p.matchBase))
    throw new Error("Invalid artwork matching color.");
  if (
    !Array.isArray(obj.mapping) ||
    obj.mapping.length !== p.colorCount ||
    !obj.mapping.every((v) => Number.isInteger(v) && v >= 0 && v < p.colorCount)
  )
    throw new Error("Invalid color map.");
  p.mapping = obj.mapping as number[];
  p.name = p.name.slice(0, 80) || "My coaster";
  p.detail = [192, 320, 512, 768].includes(p.detail) ? p.detail : 512;
  if (
    p.source &&
    (!/^data:image\/(png|jpeg|webp|svg\+xml)[;,]/i.test(p.source) ||
      p.source.length > 30e6)
  )
    throw new Error("Project images must be embedded locally and under 20 MB.");
  if (
    !Number.isInteger(p.magnetCount) ||
    p.magnetCount < 2 ||
    p.magnetCount > 8 ||
    p.artScale < 5 ||
    p.artScale > 200 ||
    Math.abs(p.artX) > 250 ||
    Math.abs(p.artY) > 250 ||
    Math.abs(p.rotation) > 360 ||
    p.margin < 0 ||
    p.clearance < 0 ||
    p.clearance > 2 ||
    p.edgeGap < 0
  )
    throw new Error("The project contains unsupported sizes or positions.");
  return p;
}
