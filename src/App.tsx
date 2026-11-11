import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronDown,
  Circle,
  CircleHelp,
  Crosshair,
  Download,
  FlipHorizontal2,
  FolderOpen,
  Hexagon,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Magnet,
  Maximize,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  Square,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { DEFAULT_PROJECT, type Project } from "./types";
import { SAMPLES, svgDataUrl } from "./samples";
import { download, filename, readArtwork, readCoasterShape } from "./lib/image";
import { useCoaster } from "./lib/useCoaster";
import { alignArtwork, type Alignment } from "./lib/alignment";
import { magnetCenters } from "./lib/geometry";
import { parseProject } from "./lib/storage";
import { export3mf, exportStl, exportSvg } from "./lib/export";
import { Field, Section, Slider, Toggle } from "./components/Controls";
import {
  ColorCount,
  ColorMapping,
  Filaments,
} from "./components/ColorControls";
import { BambuLogo, GitHubLogo } from "./components/BrandIcons";
import FlatPreview from "./components/FlatPreview";
import ImportDialog from "./components/ImportDialog";
import Modal from "./components/Modal";
import Tutorial from "./components/Tutorial";
const ModelViewer = lazy(() => import("./components/ModelViewer"));
type Tab = "coaster" | "artwork" | "magnets" | "print";
type Dialog = "tutorial" | "export" | "bambu" | "reset" | null;
const alignmentButtons = [
  { id: "left", label: "Align left", Icon: AlignHorizontalJustifyStart },
  {
    id: "centerX",
    label: "Center horizontally",
    Icon: AlignHorizontalJustifyCenter,
  },
  { id: "right", label: "Align right", Icon: AlignHorizontalJustifyEnd },
  { id: "top", label: "Align top", Icon: AlignVerticalJustifyStart },
  {
    id: "centerY",
    label: "Center vertically",
    Icon: AlignVerticalJustifyCenter,
  },
  { id: "bottom", label: "Align bottom", Icon: AlignVerticalJustifyEnd },
] as const;

export default function App() {
  const editor = useCoaster();
  const {
    p,
    art,
    model,
    processing,
    building,
    error,
    issues,
    change,
    canExport,
  } = editor;
  const [tab, setTab] = useState<Tab>("coaster");
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [bottom, setBottom] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [reset, setReset] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pendingImage, setPendingImage] = useState<{
    source: string;
    name: string;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [readingShape, setReadingShape] = useState(false);
  const shapeInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [bambuReady, setBambuReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadId = useRef(0);
  const dragStart = useRef<Project | null>(null);
  const modalOpen = !!dialog || !!pendingImage;
  function notify(message: string) {
    if (timer.current) clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 4500);
  }
  useEffect(() => {
    try {
      if (!localStorage.getItem("coastergen-tutorial-v2"))
        setDialog("tutorial");
    } catch {
      setDialog("tutorial");
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  function closeTutorial() {
    try {
      localStorage.setItem("coastergen-tutorial-v2", "done");
    } catch {
      /* Session only. */
    }
    setDialog(null);
  }
  async function upload(file?: File) {
    if (!file) return;
    const id = ++uploadId.current;
    setReading(true);
    try {
      const source = await readArtwork(file);
      if (id === uploadId.current) setPendingImage({ source, name: file.name });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      if (id === uploadId.current) setReading(false);
    }
  }
  async function uploadShape(file?: File) {
    if (!file) return;
    setReadingShape(true);
    try {
      const shapeContours = await readCoasterShape(file);
      change({ shape: "custom", shapeContours, shapeName: file.name });
      setView("2d");
      setBottom(false);
      notify("Coaster outline updated. Adjust the size below.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setReadingShape(false);
    }
  }
  async function openProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 30e6) throw new Error("Choose a project under 30 MB.");
      const next = parseProject(JSON.parse(await file.text()));
      editor.loadProject(next);
      setZoom(1);
      setBottom(false);
      notify("Project opened.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function saveProject() {
    download(
      JSON.stringify(p, null, 2),
      filename(p) + ".coaster.json",
      "application/json",
    );
    notify("Project saved with the original image and all settings.");
  }
  useEffect(() => {
    function keys(e: KeyboardEvent) {
      if (
        modalOpen ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? editor.redo() : editor.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject();
      }
      if (e.key.toLowerCase() === "f") {
        setZoom(1);
        setReset((v) => v + 1);
      }
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [p, modalOpen, editor.undo, editor.redo]);
  function align(direction: Alignment) {
    if (!art) return;
    change(alignArtwork(direction, p, art));
    setView("2d");
    setBottom(false);
  }
  function chooseSample(id: string) {
    const sample = SAMPLES.find((s) => s.id === id)!;
    change(
      {
        source: "",
        sample: id,
        sourceName: sample.name + ".svg",
        name: sample.name,
        artScale: 90,
        artX: 0,
        artY: 0,
        rotation: 0,
        mirror: false,
        removeBackground: false,
        matchBase: p.colors[0],
      },
      true,
    );
    setBottom(false);
  }
  function fitImage() {
    if (!art) return;
    const points = art.loops.flatMap((loops, i) =>
      (p.mapping[i] ?? i) === 0 ? [] : loops.flat(),
    );
    if (!points.length) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    let radius = 0;
    for (const [x, y] of points)
      radius = Math.max(
        radius,
        p.shape === "rounded"
          ? Math.max(Math.abs(x - cx), Math.abs(y - cy))
          : Math.hypot(x - cx, y - cy),
      );
    const space =
      (p.diameter / 2 - p.margin) *
      (p.shape === "hexagon"
        ? Math.cos(Math.PI / 6)
        : p.shape === "rounded"
          ? 0.94
          : 1);
    const next = {
      ...p,
      rotation: 0,
      artScale: Math.max(
        5,
        Math.min(
          180,
          (((space / (radius || 1)) * Math.max(art.width, art.height)) /
            p.diameter) *
            100,
        ),
      ),
    };
    change({
      artScale: next.artScale,
      rotation: 0,
      ...alignArtwork("center", next, art),
    });
    setView("2d");
    setBottom(false);
  }
  async function exportFile(type: "3mf" | "svg" | "stl", launch = false) {
    if (!canExport || !art || !model || exporting) return;
    setExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (type === "3mf")
        download(export3mf(p, model), filename(p) + ".3mf", "model/3mf");
      else if (type === "svg")
        download(exportSvg(p, art), filename(p) + ".svg", "image/svg+xml");
      else download(exportStl(model), filename(p) + ".stl", "model/stl");
      if (launch) {
        setBambuReady(true);
        const link = document.createElement("a");
        link.href = "bambustudio://";
        link.click();
      } else
        notify(
          type.toUpperCase() +
            " downloaded" +
            (type === "3mf" ? " with filament colors." : "."),
        );
    } catch (e) {
      notify("Export failed: " + (e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const usedColors = model
    ? new Set(
        model.parts.map((part) => p.colors[part.colorIndex] ?? p.colors[0]),
      ).size
    : p.colorCount;
  const status = error
    ? "Could not update model"
    : issues.length
      ? "Check dimensions"
      : processing
        ? "Matching image colors…"
        : building
          ? "Updating model…"
          : "Ready to make";

  return (
    <>
      <div className="app-shell" inert={modalOpen}>
        <header className="site-header">
          <a className="brand" href="/" aria-label="CoasterGen home">
            <span className="brand-mark">
              <Layers3 size={23} />
            </span>
            CoasterGen
          </a>
          <span className="header-caption">
            Custom coasters for 3D printing
          </span>
          <div className="header-links">
            <button
              className="header-link"
              onClick={() => setDialog("tutorial")}
            >
              <CircleHelp size={17} />
              <span>Tutorial</span>
            </button>
            <a
              className="header-link github-link"
              href="https://github.com/Tekwiz17/CoasterGen"
              target="_blank"
              rel="noreferrer"
            >
              <GitHubLogo />
              <span>Source code</span>
              <ArrowUpRight size={13} />
            </a>
          </div>
        </header>
        <main>
          <div className="workspace-heading">
            <div>
              <h1>Create a coaster</h1>
              <p>Set the size, add an image and choose your filament colors.</p>
            </div>
            <div className="project-actions">
              <button
                className="button light small"
                aria-label="Open project"
                onClick={() => projectInput.current?.click()}
              >
                <FolderOpen size={16} />
                <span>Open project</span>
              </button>
              <button
                className="button light small"
                aria-label="Save project"
                onClick={saveProject}
              >
                <Save size={16} />
                <span>Save project</span>
              </button>
            </div>
          </div>
          <div className="editor-grid">
            <section className="canvas-column">
              <div
                className={
                  "preview-panel panel" + (dragging ? " drop-active" : "")
                }
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node))
                    setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  upload(e.dataTransfer.files[0]);
                }}
              >
                <div className="preview-topbar">
                  <div className="project-name">
                    <input
                      aria-label="Project name"
                      value={p.name}
                      onChange={(e) =>
                        change({ name: e.target.value.slice(0, 80) })
                      }
                    />
                    <span>Click to rename</span>
                  </div>
                  <div className="history-buttons">
                    <button
                      className="icon-button"
                      aria-label="Undo"
                      title="Undo (Ctrl/⌘ Z)"
                      disabled={!editor.canUndo}
                      onClick={editor.undo}
                    >
                      <Undo2 size={17} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Redo"
                      title="Redo (Ctrl/⌘ Shift Z)"
                      disabled={!editor.canRedo}
                      onClick={editor.redo}
                    >
                      <Redo2 size={17} />
                    </button>
                  </div>
                </div>
                <div className="viewport">
                  <div className="viewport-controls">
                    <div className="segmented" aria-label="Preview mode">
                      <button
                        className={view === "2d" ? "active" : ""}
                        aria-pressed={view === "2d"}
                        onClick={() => setView("2d")}
                      >
                        <Square size={14} />
                        Top / edit
                      </button>
                      <button
                        className={view === "3d" ? "active" : ""}
                        aria-pressed={view === "3d"}
                        onClick={() => setView("3d")}
                      >
                        <Box size={15} />
                        3D view
                      </button>
                    </div>
                    <button
                      className={
                        "button light small flip-button" +
                        (bottom ? " active" : "")
                      }
                      onClick={() => setBottom((v) => !v)}
                    >
                      <FlipHorizontal2 size={15} />
                      {bottom ? "Show top" : "Underside"}
                    </button>
                  </div>
                  {view === "2d" ? (
                    <FlatPreview
                      project={p}
                      artwork={art}
                      bottom={bottom}
                      zoom={zoom}
                      onMove={editor.move}
                      onDragStart={() => {
                        dragStart.current = p;
                      }}
                      onDragEnd={() => {
                        if (dragStart.current) {
                          editor.checkpoint(dragStart.current);
                          dragStart.current = null;
                        }
                      }}
                    />
                  ) : (
                    <Suspense
                      fallback={
                        <div className="preview-loading">
                          <LoaderCircle className="spin" />
                          Loading 3D…
                        </div>
                      }
                    >
                      <ModelViewer
                        model={model}
                        project={p}
                        bottom={bottom}
                        zoom={zoom}
                        reset={reset}
                        onFailure={() => {
                          setView("2d");
                          notify(
                            "3D is unavailable in this browser. The top view and all downloads still work.",
                          );
                        }}
                      />
                    </Suspense>
                  )}
                  {((processing && !art) || (building && view === "3d")) &&
                    !issues.length &&
                    !error && (
                      <div className="busy-label" role="status">
                        <LoaderCircle size={15} className="spin" />
                        {status}
                      </div>
                    )}
                  <div className="dimension-guide">
                    <span />
                    {p.diameter} mm
                    <span />
                  </div>
                  <div className="preview-bottom-tools">
                    <span className="orbit-hint">
                      {bottom
                        ? "Magnet pockets open on this side"
                        : view === "3d"
                          ? "Drag to rotate · scroll to zoom"
                          : "Drag image to move · snaps to center"}
                    </span>
                    <div
                      className="zoom-tools"
                      role="group"
                      aria-label="Resize image"
                    >
                      <small>Image size</small>
                      <button
                        aria-label="Zoom out"
                        title="Make image smaller"
                        disabled={bottom || p.artScale <= 5 || !art}
                        onClick={() =>
                          change({ artScale: Math.max(5, p.artScale - 5) })
                        }
                      >
                        <Minus size={15} />
                      </button>
                      <span className="image-scale" aria-label="Image scale">
                        {Math.round(p.artScale)}%
                      </span>
                      <button
                        aria-label="Zoom in"
                        title="Make image larger"
                        disabled={bottom || p.artScale >= 180 || !art}
                        onClick={() =>
                          change({ artScale: Math.min(180, p.artScale + 5) })
                        }
                      >
                        <Plus size={15} />
                      </button>
                      <button
                        aria-label="Reset camera"
                        title="Fit view (F)"
                        onClick={() => {
                          setZoom(1);
                          setReset((v) => v + 1);
                        }}
                      >
                        <Maximize size={15} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="preview-status">
                  <span
                    className={
                      error || issues.length ? "status caution" : "status"
                    }
                  >
                    {processing || building ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : error || issues.length ? (
                      <CircleHelp size={14} />
                    ) : (
                      <Check size={15} />
                    )}
                    <span data-testid="model-status">{status}</span>
                  </span>
                  <span className="local-saved">{editor.saved}</span>
                </div>
                {dragging && (
                  <div className="drop-overlay">
                    <ImagePlus size={36} />
                    <strong>Drop an image here</strong>
                    <span>PNG, JPG, WebP or SVG</span>
                  </div>
                )}
              </div>
              {(issues.length > 0 || error) && (
                <div role="alert" className="validation-message">
                  <CircleHelp size={19} />
                  <div>
                    {[...issues, ...(error ? [error] : [])].map((text) => (
                      <p key={text}>{text}</p>
                    ))}
                  </div>
                </div>
              )}
              <div className="sample-section">
                <div className="sample-heading">
                  <h2>Try an example</h2>
                  <span>Or upload your own in Image & colors</span>
                </div>
                <div className="sample-grid">
                  {SAMPLES.map((sample) => (
                    <button
                      key={sample.id}
                      className={
                        "sample-card" +
                        (!p.source && p.sample === sample.id ? " selected" : "")
                      }
                      onClick={() => chooseSample(sample.id)}
                    >
                      <span className="sample-preview">
                        <img src={svgDataUrl(sample.svg)} alt="" />
                      </span>
                      <span>{sample.name}</span>
                      {!p.source && p.sample === sample.id && (
                        <Check size={13} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <aside className="settings-panel panel">
              <div
                className="settings-tabs"
                role="tablist"
                aria-label="Coaster settings"
              >
                {[
                  { id: "coaster", label: "Size", short: "Size", n: 1 },
                  {
                    id: "artwork",
                    label: "Image & colors",
                    short: "Image",
                    n: 2,
                  },
                  { id: "magnets", label: "Magnets", short: "Magnets", n: 3 },
                  {
                    id: "print",
                    label: "Ready to print",
                    short: "Print",
                    n: 4,
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-label={item.label}
                    id={"tab-" + item.id}
                    aria-controls="settings-content"
                    aria-selected={tab === item.id}
                    tabIndex={tab === item.id ? 0 : -1}
                    onKeyDown={(e) => {
                      const ids: Tab[] = [
                        "coaster",
                        "artwork",
                        "magnets",
                        "print",
                      ];
                      if (
                        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          e.key,
                        )
                      ) {
                        e.preventDefault();
                        const index =
                          e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? ids.length - 1
                              : (ids.indexOf(tab) +
                                  (e.key === "ArrowRight"
                                    ? 1
                                    : ids.length - 1)) %
                                ids.length;
                        setTab(ids[index]);
                        document.getElementById("tab-" + ids[index])?.focus();
                      }
                    }}
                    onClick={() => setTab(item.id as Tab)}
                  >
                    <span>{item.n}</span>
                    {item.short}
                  </button>
                ))}
              </div>
              <div
                className="settings-body"
                id="settings-content"
                role="tabpanel"
                aria-labelledby={"tab-" + tab}
              >
                {tab === "coaster" && (
                  <>
                    <Section
                      title="Coaster size"
                      number="01"
                      icon={<Ruler size={17} />}
                    >
                      <p className="section-description">
                        Start with the shape and dimensions.
                      </p>
                      <div className="shape-picker">
                        {[
                          { id: "circle", label: "Round", Icon: Circle },
                          {
                            id: "rounded",
                            label: "Rounded square",
                            Icon: Square,
                          },
                          { id: "hexagon", label: "Hexagon", Icon: Hexagon },
                        ].map(({ id, label, Icon }) => (
                          <button
                            key={id}
                            className={p.shape === id ? "selected" : ""}
                            aria-pressed={p.shape === id}
                            disabled={readingShape}
                            onClick={() =>
                              change({ shape: id as Project["shape"] })
                            }
                          >
                            <Icon size={25} strokeWidth={1.5} />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                      <input
                        ref={shapeInput}
                        type="file"
                        accept=".svg,image/svg+xml"
                        aria-label="Upload SVG coaster shape"
                        hidden
                        onChange={(e) => {
                          void uploadShape(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                      <div className="custom-shape-row">
                        <button
                          className={
                            "button light small" +
                            (p.shape === "custom" ? " active" : "")
                          }
                          disabled={readingShape}
                          onClick={() => {
                            if (p.shapeContours.length && p.shape !== "custom")
                              change({ shape: "custom" });
                            else shapeInput.current?.click();
                          }}
                        >
                          {readingShape ? (
                            <LoaderCircle size={16} className="spin" />
                          ) : (
                            <Upload size={16} />
                          )}
                          {readingShape
                            ? "Reading outline…"
                            : p.shapeContours.length
                              ? "Custom SVG shape"
                              : "Upload SVG shape"}
                        </button>
                        {p.shapeContours.length > 0 && (
                          <button
                            className="text-button"
                            disabled={readingShape}
                            onClick={() => shapeInput.current?.click()}
                          >
                            Replace SVG
                          </button>
                        )}
                      </div>
                      <p className="control-note shape-note">
                        {p.shape === "custom"
                          ? p.shapeName + " · transparent areas become cutouts."
                          : "Use a filled SVG with one connected outline."}
                      </p>
                      <div className="field-grid">
                        <Field
                          label={
                            p.shape === "custom"
                              ? "Longest side"
                              : p.shape === "circle"
                                ? "Diameter"
                                : "Width"
                          }
                          value={p.diameter}
                          min={30}
                          max={250}
                          onChange={(diameter) => change({ diameter })}
                        />
                        <Field
                          label="Total thickness"
                          value={p.thickness}
                          min={1.2}
                          max={20}
                          step={0.2}
                          onChange={(thickness) => change({ thickness })}
                        />
                      </div>
                      <p className="control-note unit-hint">
                        Sizes use mm. Type <strong>4in</strong> for inches — it
                        becomes 101.6 mm.
                      </p>
                      <div className="size-presets">
                        <span>Common sizes</span>
                        {[85, 100, 110].map((n) => (
                          <button
                            key={n}
                            className={n === p.diameter ? "active" : ""}
                            onClick={() => change({ diameter: n })}
                          >
                            {n} mm
                          </button>
                        ))}
                      </div>
                      <Slider
                        label="Border around image"
                        value={p.margin}
                        min={0}
                        max={12}
                        step={0.5}
                        unit=" mm"
                        onChange={(margin) => change({ margin })}
                      />
                      <p className="control-note">
                        The image is clipped inside this border. The top stays
                        flat.
                      </p>
                    </Section>
                    <details className="disclosure">
                      <summary>
                        Print settings<span>Optional</span>
                      </summary>
                      <Field
                        label="Color layer depth"
                        value={p.inlayDepth}
                        min={0.2}
                        max={3}
                        step={0.2}
                        onChange={(inlayDepth) => change({ inlayDepth })}
                        hint="Depth of the colored inlay. 0.6 mm is a useful starting point."
                      />
                      <label className="field">
                        <span>Image detail</span>
                        <select
                          aria-label="Image detail"
                          value={p.detail}
                          onChange={(e) =>
                            change({ detail: Number(e.target.value) })
                          }
                        >
                          <option value={192}>Quick</option>
                          <option value={320}>Standard</option>
                          <option value={512}>High (recommended)</option>
                          <option value={768}>Extra high (slower)</option>
                        </select>
                      </label>
                    </details>
                    <button
                      className="button primary full next-step"
                      onClick={() => setTab("artwork")}
                    >
                      Next: image & colors
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {tab === "artwork" && (
                  <>
                    <Section
                      title="Image & colors"
                      number="02"
                      icon={<ImagePlus size={17} />}
                    >
                      <button
                        className="upload-zone"
                        disabled={reading}
                        onClick={() => fileInput.current?.click()}
                      >
                        <Upload size={21} />
                        <strong>
                          {reading ? "Reading image…" : "Upload an image"}
                        </strong>
                        <span>PNG, JPG, WebP or SVG · up to 20 MB</span>
                      </button>
                      <div className="file-chip">
                        <span title={p.sourceName}>{p.sourceName}</span>
                        <div className="file-actions">
                          {p.source && (
                            <button
                              className="text-button"
                              onClick={() =>
                                setPendingImage({
                                  source: p.source,
                                  name: p.sourceName,
                                })
                              }
                            >
                              Edit / erase
                            </button>
                          )}
                          <button
                            className="text-button"
                            onClick={() => fileInput.current?.click()}
                          >
                            Replace
                          </button>
                        </div>
                      </div>
                      <ColorCount
                        value={p.colorCount}
                        onChange={editor.setColorCount}
                      />
                      <div className="label-row filament-heading">
                        <strong>Your filament colors</strong>
                        <span>Click to change</span>
                      </div>
                      <Filaments
                        colors={p.colors.slice(0, p.colorCount)}
                        onChange={(colors) => change({ colors })}
                      />
                      <details
                        className="disclosure"
                        key={p.sourceName + p.colorCount}
                        open={!!p.source}
                      >
                        <summary>
                          Map image colors<span>Image → filament</span>
                        </summary>
                        {art ? (
                          <ColorMapping
                            art={art}
                            colors={p.colors.slice(0, p.colorCount)}
                            mapping={p.mapping}
                            onChange={(mapping) => change({ mapping })}
                          />
                        ) : (
                          <p className="control-note">Matching colors…</p>
                        )}
                      </details>
                      <Toggle
                        label="Smooth edges"
                        description="Clean up pixel steps. Turn off for pixel art."
                        checked={p.smoothEdges}
                        onChange={() => change({ smoothEdges: !p.smoothEdges })}
                      />
                      <Toggle
                        label="Remove background"
                        description="Remove a plain background connected to the image edges."
                        checked={p.removeBackground}
                        onChange={() =>
                          change({ removeBackground: !p.removeBackground })
                        }
                      />
                    </Section>
                    <details className="disclosure" open>
                      <summary>
                        Size & position<span>Drag in the top view</span>
                      </summary>
                      <Slider
                        label="Artwork size"
                        value={p.artScale}
                        min={5}
                        max={180}
                        unit="%"
                        onChange={(artScale) => change({ artScale })}
                      />
                      <div className="fit-actions">
                        <button
                          className="button light small"
                          disabled={!art}
                          onClick={() => align("center")}
                        >
                          <Crosshair size={15} />
                          Center
                        </button>
                        <button
                          className="button light small"
                          disabled={!art}
                          onClick={fitImage}
                        >
                          <Maximize size={15} />
                          Fit to coaster
                        </button>
                      </div>
                      <Slider
                        label="Rotation"
                        value={p.rotation}
                        min={-180}
                        max={180}
                        unit="°"
                        onChange={(rotation) => change({ rotation })}
                      />
                      <div className="alignment-tools">
                        {alignmentButtons.map(({ id, label, Icon }) => (
                          <button
                            key={id}
                            className="icon-button"
                            title={label}
                            aria-label={label}
                            disabled={!art}
                            onClick={() => align(id)}
                          >
                            <Icon size={19} />
                          </button>
                        ))}
                      </div>
                      <Toggle
                        label="Snap to center & border"
                        checked={p.snapEnabled}
                        onChange={() => change({ snapEnabled: !p.snapEnabled })}
                      />
                      <Toggle
                        label="Show center guides"
                        checked={p.showGuides}
                        onChange={() => change({ showGuides: !p.showGuides })}
                      />
                      <Toggle
                        label="Mirror image"
                        checked={p.mirror}
                        onChange={() => change({ mirror: !p.mirror })}
                      />
                      <details className="disclosure nested">
                        <summary>Exact position</summary>
                        <div className="field-grid">
                          <Field
                            label="Position X"
                            value={p.artX}
                            min={-p.diameter}
                            max={p.diameter}
                            step={0.5}
                            onChange={(artX) => change({ artX })}
                          />
                          <Field
                            label="Position Y"
                            value={p.artY}
                            min={-p.diameter}
                            max={p.diameter}
                            step={0.5}
                            onChange={(artY) => change({ artY })}
                          />
                        </div>
                      </details>
                    </details>
                    <button
                      className="button light full next-step"
                      onClick={() => setTab("magnets")}
                    >
                      Next: magnets (optional)
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
                {tab === "magnets" && (
                  <Section
                    title="Magnet pockets"
                    number="03"
                    icon={<Magnet size={17} />}
                  >
                    <p className="section-description">
                      Optional recesses on the underside for magnets you glue in
                      after printing.
                    </p>
                    <div className="magnet-options">
                      {[
                        {
                          id: "none",
                          title: "No magnets",
                          description: "Solid underside",
                        },
                        {
                          id: "center",
                          title: "Center magnet",
                          description: "One pocket in the middle",
                        },
                        {
                          id: "outer",
                          title: "Outer magnets",
                          description: "Pockets spaced near the edge",
                        },
                      ].map((option) => (
                        <button
                          key={option.id}
                          className={
                            p.magnetMode === option.id ? "selected" : ""
                          }
                          aria-pressed={p.magnetMode === option.id}
                          onClick={() => {
                            change({
                              magnetMode: option.id as Project["magnetMode"],
                            });
                            setBottom(option.id !== "none");
                            setView("2d");
                          }}
                        >
                          <span className="radio-mark" />
                          <span>
                            <strong>{option.title}</strong>
                            <small>{option.description}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                    {p.magnetMode !== "none" && (
                      <>
                        <div className="field-grid">
                          <Field
                            label="Magnet diameter"
                            value={p.magnetDiameter}
                            min={1}
                            max={40}
                            step={0.5}
                            onChange={(magnetDiameter) =>
                              change({ magnetDiameter })
                            }
                          />
                          <Field
                            label="Magnet thickness"
                            value={p.magnetDepth}
                            min={0.5}
                            max={10}
                            step={0.5}
                            onChange={(magnetDepth) => change({ magnetDepth })}
                          />
                        </div>
                        {p.magnetMode === "outer" && (
                          <>
                            <label className="field">
                              <span>Number of magnets</span>
                              <select
                                aria-label="Number of magnets"
                                value={p.magnetCount}
                                onChange={(e) =>
                                  change({
                                    magnetCount: Number(e.target.value),
                                  })
                                }
                              >
                                {[2, 3, 4, 6, 8].map((n) => (
                                  <option key={n} value={n}>
                                    {n} magnets
                                  </option>
                                ))}
                              </select>
                            </label>
                            <Field
                              label="Gap from edge"
                              value={p.edgeGap}
                              min={0.8}
                              max={p.diameter / 2}
                              step={0.5}
                              onChange={(edgeGap) => change({ edgeGap })}
                              hint="Distance from the pocket wall to the coaster edge."
                            />
                          </>
                        )}
                        <details className="disclosure">
                          <summary>
                            Fit clearance<span>Optional</span>
                          </summary>
                          <Field
                            label="Diameter clearance"
                            value={p.clearance}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(clearance) => change({ clearance })}
                            hint="Added to the pocket diameter so the magnet fits more easily."
                          />
                        </details>
                        <p className="info-note">
                          Pocket size: Ø
                          {Number((p.magnetDiameter + p.clearance).toFixed(2))}{" "}
                          × {Number((p.magnetDepth + 0.1).toFixed(2))} mm.
                          Includes 0.1 mm of depth clearance.
                        </p>
                      </>
                    )}
                    <button
                      className="button primary full next-step"
                      disabled={!canExport}
                      onClick={() => {
                        setBottom(false);
                        setView("3d");
                        setTab("print");
                        notify("Inspect your coaster and download its 3MF.");
                      }}
                    >
                      Next: ready to print
                      <Box size={16} />
                    </button>
                  </Section>
                )}
                {tab === "print" && (
                  <div className="download-panel">
                    <div className="download-heading">
                      <div>
                        <h2>Ready to print?</h2>
                        <p>
                          {p.diameter} × {p.thickness} mm <span>·</span>{" "}
                          {usedColors} colors <span>·</span>{" "}
                          {magnetCenters(p).length} magnet pockets
                        </p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="More export formats"
                        title="SVG, STL and project files"
                        onClick={() => setDialog("export")}
                      >
                        <ChevronDown size={19} />
                      </button>
                    </div>
                    <div className="download-actions">
                      <button
                        className="button primary"
                        disabled={!canExport || exporting}
                        onClick={() => exportFile("3mf")}
                      >
                        <Download size={18} />
                        {exporting ? "Preparing…" : "Download 3MF"}
                      </button>
                      <button
                        className="button light bambu"
                        disabled={!canExport || exporting}
                        onClick={() => {
                          setBambuReady(false);
                          setDialog("bambu");
                        }}
                      >
                        <BambuLogo />
                        Bambu Studio
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <p className="control-note">
                      3MF includes your colors and magnet pockets. Select your
                      printer and filament slots in your slicer.
                    </p>
                  </div>
                )}
                <div className="settings-footer">
                  <span>Artwork stays on your device</span>
                  <button
                    className="text-button"
                    onClick={() => setDialog("reset")}
                  >
                    <RotateCcw size={12} />
                    Reset
                  </button>
                </div>
              </div>
            </aside>
          </div>
          <footer className="site-footer">
            <span>
              No account needed. Your design is saved in this browser.
            </span>
            <button className="text-button" onClick={() => setDialog("export")}>
              SVG, STL & project files
              <ArrowRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      <input
        type="file"
        hidden
        ref={fileInput}
        accept=".png,.jpg,.jpeg,.webp,.svg"
        aria-label="Import artwork file"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        type="file"
        hidden
        ref={projectInput}
        accept=".json"
        aria-label="Open CoasterGen project"
        onChange={(e) => {
          openProject(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog === "tutorial" && <Tutorial onClose={closeTutorial} />}
      {pendingImage && (
        <ImportDialog
          source={pendingImage.source}
          name={pendingImage.name}
          project={p}
          onClose={() => setPendingImage(null)}
          onApply={(next, artwork) => {
            editor.applyImage(next, artwork);
            setPendingImage(null);
            setTab("artwork");
            setView("2d");
            setBottom(false);
            setZoom(1);
          }}
        />
      )}
      {dialog === "export" && (
        <Modal title="Download your coaster" onClose={() => setDialog(null)}>
          <p className="modal-lead">
            Use 3MF for multicolor printing. Save a project copy to edit this
            design later.
          </p>
          <div className="export-options">
            <button
              disabled={!canExport || exporting}
              onClick={() => exportFile("3mf")}
            >
              <span className="export-format">3MF</span>
              <span>
                <strong>Colored 3D model</strong>
                <small>Geometry, filament colors and magnet pockets</small>
              </span>
              <Download size={18} />
            </button>
            <button
              disabled={!canExport || exporting}
              onClick={() => exportFile("svg")}
            >
              <span className="export-format">SVG</span>
              <span>
                <strong>Color-matched vector artwork</strong>
                <small>Actual coaster size, with smooth outlines</small>
              </span>
              <Download size={18} />
            </button>
            <button
              disabled={!canExport || exporting}
              onClick={() => exportFile("stl")}
            >
              <span className="export-format">STL</span>
              <span>
                <strong>Geometry only</strong>
                <small>Contains no filament colors</small>
              </span>
              <Download size={18} />
            </button>
            <button onClick={saveProject}>
              <span className="export-format">JSON</span>
              <span>
                <strong>Editable project</strong>
                <small>Original image and every setting</small>
              </span>
              <Save size={18} />
            </button>
          </div>
        </Modal>
      )}
      {dialog === "bambu" && (
        <Modal
          title="Open your coaster in Bambu Studio"
          onClose={() => setDialog(null)}
        >
          <div className="bambu-intro">
            <BambuLogo large />
            <p>Download the colored 3MF, then open it in Bambu Studio.</p>
          </div>
          <ol className="bambu-steps">
            <li>Click below to download your file and launch Studio.</li>
            <li>
              In Studio, use <strong>File → Open Project</strong> and select{" "}
              <strong>{filename(p)}.3mf</strong>. Keep the parts together.
            </li>
            <li>
              Choose your printer, match each filament slot to your spools, then
              slice.
            </li>
          </ol>
          <button
            className="button primary full"
            disabled={!canExport || exporting}
            onClick={() => exportFile("3mf", true)}
          >
            <BambuLogo />
            {bambuReady
              ? "Download & launch again"
              : "Download & launch Studio"}
            <ArrowUpRight size={15} />
          </button>
          <p className="control-note">
            Requires Bambu Studio installed. If it doesn't launch, open Studio
            manually. Your browser saves the file locally; you select it in
            Studio.
          </p>
          {bambuReady && (
            <p className="info-note" role="status">
              3MF downloaded. Open it in Studio to continue.
            </p>
          )}
        </Modal>
      )}
      {dialog === "reset" && (
        <Modal title="Reset this coaster?" onClose={() => setDialog(null)}>
          <p className="modal-lead">
            Return to the example design and default settings. You can undo the
            reset.
          </p>
          <div className="modal-actions">
            <button className="button light" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                change(structuredClone(DEFAULT_PROJECT), true);
                setDialog(null);
                setBottom(false);
                setZoom(1);
                setTab("coaster");
              }}
            >
              Reset coaster
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
