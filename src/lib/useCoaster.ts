import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PROJECT,
  type Artwork,
  type ModelData,
  type Project,
} from "../types";
import { SAMPLES, svgDataUrl } from "../samples";
import { loadPixels } from "./image";
import { generateModel, vectorizeImage } from "./engine";
import { loadLocal, saveLocal } from "./storage";
import { validate } from "./geometry";

// Short, session-local source identities avoid serializing a large embedded image
// into the model key on every drag or slider movement. Retain only four sources.
const sourceIds = new Map<string, number>();
let nextSourceId = 1;
function sourceId(source: string) {
  if (!source) return 0;
  const known = sourceIds.get(source);
  if (known !== undefined) return known;
  const id = nextSourceId++;
  sourceIds.set(source, id);
  if (sourceIds.size > 4) sourceIds.delete(sourceIds.keys().next().value!);
  return id;
}
export const artworkKey = (p: Project) =>
  JSON.stringify([
    sourceId(p.source),
    p.sample,
    p.colorCount,
    p.matchBase,
    p.removeBackground,
    p.detail,
    p.smoothEdges,
  ]);
const geometryKey = (p: Project, key: string) =>
  JSON.stringify([
    key,
    p.shape,
    p.diameter,
    p.thickness,
    p.inlayDepth,
    p.margin,
    p.colorCount,
    p.mapping,
    p.artScale,
    p.artX,
    p.artY,
    p.rotation,
    p.mirror,
    p.magnetMode,
    p.magnetDiameter,
    p.magnetDepth,
    p.magnetCount,
    p.edgeGap,
    p.clearance,
  ]);

export function useCoaster() {
  const [p, setP] = useState<Project>(() => structuredClone(DEFAULT_PROJECT));
  const current = useRef(p);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState("Saving…");
  const [revision, setRevision] = useState(0);
  const history = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const autoMatch = useRef(true);
  const [traced, setTraced] = useState<{ key: string; art: Artwork } | null>(
    null,
  );
  const [built, setBuilt] = useState<{ key: string; model: ModelData } | null>(
    null,
  );
  const [traceError, setTraceError] = useState<{
    key: string;
    text: string;
  } | null>(null);
  const [buildError, setBuildError] = useState<{
    key: string;
    text: string;
  } | null>(null);
  const key = artworkKey(p);
  const modelKey = geometryKey(p, key);
  const art = traced?.key === key ? traced.art : null;
  const model = built?.key === modelKey ? built.model : null;
  const error =
    (traceError?.key === key ? traceError.text : "") ||
    (buildError?.key === modelKey ? buildError.text : "");
  const issues = validate(p);
  const processing = !ready || (!art && !error);
  const building = !!art && !model && !error && !issues.length;

  function replace(next: Project) {
    current.current = next;
    setP(next);
  }
  function checkpoint(previous = current.current) {
    history.current.push(previous);
    if (history.current.length > 50) history.current.shift();
    future.current = [];
    setRevision((v) => v + 1);
  }
  function change(patch: Partial<Project>, match = false) {
    checkpoint();
    if (match) autoMatch.current = true;
    replace({ ...current.current, ...patch });
  }
  function move(x: number, y: number) {
    replace({ ...current.current, artX: x, artY: y });
  }
  function restore(next: Project) {
    autoMatch.current = false;
    replace(next);
    setRevision((v) => v + 1);
  }
  function undo() {
    const previous = history.current.pop();
    if (previous) {
      future.current.push(current.current);
      restore(previous);
    }
  }
  function redo() {
    const next = future.current.pop();
    if (next) {
      history.current.push(current.current);
      restore(next);
    }
  }
  function setColorCount(count: number) {
    if (count === current.current.colorCount) return;
    const prev = current.current;
    change(
      {
        colorCount: count,
        matchBase: prev.colors[0],
        colors: Array.from(
          { length: count },
          (_, i) => prev.colors[i] ?? "#808080",
        ),
        mapping: Array.from({ length: count }, (_, i) => i),
      },
      true,
    );
  }
  function applyImage(next: Project, artwork: Artwork) {
    autoMatch.current = false;
    setTraced({ key: artworkKey(next), art: artwork });
    change(next);
  }
  function loadProject(next: Project) {
    autoMatch.current = false;
    change(next);
  }
  useEffect(() => {
    let active = true;
    loadLocal().then((stored) => {
      if (!active) return;
      if (stored) {
        autoMatch.current = false;
        replace(stored);
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setSaved("Saving…");
    const timer = setTimeout(
      () =>
        saveLocal(p)
          .then(() => {
            if (active) setSaved("Saved on this device");
          })
          .catch(() => {
            if (active) setSaved("Save a project copy to keep this design");
          }),
      650,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [p, ready]);
  useEffect(() => {
    if (!ready) return;
    if (traced?.key === key) {
      if (autoMatch.current) {
        replace({
          ...current.current,
          colors: [
            current.current.colors[0],
            ...traced.art.sourceColors.slice(1),
          ],
          mapping: traced.art.sourceColors.map((_, i) => i),
        });
        autoMatch.current = false;
      }
      return;
    }
    let active = true;
    const snapshot = current.current;
    const timer = setTimeout(async () => {
      try {
        const source =
          snapshot.source ||
          svgDataUrl(
            SAMPLES.find((s) => s.id === snapshot.sample)?.svg ??
              SAMPLES[0].svg,
          );
        const image = await loadPixels(source, snapshot.detail);
        if (!active) return;
        const result = await vectorizeImage({
          ...image,
          count: snapshot.colorCount,
          base: snapshot.matchBase,
          remove: snapshot.removeBackground,
          smooth: snapshot.smoothEdges,
        });
        if (!active || artworkKey(current.current) !== key) return;
        if (autoMatch.current) {
          replace({
            ...current.current,
            colors: [
              current.current.colors[0],
              ...result.sourceColors.slice(1),
            ],
            mapping: result.sourceColors.map((_, i) => i),
          });
          autoMatch.current = false;
        }
        setTraced({ key, art: result });
        setTraceError(null);
      } catch (e) {
        if (active) setTraceError({ key, text: (e as Error).message });
      }
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, ready]);
  useEffect(() => {
    if (!art || issues.length) return;
    let active = true;
    const snapshot = current.current;
    const timer = setTimeout(() => {
      generateModel(snapshot, art)
        .then((result) => {
          if (active) {
            setBuilt({ key: modelKey, model: result });
            setBuildError(null);
          }
        })
        .catch((e) => {
          if (active) setBuildError({ key: modelKey, text: e.message });
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [modelKey, art]);
  return {
    p,
    ready,
    saved,
    art,
    model,
    error,
    issues,
    processing,
    building,
    canExport: !!model && !issues.length && !error,
    change,
    move,
    checkpoint,
    undo,
    redo,
    setColorCount,
    applyImage,
    loadProject,
    canUndo: history.current.length > 0,
    canRedo: future.current.length > 0,
    revision,
  };
}
