import { useEffect, useRef, useState } from "react";
import { Bookmark, Download, RotateCcw, Upload } from "lucide-react";
import { MakerHeader } from "./MakerGen";
import ModelViewer from "./components/ModelViewer";
import PartsPreview from "./components/PartsPreview";
import ImportDialog from "./components/ImportDialog";
import GenerationStatus from "./components/GenerationStatus";
import { BambuLogo } from "./components/BrandIcons";
import { download, readArtwork } from "./lib/image";
import { BASE_URL, CREDIT, type BookmarkDesign } from "./lib/bookmark";
import { DEFAULT_PROJECT, type ModelData } from "./types";
const initial: BookmarkDesign = {
  colors: ["#eee8d5", "#164e40", "#e9ae45", "#252b29"],
  auto: true,
  remove: false,
  smooth: true,
  size: 90,
  rotation: 0,
};
export default function BookmarkGen() {
  const [design, setDesign] = useState(initial),
    [colors, setColors] = useState(initial.colors),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState("Loading your bookmark…"),
    [error, setError] = useState(""),
    [model, setModel] = useState<ModelData | null>(null),
    [fallback, setFallback] = useState(false),
    [reset, setReset] = useState(0),
    [editing, setEditing] = useState<{ source: string; name: string } | null>(
      null,
    ),
    [source, setSource] = useState(""),
    [panel, setPanel] = useState<"studio" | "maker" | null>(null),
    [copied, setCopied] = useState(false);
  const worker = useRef<Worker | null>(null),
    seq = useRef(0),
    revision = useRef(0),
    pending = useRef(
      new Map<
        number,
        { resolve: (v: any) => void; reject: (e: Error) => void }
      >(),
    ),
    handoff = useRef<HTMLElement>(null);
  const call = (type: string, payload: object) =>
    new Promise<any>((resolve, reject) => {
      const id = ++seq.current;
      pending.current.set(id, { resolve, reject });
      worker.current!.postMessage({ id, type, ...payload });
    });
  useEffect(() => {
    const w = new Worker(new URL("./bookmark.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      const p = pending.current.get(data.id);
      pending.current.delete(data.id);
      data.error ? p?.reject(Error(data.error)) : p?.resolve(data);
    };
    w.onerror = () => {
      for (const p of pending.current.values())
        p.reject(Error("The bookmark engine stopped. Reload to try again."));
      pending.current.clear();
    };
    const controller = new AbortController();
    fetch("/bookmark-base.3mf", { signal: controller.signal })
      .then((r) => {
        if (!r.ok)
          throw Error(
            "Could not load the included bookmark. Reload to try again.",
          );
        return r.arrayBuffer();
      })
      .then((bytes) => call("load", { bytes: new Uint8Array(bytes) }))
      .then(() => {
        if (!controller.signal.aborted) setReady(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy("");
      });
    return () => {
      controller.abort();
      w.terminate();
      for (const p of pending.current.values()) p.reject(Error("Closed"));
      pending.current.clear();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const id = ++revision.current;
    setBusy("Coloring your bookmark…");
    const timer = setTimeout(
      () =>
        call("paint", { design, revision: id })
          .then((r) => {
            if (id === revision.current) {
              setModel(r.model);
              setColors(r.colors);
              setError("");
            }
          })
          .catch((e) => {
            if (id === revision.current) setError(e.message);
          })
          .finally(() => {
            if (id === revision.current) setBusy("");
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      revision.current++;
    };
  }, [design, ready]);
  useEffect(() => {
    if (panel)
      handoff.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [panel]);
  const patch = (p: Partial<BookmarkDesign>) =>
    setDesign((d) => ({ ...d, ...p }));
  async function upload(file: File) {
    setError("");
    try {
      setEditing({ source: await readArtwork(file), name: file.name });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(launch = false) {
    setBusy("Preparing your 3MF…");
    setError("");
    try {
      const r = await call("export", {
        revision: revision.current,
      });
      download(r.bytes, "BookmarkGen.3mf", "model/3mf");
      if (launch) {
        const a = document.createElement("a");
        a.href = "bambustudio://";
        a.click();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const project = { ...DEFAULT_PROJECT, colors, diameter: 132.3, thickness: 1 };
  return (
    <>
      <GenerationStatus active={!!busy} message={busy} />
      <MakerHeader tool="BookmarkGen" />
      {editing && (
        <ImportDialog
          context="bookmark"
          source={editing.source}
          name={editing.name}
          project={{
            ...DEFAULT_PROJECT,
            source: editing.source,
            colors: design.colors,
            colorCount: design.colors.length,
            removeBackground: true,
            detail: 1024,
            smoothEdges: true,
            preserveDetails: false,
          }}
          onClose={() => setEditing(null)}
          onApply={(p, art) => {
            const canvas = document.createElement("canvas");
            canvas.width = art.width;
            canvas.height = art.height;
            const ctx = canvas.getContext("2d")!;
            const draw = (loops: number[][][], color: string) => {
              ctx.beginPath();
              for (const loop of loops) {
                loop.forEach(([x, y], i) =>
                  i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
                );
                ctx.closePath();
              }
              ctx.fillStyle = color;
              ctx.fill("evenodd");
            };
            art.loops.forEach((loops, i) =>
              draw(loops, p.colors[p.mapping[i] ?? i]),
            );
            art.paintLoops?.forEach((loops, i) => draw(loops, p.colors[i]));
            setSource(canvas.toDataURL("image/png"));
            patch({
              image: {
                width: canvas.width,
                height: canvas.height,
                data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
              },
              colors: p.colors,
              auto: false,
              remove: false,
              smooth: p.smoothEdges,
              size: 90,
              rotation: 0,
            });
            setEditing(null);
          }}
        />
      )}
      <main className="hoodie-main bookmark-main">
        <div className="hoodie-heading">
          <span className="maker-eyebrow">
            A LITTLE ART. A GOOD PLACE TO STOP.
          </span>
          <h1>Make your mark.</h1>
          <p>
            Your image, centered on a bookmark. Match your filaments, make it
            yours, and pick up where you left off.
          </p>
        </div>
        <div className="hoodie-layout">
          <section className="hoodie-preview">
            <div className="hoodie-preview-top">
              <span>
                <Bookmark size={18} /> Your bookmark
              </span>
              <button
                className="button secondary"
                onClick={() => setReset((v) => v + 1)}
              >
                <RotateCcw size={15} /> Reset view
              </button>
            </div>
            <div className="hoodie-view">
              {model ? (
                fallback ? (
                  <PartsPreview model={model} project={project} detail />
                ) : (
                  <ModelViewer
                    model={model}
                    project={project}
                    bottom={false}
                    zoom={1.45}
                    reset={reset}
                    onFailure={() => setFallback(true)}
                    label="Interactive 3D bookmark preview. Artwork is centered on the top circle."
                  />
                )
              ) : (
                <div className="hoodie-empty">
                  <img
                    src="/bookmark-render.webp"
                    alt="Rendered bookmark"
                    style={{ maxHeight: 280, maxWidth: "100%" }}
                  />
                  <h2>
                    {error ? "Bookmark unavailable" : "Opening your bookmark…"}
                  </h2>
                </div>
              )}
            </div>
            <p className="hoodie-caption">
              Drag to turn · Scroll to zoom · 132.3 × 35.9 × 1 mm
            </p>
            <div className="bookmark-note">
              <Bookmark size={19} />
              <span>
                <strong>One circle. Endless possibilities.</strong>
                <br />
                Art stays centered on the top face, with a clean rim around the
                circle. The slim stem stays smooth.
              </span>
            </div>
            {busy && <p role="status">{busy}</p>}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
          <aside className="hoodie-controls">
            <section>
              <h2>
                <b>1</b> Add your artwork
              </h2>
              <p>
                {ready
                  ? "Original bookmark loaded · Ready to design"
                  : "Loading the included bookmark…"}
              </p>
              <label className="hoodie-upload">
                <Upload size={18} />
                {design.image ? "Replace image" : "Upload image"}
                <input
                  aria-label="Bookmark artwork"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => {
                  const rays = Array.from(
                    { length: 12 },
                    (_, i) =>
                      `<path d="M60 23 L64 5 L68 23 Z" transform="rotate(${i * 30} 64 64)"/>`,
                  ).join("");
                  void upload(
                    new File(
                      [
                        `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g fill="#164e40"><circle cx="64" cy="64" r="28"/>${rays}</g></svg>`,
                      ],
                      "Sunburst.svg",
                      { type: "image/svg+xml" },
                    ),
                  );
                }}
              >
                Try a sample sunburst
              </button>
              <small>
                PNG, JPG, WebP or SVG. Crop, clean up, and map image colors to
                your filaments. Your artwork stays on this device.
              </small>
              {design.image && (
                <>
                  <img
                    className="hoodie-art"
                    src={source}
                    alt="Bookmark artwork"
                  />
                  <label className="hoodie-range">
                    Artwork size <span>{design.size}%</span>
                    <input
                      aria-label="Artwork size"
                      type="range"
                      min="25"
                      max="150"
                      value={design.size}
                      onChange={(e) => patch({ size: +e.target.value })}
                    />
                  </label>
                  <small>
                    100% fits the full image inside the circle. Enlarge to fill
                    more of it; anything outside the rim is cropped.
                  </small>
                  <label className="hoodie-range">
                    Rotation <span>{design.rotation}°</span>
                    <input
                      aria-label="Artwork rotation"
                      type="range"
                      min="-180"
                      max="180"
                      value={design.rotation}
                      onChange={(e) => patch({ rotation: +e.target.value })}
                    />
                  </label>
                  <div className="hoodie-tabs">
                    <button
                      className="button secondary"
                      onClick={() => patch({ size: 90, rotation: 0 })}
                    >
                      Center & fit
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => {
                        patch({ image: undefined });
                        setSource("");
                      }}
                    >
                      Remove image
                    </button>
                  </div>
                </>
              )}
            </section>
            <section>
              <h2>
                <b>2</b> Choose your colors
              </h2>
              <label className="hoodie-range">
                Filament colors
                <select
                  aria-label="Number of filament colors"
                  value={design.colors.length}
                  onChange={(e) =>
                    patch({
                      colors: Array.from(
                        { length: +e.target.value },
                        (_, i) => colors[i] ?? initial.colors[i] ?? "#ffffff",
                      ),
                      auto: true,
                    })
                  }
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="hoodie-swatches">
                {colors.map((c, i) => (
                  <label key={i}>
                    <input
                      type="color"
                      aria-label={
                        i === 0 ? "Bookmark base color" : `Filament ${i + 1}`
                      }
                      value={c}
                      onChange={(e) => {
                        const next = [...colors];
                        next[i] = e.target.value;
                        patch({ colors: next, auto: false });
                      }}
                    />
                    <small>{i === 0 ? "Base" : i + 1}</small>
                  </label>
                ))}
              </div>
              <button
                className="text-button"
                onClick={() => patch({ auto: true })}
              >
                Match colors from artwork again
              </button>
              <small>
                The base counts as one filament. Colors are painted onto the
                original surface, with fine mesh detail around your artwork.
              </small>
            </section>
            <section>
              <h2>
                <b>3</b> Turn the page
              </h2>
              <button
                className="button primary"
                disabled={!model || !!busy || !!error}
                onClick={() => void save()}
              >
                <Download size={18} /> Download 3MF
              </button>
              <div className="hoodie-export">
                <button
                  className="button secondary"
                  disabled={!model || !!busy || !!error}
                  onClick={() => setPanel("studio")}
                >
                  <BambuLogo /> Open in Bambu Studio
                </button>
                <button
                  className="button secondary"
                  disabled={!model || !!busy || !!error}
                  onClick={() => setPanel("maker")}
                >
                  <img src="/makerworld.svg" alt="" width="20" height="20" />{" "}
                  Export to MakerWorld
                </button>
              </div>
              <small>
                Original shape, thickness, and credits included. Choose your
                printer and check the sliced color layers before printing.
              </small>
            </section>
          </aside>
        </div>
        {panel && (
          <section className="hoodie-handoff" ref={handoff}>
            <button className="button secondary" onClick={() => setPanel(null)}>
              Close
            </button>
            <h2>
              {panel === "studio"
                ? "Open your bookmark in Bambu Studio"
                : "Share your bookmark on MakerWorld"}
            </h2>
            <p>
              {panel === "studio"
                ? "Download and launch Studio, then choose File → Open Project and select BookmarkGen.3mf. Select your printer, assign filaments, and slice again."
                : "Download your 3MF, copy the credit into your description, and open MakerWorld to upload your design."}
            </p>
            <textarea aria-label="Model credit" readOnly value={CREDIT} />
            <button
              className="button secondary"
              onClick={() =>
                navigator.clipboard
                  .writeText(CREDIT)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError("Select and copy the credit text above."),
                  )
              }
            >
              {copied ? "Credit copied" : "Copy credit"}
            </button>
            <button
              className="button primary"
              disabled={!!busy || !!error}
              onClick={() => void save(panel === "studio")}
            >
              {panel === "studio" ? "Download & launch Studio" : "Download 3MF"}
            </button>
            {panel === "maker" && (
              <a
                className="button secondary"
                href="https://makerworld.com/en/my/models/publish?type=original"
                target="_blank"
                rel="noreferrer"
              >
                Open MakerWorld ↗
              </a>
            )}
          </section>
        )}
        <footer className="hoodie-credit">
          Made with BookmarkGen on MakerGen · Original:{" "}
          <a href={BASE_URL} target="_blank" rel="noreferrer">
            Blank Bookmark Kit by Tekwiz17 ↗
          </a>{" "}
          · CC0
        </footer>
      </main>
    </>
  );
}
