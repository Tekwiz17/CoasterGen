import {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  Circle,
  CircleHelp,
  Crosshair,
  Download,
  ExternalLink,
  FileImage,
  FileJson,
  FlipHorizontal2,
  FolderOpen,
  Code2,
  Hexagon,
  ImagePlus,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Magnet,
  Maximize,
  Minus,
  MousePointer2,
  Move,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Undo2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  DEFAULT_PROJECT,
  DEFAULT_COLORS,
  colorName,
  type Project,
  type Artwork,
  type ModelData,
} from "./types";
import { SAMPLES, svgDataUrl } from "./samples";
import { loadPixels, readArtwork, download, filename } from "./lib/image";
import { generateModel, vectorizeImage } from "./lib/engine";
import { validate, magnetCenters } from "./lib/geometry";
import { alignArtwork, type Alignment } from "./lib/alignment";
import { export3mf, exportSvg, exportStl } from "./lib/export";
import { loadLocal, saveLocal, parseProject } from "./lib/storage";
import { Section, Field, Slider, Toggle } from "./components/Controls";
import FlatPreview from "./components/FlatPreview";
import Modal from "./components/Modal";
const ModelViewer = lazy(() => import("./components/ModelViewer"));
type Tab = "coaster" | "artwork" | "magnets";
type Dialog = "help" | "export" | "bambu" | "new" | null;
export default function App() {
  const [p, setP] = useState<Project>({
    ...DEFAULT_PROJECT,
    colors: [...DEFAULT_COLORS],
  });
  const [ready, setReady] = useState(false),
    [art, setArt] = useState<Artwork | null>(null),
    [model, setModel] = useState<ModelData | null>(null);
  const [processing, setProcessing] = useState(true),
    [building, setBuilding] = useState(true),
    [error, setError] = useState("");
  const [view, setView] = useState<"3d" | "2d">("3d"),
    [bottom, setBottom] = useState(false),
    [zoom, setZoom] = useState(1),
    [reset, setReset] = useState(0);
  const [tab, setTab] = useState<Tab>("coaster"),
    [dialog, setDialog] = useState<Dialog>(null),
    [saved, setSaved] = useState("Saving locally"),
    [toast, setToast] = useState("");
  const [dragging, setDragging] = useState(false),
    [recolor, setRecolor] = useState(0),
    [exporting, setExporting] = useState(false),
    [bambuReady, setBambuReady] = useState(false);
  const [historyTick, setHistoryTick] = useState(0),
    [showMap, setShowMap] = useState(false);
  const dragStartProject = useRef<Project | null>(null);
  const history = useRef<Project[]>([]),
    future = useRef<Project[]>([]),
    autoPalette = useRef(true),
    restorePalette = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((s: string) => {
    setToast(s);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const change = useCallback(
    (patch: Partial<Project>) =>
      setP((prev) => {
        history.current.push(prev);
        if (history.current.length > 50) history.current.shift();
        future.current = [];
        setHistoryTick((t) => t + 1);
        return { ...prev, ...patch };
      }),
    [],
  );
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) {
      setP((current) => {
        future.current.push(current);
        return prev;
      });
      setHistoryTick((t) => t + 1);
    }
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next) {
      setP((current) => {
        history.current.push(current);
        return next;
      });
      setHistoryTick((t) => t + 1);
    }
  }, []);
  useEffect(() => {
    loadLocal().then((saved) => {
      if (saved) {
        autoPalette.current = false;
        restorePalette.current = true;
        setP(saved);
      }
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaved("Saving locally");
    const timer = setTimeout(
      () =>
        saveLocal(p)
          .then(() => setSaved("Saved on this device"))
          .catch(() => setSaved("Session only · save a copy")),
      700,
    );
    return () => clearTimeout(timer);
  }, [p, ready]);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setProcessing(true);
    setArt(null);
    setError("");
    const run = async () => {
      try {
        const source =
          p.source ||
          svgDataUrl(
            SAMPLES.find((x) => x.id === p.sample)?.svg ?? SAMPLES[0].svg,
          );
        const image = await loadPixels(source, p.detail);
        const artwork = await vectorizeImage({
          ...image,
          count: p.colorCount,
          base: p.matchBase,
          remove: p.removeBackground,
        });
        if (cancelled) return;
        setArt(artwork);
        if (autoPalette.current && !restorePalette.current) {
          setP((prev) => ({
            ...prev,
            colors: [prev.colors[0], ...artwork.sourceColors.slice(1)],
            mapping: Array.from({ length: prev.colorCount }, (_, i) => i),
          }));
        }
        autoPalette.current = false;
        restorePalette.current = false;
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setProcessing(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    ready,
    p.source,
    p.sample,
    p.colorCount,
    p.removeBackground,
    p.detail,
    p.matchBase,
    recolor,
  ]);
  const issues = validate(p);
  const geometryKey = JSON.stringify([
    p.shape,
    p.diameter,
    p.thickness,
    p.inlayDepth,
    p.margin,
    p.artScale,
    p.artX,
    p.artY,
    p.rotation,
    p.mirror,
    p.mapping,
    p.magnetMode,
    p.magnetDiameter,
    p.magnetDepth,
    p.magnetCount,
    p.edgeGap,
    p.clearance,
  ]);
  useEffect(() => {
    if (!art || processing) {
      setBuilding(true);
      return;
    }
    let cancelled = false;
    if (issues.length) {
      setBuilding(false);
      setModel(null);
      return;
    }
    setBuilding(true);
    const timer = setTimeout(
      () =>
        generateModel(p, art)
          .then((result) => {
            if (!cancelled) {
              setModel(result);
              setError("");
              setBuilding(false);
            }
          })
          .catch((e) => {
            if (!cancelled) {
              setError(e.message);
              setModel(null);
              setBuilding(false);
            }
          }),
      180,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [art, processing, geometryKey]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        download(
          JSON.stringify(p, null, 2),
          filename(p) + ".coaster.json",
          "application/json",
        );
        notify("Project saved. Open it here whenever you like.");
      }
      if (e.key.toLowerCase() === "f") {
        setZoom(1);
        setReset((t) => t + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [p, undo, redo, notify]);
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      const source = await readArtwork(file);
      autoPalette.current = true;
      restorePalette.current = false;
      change({
        source,
        sourceName: file.name,
        matchBase: p.colors[0],
        sample: "",
        artScale: 90,
        artX: 0,
        artY: 0,
        rotation: 0,
        mirror: false,
      });
      setBottom(false);
      setTab("artwork");
      notify("Image added. Your colors are being matched locally.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 30e6)
        throw new Error("Project files must be under 30 MB.");
      const next = parseProject(JSON.parse(await file.text()));
      restorePalette.current = true;
      autoPalette.current = false;
      change(next);
      setRecolor((v) => v + 1);
      setZoom(1);
      notify("Project opened. All colors and settings restored.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const chooseSample = (id: string) => {
    const sample = SAMPLES.find((x) => x.id === id)!;
    autoPalette.current = true;
    restorePalette.current = false;
    change({
      source: "",
      sample: id,
      matchBase: p.colors[0],
      sourceName: sample.name + ".svg",
      name: sample.name,
      artScale: 90,
      artX: 0,
      artY: 0,
      rotation: 0,
      mirror: false,
      removeBackground: false,
    });
    setBottom(false);
  };
  const align = (a: Alignment) => {
    if (art) {
      change(alignArtwork(a, p, art));
      setView("2d");
      setBottom(false);
    }
  };
  const saveProject = () => {
    download(
      JSON.stringify(p, null, 2),
      filename(p) + ".coaster.json",
      "application/json",
    );
    notify("Editable project saved, including your original artwork.");
  };
  const canExport =
    !!model && !building && !processing && !issues.length && !error;
  const exportFile = async (type: "3mf" | "svg" | "stl", launch = false) => {
    if (!canExport || !model || !art) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 20));
      if (type === "3mf")
        download(export3mf(p, model), filename(p) + ".3mf", "model/3mf");
      else if (type === "svg")
        download(exportSvg(p, art), filename(p) + ".svg", "image/svg+xml");
      else download(exportStl(model), filename(p) + ".stl", "model/stl");
      if (launch) {
        setBambuReady(true);
        const a = document.createElement("a");
        a.href = "bambustudio://";
        a.click();
      } else
        notify(
          `${type.toUpperCase()} downloaded${type === "3mf" ? " with your filament colors." : "."}`,
        );
    } catch (e) {
      notify("Export failed. " + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const totalWeight = model ? (model.volume / 1000) * 1.24 : 0;
  const usedColors = model
    ? new Set(model.parts.map((x) => p.colors[x.colorIndex].toUpperCase())).size
    : p.colorCount;
  const status = error
    ? "Needs attention"
    : issues.length
      ? "Check dimensions"
      : processing
        ? "Matching colors"
        : building
          ? "Updating model"
          : "Ready to make";
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="CoasterGen home">
          <span className="brand-mark">
            <Layers3 size={24} strokeWidth={1.65} />
          </span>
          Coaster<span>Gen</span>
          <span className="studio-label">STUDIO</span>
        </a>
        <nav>
          <button className="nav-active" onClick={() => setDialog(null)}>
            Create
          </button>
          <button onClick={() => setDialog("help")}>
            How it works <ArrowUpRight size={13} />
          </button>
        </nav>
        <div className="header-end">
          <span className="private-pill">
            <span />
            100% on-device
          </span>
          <a
            className="icon-button github-link"
            href="https://github.com/Tekwiz17/CoasterGen"
            target="_blank"
            rel="noreferrer"
            aria-label="Source on GitHub"
          >
            <Code2 size={19} />
          </a>
          <button
            className="help-button icon-button"
            onClick={() => setDialog("help")}
            aria-label="Help"
          >
            <CircleHelp size={19} />
          </button>
        </div>
      </header>
      <main>
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">
              <span />
              YOUR NEXT FAVORITE COASTER
            </div>
            <h1>
              Make it <em>yours.</em>
            </h1>
            <p>
              A little artwork. A few colors. Something worth putting your
              coffee on.
            </p>
          </div>
          <div className="project-actions">
            <button
              className="button light"
              onClick={() => projectInput.current?.click()}
            >
              <FolderOpen size={16} />
              <span>Open project</span>
            </button>
            <button className="button light" onClick={saveProject}>
              <Save size={16} />
              <span>Save project</span>
            </button>
            <button
              className="button primary export-top"
              onClick={() => setDialog("export")}
              disabled={!canExport}
            >
              <Download size={17} />
              <span>Export coaster</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
        <div className="editor-layout">
          <aside className="settings-panel panel">
            <div className="panel-title">
              <SlidersHorizontal size={17} />
              <span>Make it your own</span>
              <button className="text-button" onClick={() => setDialog("new")}>
                Reset
              </button>
            </div>
            <div
              className="settings-tabs"
              role="tablist"
              aria-label="Coaster settings"
            >
              {(
                [
                  { id: "coaster", name: "Coaster", icon: Ruler },
                  { id: "artwork", name: "Artwork", icon: ImagePlus },
                  { id: "magnets", name: "Magnets", icon: Magnet },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  <t.icon size={16} />
                  {t.name}
                  {t.id === "magnets" && p.magnetMode !== "none" && <i />}
                </button>
              ))}
            </div>
            <div className="settings-body">
              {tab === "coaster" && (
                <>
                  <Section
                    number="01"
                    title="The foundation"
                    icon={<Ruler size={17} />}
                  >
                    <label className="field">
                      <span>Coaster shape</span>
                    </label>
                    <div className="shape-picker">
                      {(
                        [
                          { id: "circle", label: "Round", icon: Circle },
                          { id: "rounded", label: "Soft square", icon: Square },
                          { id: "hexagon", label: "Hexagon", icon: Hexagon },
                        ] as const
                      ).map((s) => (
                        <button
                          key={s.id}
                          className={p.shape === s.id ? "selected" : ""}
                          onClick={() => change({ shape: s.id })}
                          aria-pressed={p.shape === s.id}
                        >
                          <s.icon size={25} strokeWidth={1.4} />
                          <span>{s.label}</span>
                        </button>
                      ))}
                    </div>
                    <div className="field-grid">
                      <Field
                        label={p.shape === "circle" ? "Diameter" : "Width"}
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
                    <div className="size-presets">
                      <span>Quick size</span>
                      {[85, 100, 110].map((n) => (
                        <button
                          key={n}
                          className={p.diameter === n ? "active" : ""}
                          onClick={() => change({ diameter: n })}
                        >
                          {n} mm
                        </button>
                      ))}
                    </div>
                    <Slider
                      label="Clear border"
                      value={p.margin}
                      min={0}
                      max={12}
                      step={0.5}
                      unit=" mm"
                      onChange={(margin) => change({ margin })}
                    />
                    <p className="control-note">
                      Artwork stays inside this border, even when you move or
                      resize it.
                    </p>
                  </Section>
                  <Section
                    number="02"
                    title="Print details"
                    icon={<Layers3 size={17} />}
                  >
                    <Field
                      label="Color layer depth"
                      value={p.inlayDepth}
                      min={0.2}
                      max={3}
                      step={0.2}
                      onChange={(inlayDepth) => change({ inlayDepth })}
                    />
                    <div className="soft-note">
                      <Layers3 size={17} />
                      <p>
                        <strong>A smooth, flush surface.</strong>Your colors are
                        inlaid into the top {p.inlayDepth} mm. Total height
                        stays {p.thickness} mm.
                      </p>
                    </div>
                    <label className="field">
                      <span>Artwork detail</span>
                      <select
                        aria-label="Artwork detail"
                        value={p.detail}
                        onChange={(e) =>
                          change({ detail: Number(e.target.value) })
                        }
                      >
                        <option value={192}>Quick · 192 px</option>
                        <option value={320}>Balanced · 320 px</option>
                        <option value={512}>Fine · 512 px</option>
                      </select>
                    </label>
                    <p className="control-note">
                      Fine captures more detail and takes longer to process.
                      Very small features may need a smaller nozzle.
                    </p>
                  </Section>
                  <div className="next-step">
                    <div>
                      <ImagePlus size={18} />
                      <span>Now give it some personality.</span>
                    </div>
                    <button
                      onClick={() => setTab("artwork")}
                      aria-label="Customize artwork"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </>
              )}
              {tab === "artwork" && (
                <>
                  <Section
                    number="01"
                    title="Your artwork"
                    icon={<FileImage size={17} />}
                  >
                    <button
                      className="upload-zone"
                      onClick={() => fileInput.current?.click()}
                    >
                      <span className="upload-icon">
                        <Upload size={22} />
                      </span>
                      <strong>Drop in something you love</strong>
                      <span>
                        or <u>browse files</u>
                      </span>
                      <small>PNG, JPG, WebP, SVG · up to 20 MB</small>
                    </button>
                    <div className="file-chip">
                      <FileImage size={17} />
                      <span title={p.sourceName}>{p.sourceName}</span>
                      <button
                        className="icon-button"
                        onClick={() => fileInput.current?.click()}
                        aria-label="Replace artwork"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                    <Toggle
                      label="Remove background"
                      description="Removes a connected, similar-colored background from the image edges."
                      checked={p.removeBackground}
                      onChange={() => {
                        autoPalette.current = true;
                        change({
                          removeBackground: !p.removeBackground,
                          matchBase: p.colors[0],
                        });
                      }}
                    />
                  </Section>
                  <Section
                    number="02"
                    title="Just the right fit"
                    icon={<Move size={17} />}
                  >
                    <Slider
                      label="Artwork size"
                      value={p.artScale}
                      min={5}
                      max={180}
                      unit="%"
                      onChange={(artScale) => change({ artScale })}
                      reset={() => change({ artScale: 90 })}
                    />
                    <div className="fit-actions">
                      <button
                        className="button light small"
                        onClick={() => {
                          align("center");
                          notify("Artwork centered.");
                        }}
                      >
                        <Crosshair size={15} />
                        Center
                      </button>
                      <button
                        className="button light small"
                        onClick={() =>
                          change({
                            artScale:
                              ((p.diameter - p.margin * 2) / p.diameter) * 100,
                            artX: 0,
                            artY: 0,
                            rotation: 0,
                          })
                        }
                      >
                        <Maximize size={14} />
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
                      reset={() => change({ rotation: 0 })}
                    />
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
                    <div className="alignment-heading">
                      <span>Align to coaster</span>
                      <span>visible artwork</span>
                    </div>
                    <div className="alignment-tools">
                      {(
                        [
                          {
                            id: "left",
                            label: "Align left",
                            icon: AlignHorizontalJustifyStart,
                          },
                          {
                            id: "centerX",
                            label: "Center horizontally",
                            icon: AlignHorizontalJustifyCenter,
                          },
                          {
                            id: "right",
                            label: "Align right",
                            icon: AlignHorizontalJustifyEnd,
                          },
                          {
                            id: "top",
                            label: "Align top",
                            icon: AlignVerticalJustifyStart,
                          },
                          {
                            id: "centerY",
                            label: "Center vertically",
                            icon: AlignVerticalJustifyCenter,
                          },
                          {
                            id: "bottom",
                            label: "Align bottom",
                            icon: AlignVerticalJustifyEnd,
                          },
                        ] as const
                      ).map((a) => (
                        <button
                          key={a.id}
                          aria-label={a.label}
                          title={a.label}
                          onClick={() => align(a.id)}
                          disabled={!art}
                        >
                          <a.icon size={17} />
                        </button>
                      ))}
                    </div>
                    <Toggle
                      label="Snap to center & border"
                      description="Smart guides appear as you drag. Hold Alt/Option to move freely."
                      checked={p.snapEnabled}
                      onChange={() => change({ snapEnabled: !p.snapEnabled })}
                    />
                    <Toggle
                      label="Show center lines"
                      checked={p.showGuides}
                      onChange={() => change({ showGuides: !p.showGuides })}
                    />
                    <Toggle
                      label="Mirror artwork"
                      checked={p.mirror}
                      onChange={() => change({ mirror: !p.mirror })}
                    />
                    <button
                      className="inline-link"
                      onClick={() => {
                        setView("2d");
                        setBottom(false);
                        notify(
                          "Drag the artwork on the coaster to position it.",
                        );
                      }}
                    >
                      <MousePointer2 size={14} />
                      Position directly in 2D
                      <ArrowUpRight size={13} />
                    </button>
                  </Section>
                </>
              )}
              {tab === "magnets" && (
                <>
                  <Section
                    number="01"
                    title="A little attraction"
                    icon={<Magnet size={17} />}
                  >
                    <p className="section-description">
                      Add open pockets on the underside for glue-in disc
                      magnets.
                    </p>
                    <div className="magnet-options">
                      {(
                        [
                          {
                            id: "none",
                            name: "No magnets",
                            text: "Keep things simple",
                          },
                          {
                            id: "center",
                            name: "Center magnet",
                            text: "One pocket, right in the middle",
                          },
                          {
                            id: "outer",
                            name: "Outer magnets",
                            text: "Evenly spaced near the edge",
                          },
                        ] as const
                      ).map((m) => (
                        <button
                          className={p.magnetMode === m.id ? "selected" : ""}
                          key={m.id}
                          onClick={() => {
                            change({ magnetMode: m.id });
                            setBottom(m.id !== "none");
                          }}
                        >
                          <span className={`magnet-diagram ${m.id}`}>
                            <i />
                            {m.id === "outer" && (
                              <>
                                <i />
                                <i />
                                <i />
                              </>
                            )}
                          </span>
                          <span>
                            <strong>{m.name}</strong>
                            <small>{m.text}</small>
                          </span>
                          <span className="radio-dot" />
                        </button>
                      ))}
                    </div>
                  </Section>
                  {p.magnetMode !== "none" && (
                    <Section
                      number="02"
                      title="Pocket dimensions"
                      icon={<Ruler size={17} />}
                    >
                      <div className="field-grid">
                        <Field
                          label="Magnet diameter"
                          value={p.magnetDiameter}
                          min={1}
                          max={50}
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
                                change({ magnetCount: Number(e.target.value) })
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
                            hint="From the pocket wall to the nearest coaster edge."
                          />
                        </>
                      )}
                      <Field
                        label="Diameter clearance"
                        value={p.clearance}
                        min={0}
                        max={1}
                        step={0.05}
                        onChange={(clearance) => change({ clearance })}
                        hint="Added to the magnet diameter for an easier fit."
                      />
                      <div className="soft-note">
                        <Magnet size={17} />
                        <p>
                          <strong>
                            Pocket: Ø
                            {Number(
                              (p.magnetDiameter + p.clearance).toFixed(2),
                            )}{" "}
                            × {Number((p.magnetDepth + 0.1).toFixed(2))} mm
                          </strong>
                          Includes 0.1 mm of depth clearance. Test fit before
                          gluing.
                        </p>
                      </div>
                      <button
                        className="inline-link"
                        onClick={() => {
                          setBottom(true);
                          setView("2d");
                        }}
                      >
                        Inspect underside
                        <ArrowUpRight size={13} />
                      </button>
                    </Section>
                  )}
                  {p.magnetMode === "none" && (
                    <div className="quiet-card">
                      <ShieldCheck size={23} />
                      <p>
                        A clean, solid base. You can always add magnets later.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="panel-footer">
              <LockKeyhole size={13} />
              <span>Your files never leave your device.</span>
            </div>
          </aside>
          <section className="canvas-column">
            <div
              className={`preview-panel ${dragging ? "drop-active" : ""}`}
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
                  <span className="project-dot" />
                  <input
                    aria-label="Project name"
                    value={p.name}
                    onChange={(e) =>
                      change({ name: e.target.value.slice(0, 80) })
                    }
                  />
                  <span className="draft-tag">DRAFT</span>
                </div>
                <div className="history-buttons">
                  <button
                    className="icon-button"
                    onClick={undo}
                    disabled={!history.current.length}
                    aria-label="Undo"
                    title="Undo (⌘Z)"
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={redo}
                    disabled={!future.current.length}
                    aria-label="Redo"
                    title="Redo (⌘⇧Z)"
                  >
                    <Redo2 size={17} />
                  </button>
                </div>
              </div>
              <div className="viewport">
                <div className="viewport-controls">
                  <div className="segmented" aria-label="Preview mode">
                    <button
                      className={view === "3d" ? "active" : ""}
                      onClick={() => setView("3d")}
                    >
                      <Box size={14} />
                      3D view
                    </button>
                    <button
                      className={view === "2d" ? "active" : ""}
                      onClick={() => setView("2d")}
                    >
                      <Square size={13} />
                      2D edit
                    </button>
                  </div>
                  <button
                    className={`button light small flip-button ${bottom ? "is-bottom" : ""}`}
                    onClick={() => setBottom(!bottom)}
                  >
                    <FlipHorizontal2 size={14} />
                    {bottom ? "Underside" : "Flip coaster"}
                  </button>
                </div>
                {view === "3d" ? (
                  <Suspense
                    fallback={
                      <div className="initial-loading">
                        <LoaderCircle className="spin" />
                        Opening 3D preview
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
                          "Using the 2D preview because WebGL is unavailable. All exports still work.",
                        );
                      }}
                    />
                  </Suspense>
                ) : (
                  <FlatPreview
                    project={p}
                    artwork={art}
                    bottom={bottom}
                    zoom={zoom}
                    onMove={(artX, artY) =>
                      setP((prev) => ({ ...prev, artX, artY }))
                    }
                    onDragStart={() => {
                      dragStartProject.current = p;
                    }}
                    onDragEnd={() => {
                      if (dragStartProject.current) {
                        history.current.push(dragStartProject.current);
                        future.current = [];
                        dragStartProject.current = null;
                        setHistoryTick((v) => v + 1);
                      }
                    }}
                  />
                )}
                {!model &&
                  view === "3d" &&
                  (processing || building) &&
                  !issues.length &&
                  !error && (
                    <div className="initial-loading">
                      <span className="loading-emblem">
                        <Layers3 size={30} />
                      </span>
                      <strong>Making a little something.</strong>
                      <span>Everything is happening on your device.</span>
                      <LoaderCircle size={18} className="spin" />
                    </div>
                  )}
                {bottom && p.magnetMode === "none" && (
                  <div className="view-caption">
                    A clean underside. Add pockets in Magnets.
                  </div>
                )}
                <div className="dimension-guide">
                  <span />
                  {p.shape === "circle" ? "Ø " : ""}
                  {p.diameter} mm
                  <span />
                </div>
                <div className="preview-bottom-tools">
                  <span className="orbit-hint">
                    <MousePointer2 size={13} />
                    {view === "3d"
                      ? "Drag to orbit · scroll to zoom"
                      : bottom
                        ? "Underside · pocket view"
                        : p.snapEnabled
                          ? "Drag to position · Alt to unsnap"
                          : "Drag artwork to position"}
                  </span>
                  <div className="zoom-tools">
                    <button
                      aria-label="Zoom out"
                      onClick={() => setZoom((v) => Math.max(0.55, v - 0.15))}
                    >
                      <Minus size={15} />
                    </button>
                    <span>{Math.round(zoom * 100)}%</span>
                    <button
                      aria-label="Zoom in"
                      onClick={() => setZoom((v) => Math.min(1.9, v + 0.15))}
                    >
                      <Plus size={15} />
                    </button>
                    <i />
                    <button
                      aria-label="Reset camera"
                      onClick={() => {
                        setZoom(1);
                        setReset((v) => v + 1);
                      }}
                      title="Fit view (F)"
                    >
                      <Maximize size={14} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="preview-status">
                <span
                  className={
                    issues.length || error ? "status caution" : "status"
                  }
                >
                  {processing || building ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : issues.length || error ? (
                    <CircleHelp size={13} />
                  ) : (
                    <CheckCheck size={14} />
                  )}
                  <span data-testid="model-status">{status}</span>
                </span>
                <span className="local-saved">
                  <span />
                  {saved}
                </span>
              </div>
              {dragging && (
                <div className="drop-overlay">
                  <ImagePlus size={42} />
                  <strong>Make this one yours.</strong>
                  <span>Drop your artwork to get started.</span>
                </div>
              )}
            </div>
            {(issues.length > 0 || error) && (
              <div role="alert" className="validation-message">
                <CircleHelp size={18} />
                <div>
                  <strong>One quick adjustment</strong>
                  {[...issues, ...(error ? [error] : [])].map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              </div>
            )}
            <div className="inspiration">
              <div className="inspiration-heading">
                <div>
                  <Sparkles size={16} />
                  <h2>Start with a little inspiration</h2>
                </div>
                <span>Made to make your own</span>
              </div>
              <div className="sample-grid">
                {SAMPLES.map((s) => (
                  <button
                    key={s.id}
                    className={`sample-card ${!p.source && p.sample === s.id ? "selected" : ""}`}
                    onClick={() => chooseSample(s.id)}
                  >
                    <span className="sample-preview">
                      <img src={svgDataUrl(s.svg)} alt="" />
                    </span>
                    <span>{s.name}</span>
                    {!p.source && p.sample === s.id ? (
                      <span className="sample-check">
                        <Check size={10} />
                      </span>
                    ) : (
                      <ArrowUpRight className="sample-arrow" size={12} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <aside className="right-column">
            <section className="palette-panel panel">
              <div className="panel-title">
                <Palette size={17} />
                <span>Your palette</span>
                <span className="count-badge">{p.colorCount}</span>
              </div>
              <div className="palette-body">
                <label className="field">
                  <span>
                    Total colors{" "}
                    <span className="label-hint">base included</span>
                  </span>
                  <div className="color-count">
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <button
                        key={n}
                        className={p.colorCount === n ? "selected" : ""}
                        aria-label={`${n} total colors`}
                        aria-pressed={p.colorCount === n}
                        onClick={() => {
                          autoPalette.current = true;
                          change({
                            colorCount: n,
                            matchBase: p.colors[0],
                            colors: [
                              ...p.colors,
                              ...Array(8).fill("#8D9B88"),
                            ].slice(0, n),
                            mapping: Array.from({ length: n }, (_, i) => i),
                          });
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </label>
                <p className="control-note">
                  One slot for the base. The rest bring your artwork to life.
                </p>
                <div className="color-list">
                  {p.colors.slice(0, p.colorCount).map((hex, i) => (
                    <div className="color-row" key={i}>
                      <label
                        className="swatch"
                        style={{ background: hex }}
                        title={`Choose filament ${i + 1} color`}
                      >
                        <input
                          type="color"
                          aria-label={`Filament ${i + 1} color`}
                          value={hex}
                          onChange={(e) => {
                            const colors = [...p.colors];
                            colors[i] = e.target.value.toUpperCase();
                            change({ colors });
                          }}
                        />
                        <span>{i + 1}</span>
                      </label>
                      <div>
                        <strong>
                          {i === 0 ? "Coaster base" : colorName(hex)}
                        </strong>
                        <span>
                          {hex.toUpperCase()}
                          {i === 0 && <b>BASE</b>}
                        </span>
                      </div>
                      <span className="color-row-end">
                        {i === 0 ? (
                          <Layers3 size={14} />
                        ) : (
                          <span
                            className="color-dot"
                            style={{ background: hex }}
                          />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  className="button light auto-match"
                  onClick={() => {
                    autoPalette.current = true;
                    change({ matchBase: p.colors[0] });
                    setRecolor((n) => n + 1);
                    notify("Matching the palette to your original artwork.");
                  }}
                  disabled={processing}
                >
                  <WandSparkles size={15} />
                  {processing ? "Matching colors…" : "Auto-match artwork"}
                </button>
                <button
                  className="mapping-toggle"
                  onClick={() => setShowMap(!showMap)}
                  aria-expanded={showMap}
                >
                  <span>Map artwork colors</span>
                  <ChevronDown size={14} className={showMap ? "turned" : ""} />
                </button>
                {showMap && (
                  <div className="color-mapping">
                    <p>Send each detected color to a filament slot.</p>
                    {art?.sourceColors.map((hex, i) => (
                      <label className="mapping-row" key={i}>
                        <span
                          className="source-swatch"
                          style={{ background: hex }}
                        />
                        <ArrowRight size={12} />
                        <select
                          aria-label={`Map detected color ${i + 1}`}
                          value={p.mapping[i] ?? i}
                          onChange={(e) => {
                            const mapping = [...p.mapping];
                            mapping[i] = Number(e.target.value);
                            change({ mapping });
                          }}
                        >
                          {p.colors.slice(0, p.colorCount).map((c, j) => (
                            <option key={j} value={j}>
                              Slot {j + 1} · {j === 0 ? "Base" : colorName(c)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                <div className="palette-tip">
                  <span className="tiny-spark">
                    <Sparkles size={13} />
                  </span>
                  <p>
                    {p.colorCount <= 4
                      ? "Four colors or fewer? Perfect for a single AMS."
                      : "More than four colors needs additional filament capacity."}{" "}
                    Click any swatch to change it.
                  </p>
                </div>
              </div>
            </section>
            <section className="make-panel panel">
              <div className="make-heading">
                <span className="make-icon">
                  <Box size={20} />
                </span>
                <div>
                  <h2>From screen to table.</h2>
                  <p>Your next coffee break, upgraded.</p>
                </div>
              </div>
              <div className="model-stats">
                <div>
                  <span>Size</span>
                  <strong>
                    {p.diameter} × {p.thickness}
                    <small>mm</small>
                  </strong>
                </div>
                <div>
                  <span>Solid PLA estimate</span>
                  <strong>
                    {totalWeight ? totalWeight.toFixed(1) : "—"}
                    <small>g</small>
                  </strong>
                </div>
                <div>
                  <span>Filaments used</span>
                  <strong>
                    {usedColors}
                    <small>colors</small>
                  </strong>
                </div>
                <div>
                  <span>Magnet pockets</span>
                  <strong>
                    {magnetCenters(p).length}
                    <small>
                      {p.magnetMode === "center"
                        ? "center"
                        : p.magnetMode === "outer"
                          ? "outer"
                          : "none"}
                    </small>
                  </strong>
                </div>
              </div>
              <button
                className="button dark full"
                disabled={!canExport || exporting}
                onClick={() => exportFile("3mf")}
              >
                <ArrowDownToLine size={16} />
                {exporting ? "Preparing…" : "Download 3MF"}
                <span className="with-colors">+ colors</span>
              </button>
              <button
                className="button bambu full"
                disabled={!canExport}
                onClick={() => {
                  setBambuReady(false);
                  setDialog("bambu");
                }}
              >
                <span className="bambu-glyph">B</span>Open in Bambu Studio
                <ArrowUpRight size={14} />
              </button>
              <div className="export-footnote">
                <Check size={12} />
                Color parts & magnet pockets included
              </div>
            </section>
          </aside>
        </div>
        <footer className="site-footer">
          <span>
            <span className="footer-mark">c.</span> Made for makers. And their
            mugs.
          </span>
          <span>
            <ShieldCheck size={13} />
            No uploads. No accounts. Just create.
          </span>
          <button onClick={() => setDialog("help")}>
            A few useful things <ArrowUpRight size={12} />
          </button>
        </footer>
      </main>
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
          importProject(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog === "help" && (
        <Modal
          title="A coaster, in a few good steps."
          onClose={() => setDialog(null)}
        >
          <p className="modal-lead">
            Your artwork becomes real colored parts, ready for your slicer.
          </p>
          <div className="help-steps">
            {[
              {
                icon: Ruler,
                title: "Start with the shape.",
                text: "Set the size and total height. A 100 mm round coaster at 4 mm thick is a great place to start.",
              },
              {
                icon: ImagePlus,
                title: "Bring your own artwork.",
                text: "Drop in a PNG, JPG, WebP, or SVG. We reduce its colors and trace it into vector outlines on your device. Transparent images and bold shapes work best.",
              },
              {
                icon: Palette,
                title: "Make every color count.",
                text: "The default is four colors total, including the base. Change swatches to match your filament, or remap several image colors to one slot.",
              },
              {
                icon: Magnet,
                title: "Add a little pull. Or don’t.",
                text: "Choose a center magnet or evenly spaced outer magnets. Pockets open on the underside; their size includes your selected fit clearance.",
              },
              {
                icon: Download,
                title: "Take it to the printer.",
                text: "Download the colored 3MF. Open it as a project in Bambu Studio to keep filament assignments. Select your printer and map the slots to your actual AMS filaments before slicing.",
              },
            ].map((s, i) => (
              <div key={i}>
                <span>
                  <s.icon size={18} />
                </span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="soft-note">
            <LockKeyhole size={18} />
            <p>
              <strong>Your design stays yours.</strong>Artwork, color matching,
              geometry, and exports stay on this device. Your last project is
              saved in this browser; download a project copy to keep it
              elsewhere.
            </p>
          </div>
          <button
            className="button primary full"
            onClick={() => setDialog(null)}
          >
            Let’s make something
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {dialog === "export" && (
        <Modal
          title="Ready to leave the screen?"
          onClose={() => setDialog(null)}
        >
          <p className="modal-lead">
            Choose how you’d like to take your coaster with you.
          </p>
          <div className="export-options">
            <button onClick={() => exportFile("3mf")} disabled={exporting}>
              <span className="export-format orange">3MF</span>
              <span>
                <strong>
                  Colored 3D model <b>RECOMMENDED</b>
                </strong>
                <small>
                  Separate color parts, Bambu filament slots, real magnet
                  pockets.
                </small>
              </span>
              <Download size={18} />
            </button>
            <button
              onClick={() => {
                setBambuReady(false);
                setDialog("bambu");
              }}
            >
              <span className="export-format green">B</span>
              <span>
                <strong>Bambu Studio</strong>
                <small>Save your colored 3MF and launch your slicer.</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
            <button onClick={() => exportFile("svg")}>
              <span className="export-format">SVG</span>
              <span>
                <strong>Color-matched vector artwork</strong>
                <small>Centered at actual size, clipped to your coaster.</small>
              </span>
              <Download size={18} />
            </button>
            <button onClick={() => exportFile("stl")}>
              <span className="export-format">STL</span>
              <span>
                <strong>Geometry only</strong>
                <small>
                  All parts, without color information. Use 3MF for multicolor
                  printing.
                </small>
              </span>
              <Download size={18} />
            </button>
            <button onClick={saveProject}>
              <span className="export-format">
                <FileJson size={22} />
              </span>
              <span>
                <strong>Editable CoasterGen project</strong>
                <small>
                  Your settings, colors, and original image. Pick up where you
                  left off.
                </small>
              </span>
              <Download size={18} />
            </button>
          </div>
          <div className="export-summary">
            <span>
              {p.diameter} × {p.thickness} mm
            </span>
            <i />
            <span>{usedColors} colors</span>
            <i />
            <span>{magnetCenters(p).length} magnet pockets</span>
          </div>
          <p className="modal-fine">
            The 3MF contains geometry and colors, not G-code. Choose your
            printer, material, layer height, and AMS mapping in your slicer.
            Fine image details may be smaller than your nozzle.
          </p>
        </Modal>
      )}
      {dialog === "bambu" && (
        <Modal
          title={
            bambuReady
              ? "Your coaster is ready for Studio."
              : "Meet your next print."
          }
          onClose={() => setDialog(null)}
        >
          <div className="bambu-hero">
            <span className="bambu-glyph large">B</span>
            <span className="connection-dots">······</span>
            <Layers3 size={42} />
          </div>
          <p className="modal-lead">A colored 3MF, ready for Bambu Studio.</p>
          <ol className="bambu-steps">
            <li>
              <span>1</span>
              <p>
                <strong>Download & launch.</strong>Save the 3MF and allow your
                browser to open Bambu Studio.
              </p>
            </li>
            <li>
              <span>2</span>
              <p>
                <strong>Open the downloaded file.</strong>Drag{" "}
                <b>{filename(p)}.3mf</b> into Studio, or use File → Open
                Project. Keep it as one multipart object.
              </p>
            </li>
            <li>
              <span>3</span>
              <p>
                <strong>Match your filaments.</strong>Choose your printer and
                map the colored slots to your AMS. Slice when you’re happy with
                the preview.
              </p>
            </li>
          </ol>
          <div className="soft-note">
            <LockKeyhole size={17} />
            <p>
              To keep your artwork private, the file stays on your device.
              Browsers can’t pass a local file directly into Studio.
            </p>
          </div>
          <button
            className="button bambu full large-button"
            disabled={exporting}
            onClick={() => exportFile("3mf", true)}
          >
            {bambuReady ? <RotateCcw size={17} /> : <Download size={17} />}{" "}
            {bambuReady
              ? "Download & launch again"
              : "Download & launch Studio"}
            <ArrowUpRight size={15} />
          </button>
          <button
            className="inline-link centered"
            onClick={() => exportFile("3mf")}
          >
            Just download the colored 3MF
            <Download size={13} />
          </button>
          <p className="modal-fine">
            Requires Bambu Studio installed. If your browser doesn’t launch it,
            open Studio manually and import the downloaded 3MF.
          </p>
        </Modal>
      )}
      {dialog === "new" && (
        <Modal title="A fresh little start?" onClose={() => setDialog(null)}>
          <p className="modal-lead">
            Reset the coaster to Golden hour with its original size, colors, and
            artwork. Save a project copy first if you’d like to keep this
            version.
          </p>
          <div className="modal-actions">
            <button className="button light" onClick={saveProject}>
              <Save size={16} />
              Save a copy
            </button>
            <button
              className="button primary"
              onClick={() => {
                autoPalette.current = true;
                restorePalette.current = false;
                change({ ...DEFAULT_PROJECT, colors: [...DEFAULT_COLORS] });
                setRecolor((v) => v + 1);
                setDialog(null);
                setBottom(false);
                setZoom(1);
                notify("Fresh start. You can undo this reset.");
              }}
            >
              <RotateCcw size={16} />
              Reset coaster
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
