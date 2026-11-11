import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  LoaderCircle,
  Eraser,
  Undo2,
  Redo2,
  RotateCcw,
  Paintbrush,
  PaintBucket,
  Crop,
} from "lucide-react";
import type { Artwork, Project } from "../types";
import { nearestColorIndex } from "../lib/color";
import { loadPixels } from "../lib/image";
import { loadCleanupMask } from "../lib/cleanup";
import { vectorizeImage } from "../lib/engine";
import { alignArtwork } from "../lib/alignment";
import { ColorCount, ColorMapping, Filaments } from "./ColorControls";
import { Toggle } from "./Controls";
import ImageCrop from "./ImageCrop";
import ImageCleanup, { type CleanupTool } from "./ImageCleanup";
import FlatPreview from "./FlatPreview";
import Modal from "./Modal";
const noop = () => {};
export default function ImportDialog({
  source: initialSource,
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
  const [source, setSource] = useState(initialSource);
  const [cropping, setCropping] = useState(false);
  const editingExisting =
    preservePlacement || (!!project.source && initialSource === project.source);
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
  const quality = !preserve && remove && smooth && detail === 1024;
  const [edits, setEdits] = useState([
    { id: 0, mask: editingExisting ? project.cleanupMask : "" },
  ]);
  const [future, setFuture] = useState<typeof edits>([]);
  const customized = useRef(false);
  const rematchPending = useRef(false);
  const [matchingRevision, setMatchingRevision] = useState(0);
  const editId = useRef(0),
    edited = edits[edits.length - 1];
  const [cleanup, setCleanup] = useState(false),
    [tool, setTool] = useState<CleanupTool>("fill");
  const [brush, setBrush] = useState(12),
    [slot, setSlot] = useState(1),
    [drawing, setDrawing] = useState(false);
  const [livePreview, setLivePreview] = useState("");
  const optionsKey = JSON.stringify([
      source,
      count,
      remove,
      smooth,
      preserve,
      detail,
      project.colors[0],
      matchingRevision,
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
            source === initialSource &&
            !matchingRevision &&
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
        if (active) {
          const rematching = rematchPending.current;
          rematchPending.current = false;
          setResult((previous) => ({
            key,
            optionsKey,
            art,
            baseArt: basis.art,
            colors: rematching
              ? [project.colors[0], ...art.sourceColors.slice(1)]
              : previous?.optionsKey === optionsKey
                ? previous.colors
                : previous && (customized.current || editingExisting)
                  ? Array.from(
                      { length: count },
                      (_, i) => previous.colors[i] ?? art.sourceColors[i],
                    )
                  : editingExisting && count === project.colorCount
                    ? project.colors.slice(0, count)
                    : [project.colors[0], ...art.sourceColors.slice(1)],
            mapping: rematching
              ? Array.from({ length: count }, (_, i) => i)
              : previous?.optionsKey === optionsKey
                ? previous.mapping
                : previous && (customized.current || editingExisting)
                  ? art.sourceColors.map((color, i) => {
                      if (!i)
                        return Math.min(count - 1, previous.mapping[0] ?? 0);
                      const best = nearestColorIndex(
                        color,
                        previous.art.sourceColors,
                      );
                      return Math.min(
                        count - 1,
                        previous.mapping[best] ?? best,
                      );
                    })
                  : editingExisting && count === project.colorCount
                    ? project.mapping
                    : Array.from({ length: count }, (_, i) => i),
          }));
        }
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
        Choose a starting point, check the colors, then touch up any area with
        Paint & erase.
      </p>
      <div className="import-preset" aria-label="Import mode">
        <div>
          <strong>
            {quality ? "Quality mode is on" : "A cleaner starting point"}
          </strong>
          <p>
            Extra-high detail, smooth edges, and background removal. Tiny
            details are simplified.
          </p>
        </div>
        <button
          className={"button small " + (quality ? "primary" : "light")}
          aria-pressed={quality}
          disabled={drawing}
          onClick={() => {
            setLivePreview("");
            setPreserve(false);
            setRemove(true);
            setDetail(1024);
            setSmooth(true);
          }}
        >
          Quality
        </button>
      </div>
      <div className="cleanup-tools">
        <button
          className="button light small"
          disabled={drawing}
          onClick={() => {
            setCropping((v) => !v);
            setCleanup(false);
          }}
        >
          <Crop size={16} />
          Crop image
        </button>
        {source !== initialSource && (
          <button
            className="text-button"
            disabled={drawing}
            onClick={() => {
              setSource(initialSource);
              setEdits([
                {
                  id: ++editId.current,
                  mask: editingExisting ? project.cleanupMask : "",
                },
              ]);
              setFuture([]);
              setLivePreview("");
            }}
          >
            Reset crop
          </button>
        )}
      </div>
      {cropping && (
        <ImageCrop
          source={source}
          onCancel={() => setCropping(false)}
          onApply={(value) => {
            setSource(value);
            setEdits([{ id: ++editId.current, mask: "" }]);
            setFuture([]);
            setLivePreview("");
            setCropping(false);
          }}
        />
      )}
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
                { id: "fill", label: "Fill area", Icon: PaintBucket },
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
          {(tool === "paint" || tool === "fill") && (
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
            {tool === "fill"
              ? "Choose a filament above, then click one connected area in the image. Other areas of that color stay unchanged."
              : tool === "paint"
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
              ? tool === "fill"
                ? "Click an area to recolor it"
                : tool === "paint"
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
              <option value={1024}>Extra high · 1024 px</option>
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
              <div className="image-rematch">
                <button
                  className="button light small"
                  disabled={!current || drawing || cropping}
                  onClick={() => {
                    rematchPending.current = true;
                    customized.current = false;
                    setLivePreview("");
                    setMatchingRevision((v) => v + 1);
                  }}
                >
                  <RotateCcw size={14} />
                  Match original colors
                </button>
                <small>
                  Refreshes filament colors. Your brush corrections stay in
                  place.
                </small>
              </div>
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
          disabled={!current || drawing || cropping}
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
