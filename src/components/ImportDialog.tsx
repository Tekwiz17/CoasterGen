import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { Artwork, Project } from "../types";
import { loadPixels } from "../lib/image";
import { vectorizeImage } from "../lib/engine";
import { alignArtwork } from "../lib/alignment";
import { ColorCount, ColorMapping, Filaments } from "./ColorControls";
import { Toggle } from "./Controls";
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
  const [count, setCount] = useState(project.colorCount);
  const [remove, setRemove] = useState(false);
  const [smooth, setSmooth] = useState(true);
  const key = JSON.stringify([source, count, remove, smooth]);
  const [result, setResult] = useState<{
    key: string;
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
        const pixels = await loadPixels(source, project.detail);
        if (!active) return;
        const art = await vectorizeImage({
          ...pixels,
          count,
          base: project.colors[0],
          remove,
          smooth,
        });
        if (active)
          setResult({
            key,
            art,
            colors: [project.colors[0], ...art.sourceColors.slice(1)],
            mapping: Array.from({ length: count }, (_, i) => i),
          });
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
    source,
    sourceName: name,
    sample: "",
    name: name.replace(/\.[^.]+$/, "").slice(0, 80) || "My coaster",
    colorCount: count,
    colors: current?.colors ?? project.colors,
    mapping: current?.mapping ?? [],
    matchBase: project.colors[0],
    removeBackground: remove,
    smoothEdges: smooth,
    artScale: 90,
    artX: 0,
    artY: 0,
    rotation: 0,
    mirror: false,
  };
  if (current) Object.assign(next, alignArtwork("center", next, current.art));
  return (
    <Modal title="Set up your image" onClose={onClose}>
      <p className="modal-lead">
        Choose your color limit, then match the image to the filaments you have.
      </p>
      <div className="import-previews">
        <figure>
          <div className="image-checker">
            <img src={source} alt="Original uploaded image" />
          </div>
          <figcaption>Original image</figcaption>
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
          disabled={!current}
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
