import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  LoaderCircle,
  Eraser,
  Undo2,
  Redo2,
  RotateCcw,
  Paintbrush,
} from "lucide-react";
import type { Artwork, Project } from "../types";
import { loadPixels } from "../lib/image";
import { loadCleanupMask } from "../lib/cleanup";
import { vectorizeImage } from "../lib/engine";
import { alignArtwork } from "../lib/alignment";
import { ColorCount, ColorMapping, Filaments } from "./ColorControls";
import { Toggle } from "./Controls";
import ImageCleanup, { type CleanupTool } from "./ImageCleanup";
import FlatPreview from "./FlatPreview";
import Modal from "./Modal";
const noop = () => {};
export default function ImportDialog({
  source,
  name,
  project,
  preservePlacement = false,
  onClose,
  onApply,
}: {
  source: string;
  name: string;
  project: Project;
  preservePlacement?: boolean;
  onClose: () => void;
  onApply: (project: Project, artwork: Artwork) => void;
}) {
  const editingExisting =
    preservePlacement || (!!project.source && source === project.source);
  const [count, setCount] = useState(project.colorCount);
  const [remove, setRemove] = useState(
    editingExisting ? project.removeBackground : false,
  );
  const [smooth, setSmooth] = useState(
    editingExisting ? project.smoothEdges : true,
  );
  const [preserve, setPreserve] = useState(project.preserveDetails);
  const [detail, setDetail] = useState(
    editingExisting ? project.detail : Math.max(768, project.detail),
  );
  const [edits, setEdits] = useState([
    { id: 0, mask: editingExisting ? project.cleanupMask : "" },
  ]);
  const [future, setFuture] = useState<typeof edits>([]);
  const customized = useRef(false);
  const editId = useRef(0),
    edited = edits[edits.length - 1];
  const [cleanup, setCleanup] = useState(false),
    [tool, setTool] = useState<CleanupTool>("paint");
  const [brush, setBrush] = useState(12),
    [slot, setSlot] = useState(1),
    [drawing, setDrawing] = useState(false);
  const [livePreview, setLivePreview] = useState("");
  const optionsKey = JSON.stringify([
      count,
      remove,
      smooth,
      preserve,
      detail,
      project.colors[0],
    ]),
    key = JSON.stringify([edited.id, optionsKey]);
  const original = useRef<{
    key: string;
    art: Artwork;
    data: Uint8ClampedArray;
    width: number;
    height: number;
  } | null>(null);
  const [result, setResult] = useState<{
    key: string;
    optionsKey: string;
    art: Artwork;
    baseArt: Artwork;
    colors: string[];
    mapping: number[];
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; text: string } | null>(
    null,
  );
  const current = result?.key === key ? result : null;
  const shown = result?.optionsKey === optionsKey ? result : null;
  const error = failure?.key === key ? failure.text : "";
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        let basis =
          original.current?.key === optionsKey ? original.current : null;
        if (!basis) {
          const pixels = await loadPixels(source, detail);
          if (!active) return;
          const palette =
            editingExisting &&
            project.sourcePalette.length === count &&
            detail === project.detail &&
            preserve === project.preserveDetails
              ? project.sourcePalette
              : undefined;
          const art = await vectorizeImage({
            ...pixels,
            count,
            base: project.colors[0],
            remove,
            smooth,
            preserveDetails: preserve,
            palette,
          });
          if (!active) return;
          basis = { key: optionsKey, art, ...pixels };
          original.current = basis;
        }
        const overrides = await loadCleanupMask(
          edited.mask,
          basis.width,
          basis.height,
        );
        if (!active) return;
        const art = overrides
          ? await vectorizeImage({
              data: basis.data,
              width: basis.width,
              height: basis.height,
              count,
              base: project.colors[0],
              remove,
              smooth,
              preserveDetails: preserve,
              palette: basis.art.sourceColors,
              overrides,
            })
          : basis.art;
        if (active)
          setResult((previous) => ({
            key,
            optionsKey,
            art,
            baseArt: basis.art,
            colors:
              previous?.optionsKey === optionsKey
                ? previous.colors
                : previous && (customized.current || editingExisting)
                  ? Array.from(
                      { length: count },
                      (_, i) => previous.colors[i] ?? art.sourceColors[i],
                    )
                  : editingExisting && count === project.colorCount
                    ? project.colors.slice(0, count)
                    : [project.colors[0], ...art.sourceColors.slice(1)],
            mapping:
              previous?.optionsKey === optionsKey
                ? previous.mapping
                : previous && (customized.current || editingExisting)
                  ? art.sourceColors.map((color, i) => {
                      if (!i)
                        return Math.min(count - 1, previous.mapping[0] ?? 0);
                      const rgb = (c: string) =>
                          c
                            .slice(1)
                            .match(/../g)!
                            .map((v) => parseInt(v, 16)),
                        target = rgb(color);
                      let best = 0,
                        distance = Infinity;
                      previous.art.sourceColors.forEach((c, j) => {
                        const d = rgb(c).reduce(
                          (s, n, k) => s + (n - target[k]) ** 2,
                          0,
                        );
                        if (d < distance) {
                          best = j;
                          distance = d;
                        }
                      });
                      return Math.min(
                        count - 1,
                        previous.mapping[best] ?? best,
                      );
                    })
                  : editingExisting && count === project.colorCount
                    ? project.mapping
                    : Array.from({ length: count }, (_, i) => i),
          }));
      } catch (e) {
        if (active) setFailure({ key, text: (e as Error).message });
      }
    }, 80);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);
  function edit(mask: string) {
    customized.current = true;
    setEdits((previous) => [
      ...previous.slice(-39),
      { id: ++editId.current, mask },
    ]);
    setFuture([]);
  }
  function undo() {
    if (edits.length < 2) return;
    setFuture((previous) => [edited, ...previous]);
    setEdits((previous) => previous.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setEdits((previous) => [...previous, future[0]]);
    setFuture((previous) => previous.slice(1));
  }
  const next: Project = {
    ...project,
    source,
    cleanupMask: edited.mask,
    sourcePalette: current?.art.sourceColors ?? [],
    sourceName: name,
    sample: "",
    name: editingExisting
      ? project.name
      : name.replace(/\.[^.]+$/, "").slice(0, 80) || "My coaster",
    colorCount: count,
    colors: shown?.colors ?? project.colors,
    mapping: shown?.mapping ?? [],
    matchBase: project.colors[0],
    removeBackground: remove,
    smoothEdges: smooth,
    preserveDetails: preserve,
    detail,
    artScale: editingExisting ? project.artScale : 90,
    artX: editingExisting ? project.artX : 0,
    artY: editingExisting ? project.artY : 0,
    rotation: editingExisting ? project.rotation : 0,
    mirror: editingExisting ? project.mirror : false,
  };
  if (shown && !editingExisting)
    Object.assign(next, alignArtwork("center", next, shown.baseArt));
  const selectedSlot = Math.min(slot, count - 1);
  return (
    <Modal
      title={editingExisting ? "Clean up your image" : "Set up your image"}
      onClose={onClose}
    >
      <p className="modal-lead">
        Choose your color limit, then paint over any areas that need a different
        filament.
      </p>
      <div className="cleanup-tools">
        <button
          className={"button light small" + (cleanup ? " active" : "")}
          aria-pressed={cleanup}
          disabled={drawing || !shown}
          onClick={() => setCleanup((v) => !v)}
        >
          <Paintbrush size={16} />
          {cleanup ? "Done cleanup" : "Paint & erase"}
        </button>
        <button
          className="icon-button"
          aria-label="Undo cleanup"
          title="Undo last stroke"
          disabled={edits.length < 2 || drawing}
          onClick={undo}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Redo cleanup"
          title="Redo last stroke"
          disabled={!future.length || drawing}
          onClick={redo}
        >
          <Redo2 size={16} />
        </button>
        <button
          className="text-button"
          disabled={!edited.mask || drawing}
          onClick={() => edit("")}
        >
          <RotateCcw size={14} />
          Reset cleanup
        </button>
      </div>
      {cleanup && (
        <fieldset className="brush-tools" disabled={drawing}>
          <div className="cleanup-modes" role="group" aria-label="Cleanup tool">
            {(
              [
                { id: "paint", label: "Paint", Icon: Paintbrush },
                { id: "erase", label: "Erase", Icon: Eraser },
                { id: "restore", label: "Restore", Icon: RotateCcw },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                className={tool === id ? "active" : ""}
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          {tool === "paint" && (
            <div
              className="paint-palette"
              role="group"
              aria-label="Brush filament color"
            >
              {(shown?.colors ?? project.colors)
                .slice(0, count)
                .map((color, i) => (
                  <button
                    key={i}
                    aria-label={`Paint with filament ${i + 1}${i === 0 ? " (base)" : ""}`}
                    title={
                      i === 0 ? "Coaster base" : `Filament ${i + 1} · ${color}`
                    }
                    aria-pressed={selectedSlot === i}
                    style={{ "--swatch": color } as React.CSSProperties}
                    onClick={() => setSlot(i)}
                  >
                    <i />
                    {i === 0 ? "Base" : i + 1}
                  </button>
                ))}
            </div>
          )}
          <label>
            Brush size{" "}
            <input
              aria-label={tool === "erase" ? "Eraser size" : "Brush size"}
              type="range"
              min="1"
              max="80"
              step="1"
              value={brush}
              style={
                {
                  "--range": `${((brush - 1) / 79) * 100}%`,
                } as React.CSSProperties
              }
              onChange={(e) => setBrush(Number(e.target.value))}
            />
            <output>{brush} px</output>
          </label>
          <p>
            {tool === "paint"
              ? `Paint with ${selectedSlot === 0 ? "the coaster base" : `filament ${selectedSlot + 1}`}. Your strokes keep that filament when you remap image colors.`
              : tool === "erase"
                ? "Erase unwanted pixels to reveal the coaster base."
                : "Brush over corrections to bring back the automatic color mapping."}{" "}
            Zoom in for small details; use Move to pan. Arrow keys move the
            brush; Space paints.
          </p>
        </fieldset>
      )}
      <div className={"import-previews" + (cleanup ? " is-editing" : "")}>
        <figure>
          <div className="image-checker">
            <ImageCleanup
              source={source}
              mask={edited.mask}
              artwork={shown?.baseArt ?? null}
              colors={shown?.colors ?? project.colors}
              mapping={shown?.mapping ?? project.mapping}
              active={cleanup && !!shown}
              tool={tool}
              slot={selectedSlot}
              size={brush}
              onBusy={setDrawing}
              onEdit={edit}
              onPreview={setLivePreview}
            />
          </div>
          <figcaption>
            {cleanup
              ? tool === "paint"
                ? "Mapped image · paint with your filament"
                : tool === "erase"
                  ? "Mapped image · drag to erase"
                  : "Mapped image · restore automatic colors"
              : edited.mask
                ? "Cleaned image"
                : "Original image"}
          </figcaption>
        </figure>
        <figure>
          <div className="import-after">
            {shown ? (
              <FlatPreview
                project={{ ...next, showGuides: false }}
                artwork={shown.art}
                imagePreview={cleanup || edited.mask ? livePreview : undefined}
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
          <figcaption aria-live="polite">
            {drawing
              ? "Live preview"
              : !current
                ? "Updating colors…"
                : `Coaster preview · ${count} colors`}
          </figcaption>
        </figure>
      </div>
      <fieldset className="import-settings" disabled={drawing}>
        <ColorCount
          value={count}
          onChange={(n) => {
            setLivePreview("");
            setCount(n);
          }}
        />
        <div className="import-detail-row">
          <label className="field">
            <span>Image detail</span>
            <select
              aria-label="Import image detail"
              value={detail}
              onChange={(e) => {
                setLivePreview("");
                setDetail(Number(e.target.value));
              }}
            >
              <option value={192}>Quick · 192 px</option>
              <option value={320}>Standard · 320 px</option>
              <option value={512}>High · 512 px</option>
              <option value={768}>Fine · 768 px</option>
              <option value={1024}>Extra fine · 1024 px</option>
            </select>
          </label>
          <Toggle
            label="Keep fine details"
            description="Keep small accents, thin lines, and tiny gaps."
            checked={preserve}
            onChange={() => {
              setLivePreview("");
              setPreserve((v) => !v);
            }}
          />
        </div>
        <div className="import-options">
          <Toggle
            label="Remove background"
            description="Remove a plain background connected to the image edges."
            checked={remove}
            onChange={() => {
              setLivePreview("");
              setRemove((v) => !v);
            }}
          />
          <Toggle
            label="Smooth edges"
            description="Clean up pixel steps. Turn off for pixel art."
            checked={smooth}
            onChange={() => {
              setLivePreview("");
              setSmooth((v) => !v);
            }}
          />
        </div>
        {error && (
          <p role="alert" className="validation-message">
            {error}
          </p>
        )}
        {shown && (
          <>
            <details className="disclosure" open>
              <summary>
                Filament colors <span>Click a swatch to change it</span>
              </summary>
              <Filaments
                colors={shown.colors}
                onChange={(colors) => {
                  customized.current = true;
                  setResult({ ...shown, colors });
                }}
              />
            </details>
            <details className="disclosure" open>
              <summary>
                Map image colors <span>Image color → filament</span>
              </summary>
              <ColorMapping
                art={shown.baseArt}
                colors={shown.colors}
                mapping={shown.mapping}
                onChange={(mapping) => {
                  customized.current = true;
                  setResult({ ...shown, mapping });
                }}
              />
            </details>
            {!shown.art.pixels && (
              <p className="control-note">
                This image is fully transparent after processing. Restore an
                area, turn off background removal, or choose another image.
              </p>
            )}
          </>
        )}
      </fieldset>
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
