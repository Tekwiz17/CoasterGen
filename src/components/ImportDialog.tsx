import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  LoaderCircle,
  Eraser,
  Undo2,
  RotateCcw,
} from "lucide-react";
import type { Artwork, Project } from "../types";
import { loadPixels } from "../lib/image";
import { vectorizeImage } from "../lib/engine";
import { alignArtwork } from "../lib/alignment";
import { ColorCount, ColorMapping, Filaments } from "./ColorControls";
import { Toggle } from "./Controls";
import ImageCleanup from "./ImageCleanup";
import FlatPreview from "./FlatPreview";
import Modal from "./Modal";
const noop = () => {};
export default function ImportDialog({
  source,
  name,
  project,
  onClose,
  onApply,
}: {
  source: string;
  name: string;
  project: Project;
  onClose: () => void;
  onApply: (project: Project, artwork: Artwork) => void;
}) {
  const editingExisting = !!project.source && source === project.source;
  const [count, setCount] = useState(project.colorCount);
  const [remove, setRemove] = useState(
    editingExisting ? project.removeBackground : false,
  );
  const [smooth, setSmooth] = useState(
    editingExisting ? project.smoothEdges : true,
  );
  const [edits, setEdits] = useState([{ id: 0, source }]);
  const editId = useRef(0);
  const edited = edits[edits.length - 1];
  const [erasing, setErasing] = useState(false);
  const [brush, setBrush] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const optionsKey = JSON.stringify([
    count,
    remove,
    smooth,
    project.colors[0],
    project.detail,
  ]);
  const key = JSON.stringify([edited.id, optionsKey]);
  const palette = useRef<{ key: string; colors: string[] } | null>(null);
  const [result, setResult] = useState<{
    key: string;
    optionsKey: string;
    art: Artwork;
    colors: string[];
    mapping: number[];
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; text: string } | null>(
    null,
  );
  const current = result?.key === key ? result : null;
  const error = failure?.key === key ? failure.text : "";
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const pixels = await loadPixels(edited.source, project.detail);
        if (!active) return;
        let colors =
          palette.current?.key === optionsKey
            ? palette.current.colors
            : editingExisting && project.sourcePalette.length === count
              ? project.sourcePalette
              : undefined;
        let original: Artwork | undefined;
        if (!colors) {
          const originalPixels =
            edited.id === 0 ? pixels : await loadPixels(source, project.detail);
          if (!active) return;
          original = await vectorizeImage({
            ...originalPixels,
            count,
            base: project.colors[0],
            remove,
            smooth,
          });
          if (!active) return;
          colors = original.sourceColors;
          palette.current = { key: optionsKey, colors };
        }
        const art =
          edited.id === 0 && original
            ? original
            : await vectorizeImage({
                ...pixels,
                count,
                base: project.colors[0],
                remove,
                smooth,
                palette: colors,
              });
        if (active)
          setResult((previous) => ({
            key,
            optionsKey,
            art,
            colors:
              previous?.optionsKey === optionsKey
                ? previous.colors
                : editingExisting && count === project.colorCount
                  ? project.colors
                  : [project.colors[0], ...art.sourceColors.slice(1)],
            mapping:
              previous?.optionsKey === optionsKey
                ? previous.mapping
                : editingExisting && count === project.colorCount
                  ? project.mapping
                  : Array.from({ length: count }, (_, i) => i),
          }));
      } catch (e) {
        if (active) setFailure({ key, text: (e as Error).message });
      }
    }, 140);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);
  const next: Project = {
    ...project,
    source: edited.source,
    sourcePalette: current?.art.sourceColors ?? [],
    sourceName: name,
    sample: "",
    name: name.replace(/\.[^.]+$/, "").slice(0, 80) || "My coaster",
    colorCount: count,
    colors: current?.colors ?? project.colors,
    mapping: current?.mapping ?? [],
    matchBase: project.colors[0],
    removeBackground: remove,
    smoothEdges: smooth,
    artScale: editingExisting ? project.artScale : 90,
    artX: editingExisting ? project.artX : 0,
    artY: editingExisting ? project.artY : 0,
    rotation: editingExisting ? project.rotation : 0,
    mirror: editingExisting ? project.mirror : false,
  };
  if (current && !editingExisting)
    Object.assign(next, alignArtwork("center", next, current.art));
  return (
    <Modal title="Set up your image" onClose={onClose}>
      <p className="modal-lead">
        Choose your color limit, then match the image to the filaments you have.
      </p>
      <div className="import-previews">
        <figure>
          <div className="image-checker">
            <ImageCleanup
              source={edited.source}
              artwork={result?.art ?? null}
              colors={result?.colors ?? project.colors}
              mapping={result?.mapping ?? project.mapping}
              active={erasing && !!current}
              size={brush}
              onBusy={setDrawing}
              onEdit={(nextSource) =>
                setEdits((previous) => [
                  ...previous.slice(-15),
                  { id: ++editId.current, source: nextSource },
                ])
              }
            />
          </div>
          <figcaption>
            {erasing
              ? "Mapped image · drag to erase"
              : edits.length > 1
                ? "Cleaned image"
                : "Original image"}
          </figcaption>
        </figure>
        <figure>
          <div className="import-after">
            {current ? (
              <FlatPreview
                project={{ ...next, showGuides: false }}
                artwork={current.art}
                bottom={false}
                zoom={1}
                onMove={noop}
                onDragStart={noop}
                onDragEnd={noop}
              />
            ) : (
              <div className="preview-loading">
                <LoaderCircle size={23} className="spin" />
                <span>
                  {error ? "Preview unavailable" : "Matching colors…"}
                </span>
              </div>
            )}
          </div>
          <figcaption>Coaster preview · {count} colors</figcaption>
        </figure>
      </div>
      <div className="cleanup-tools">
        <button
          className={"button light small" + (erasing ? " active" : "")}
          aria-pressed={erasing}
          disabled={drawing}
          onClick={() => setErasing((v) => !v)}
        >
          <Eraser size={16} />
          {erasing ? "Finish erasing" : "Erase unwanted areas"}
        </button>
        <button
          className="icon-button"
          aria-label="Undo erasing"
          title="Undo last erase"
          disabled={edits.length < 2 || drawing}
          onClick={() => setEdits((previous) => previous.slice(0, -1))}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="text-button"
          disabled={edited.id === 0 || drawing}
          onClick={() => setEdits([{ id: 0, source }])}
        >
          <RotateCcw size={14} />
          Reset erasing
        </button>
      </div>
      {erasing && (
        <div className="brush-tools">
          <label>
            Brush size{" "}
            <input
              aria-label="Eraser size"
              type="range"
              min="1"
              max="16"
              step="0.5"
              value={brush}
              style={
                {
                  "--range": `${((brush - 1) / 15) * 100}%`,
                } as React.CSSProperties
              }
              onChange={(e) => setBrush(Number(e.target.value))}
            />
          </label>
          <p>
            Drag on the left image. Erased areas use the coaster base color.
            Your color slots stay the same.
          </p>
        </div>
      )}
      <ColorCount value={count} onChange={setCount} />
      <div className="import-options">
        <Toggle
          label="Remove background"
          description="Remove a plain background connected to the image edges."
          checked={remove}
          onChange={() => setRemove((v) => !v)}
        />
        <Toggle
          label="Smooth edges"
          description="Clean up pixel steps. Turn off for pixel art."
          checked={smooth}
          onChange={() => setSmooth((v) => !v)}
        />
      </div>
      {error && (
        <p role="alert" className="validation-message">
          {error}
        </p>
      )}
      {current && (
        <>
          <details className="disclosure" open>
            <summary>
              Filament colors <span>Click a swatch to change it</span>
            </summary>
            <Filaments
              colors={current.colors}
              onChange={(colors) => setResult({ ...current, colors })}
            />
          </details>
          <details className="disclosure" open>
            <summary>
              Map image colors <span>Image color → filament</span>
            </summary>
            <ColorMapping
              art={current.art}
              colors={current.colors}
              mapping={current.mapping}
              onChange={(mapping) => setResult({ ...current, mapping })}
            />
          </details>
          {!current.art.pixels && (
            <p className="control-note">
              This image is fully transparent after processing. Turn off
              background removal or choose another image.
            </p>
          )}
        </>
      )}
      <div className="modal-actions sticky-actions">
        <button className="button light" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!current || drawing}
          onClick={() => {
            if (current) onApply(next, current.art);
          }}
        >
          Use this image <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
