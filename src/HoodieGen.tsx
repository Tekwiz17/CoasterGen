import { useEffect, useRef, useState } from "react";
import { Download, Shirt, Upload, RotateCcw } from "lucide-react";
import { MakerHeader } from "./MakerGen";
import { BambuLogo } from "./components/BrandIcons";
import ModelViewer from "./components/ModelViewer";
import PartsPreview from "./components/PartsPreview";
import { download, loadPixels, readArtwork } from "./lib/image";
import { BASE_URL, CREDIT, type Design } from "./lib/hoodie";
import { DEFAULT_PROJECT, type ModelData } from "./types";
const initial: Design = {
  mode: "image",
  frontPlace: { width: 40, x: 0, z: 52 },
  backPlace: { width: 40, x: 0, z: 52 },
  colors: ["#e4e8dc", "#143e31", "#eabb57", "#202521"],
  auto: true,
  remove: true,
  smooth: true,
};
function template() {
  const names = ["FRONT", "RIGHT SLEEVE", "BACK", "LEFT SLEEVE"];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024" viewBox="0 0 2048 1024"><title>HoodieGen surface map. Keep canvas size and panel positions. Remove guides before uploading.</title><rect width="2048" height="1024" fill="#e4e8dc"/><g id="guides" fill="none" stroke="#476459" stroke-dasharray="8 8">${names.map((_, i) => `<rect x="${i * 512}" y="0" width="512" height="1024"/>`).join("")}</g><g id="labels" fill="#476459" font-family="sans-serif" font-size="28">${names.map((n, i) => `<text x="${i * 512 + 30}" y="55">${n}</text>`).join("")}<text x="30" y="990">TOP = hood / shoulders · BOTTOM = hem · Remove guides and labels before upload</text></g></svg>`;
}
export default function HoodieGen() {
  const [d, setD] = useState<Design>(initial),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [model, setModel] = useState<ModelData | null>(null),
    [colors, setColors] = useState(d.colors),
    [fallback, setFallback] = useState(false),
    [side, setSide] = useState<"front" | "back">("front"),
    [reset, setReset] = useState(0),
    [exportPanel, setExportPanel] = useState<"studio" | "maker" | null>(null),
    [copied, setCopied] = useState(false),
    [sources, setSources] = useState<Record<string, string>>({});
  const worker = useRef<Worker | null>(null),
    pending = useRef(
      new Map<
        number,
        { resolve: (v: any) => void; reject: (e: Error) => void }
      >(),
    ),
    seq = useRef(0),
    revision = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL("./hoodie.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = ({ data }) => {
      const p = pending.current.get(data.id);
      pending.current.delete(data.id);
      if (data.error) p?.reject(Error(data.error));
      else p?.resolve(data);
    };
    w.onerror = () => {
      for (const p of pending.current.values())
        p.reject(
          Error("The hoodie engine stopped. Reload the page and try again."),
        );
      pending.current.clear();
    };
    return () => {
      w.terminate();
      for (const p of pending.current.values()) p.reject(Error("Closed"));
      pending.current.clear();
    };
  }, []);
  const call = (type: string, payload: object) =>
    new Promise<any>((resolve, reject) => {
      const id = ++seq.current;
      pending.current.set(id, { resolve, reject });
      worker.current!.postMessage({ id, type, ...payload });
    });
  useEffect(() => {
    if (!ready) return;
    const id = ++revision.current;
    setBusy("Updating preview…");
    const timer = setTimeout(() => {
      call("paint", { design: d })
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
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [d, ready]);
  async function base(file: File) {
    setBusy("Reading the hoodie…");
    setError("");
    try {
      if (file.size > 40e6) throw Error("Choose a 3MF under 40 MB.");
      setReady(false);
      setModel(null);
      await call("load", { bytes: new Uint8Array(await file.arrayBuffer()) });
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function artwork(file: File, key: "front" | "back" | "map") {
    setBusy("Matching artwork…");
    setError("");
    try {
      const source = await readArtwork(file),
        r = await loadPixels(source, key === "map" ? 1536 : 1024);
      if (key === "map" && Math.abs(r.width / r.height - 2) > 0.02)
        throw Error(
          "Keep the map canvas at 2:1, like the downloaded template.",
        );
      setSources((s) => ({ ...s, [key]: source }));
      setD((v) => ({ ...v, [key]: r, auto: true }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function save(launch = false) {
    setBusy("Preparing your 3MF…");
    setError("");
    try {
      const r = await call("export", { design: { ...d, auto: false, colors } });
      download(r.bytes, "HoodieGen.3mf", "model/3mf");
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
  const handoff = useRef<HTMLElement>(null);
  useEffect(() => {
    if (exportPanel)
      handoff.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [exportPanel]);
  const patch = (p: Partial<Design>) => setD((v) => ({ ...v, ...p }));
  const place = side === "front" ? "frontPlace" : "backPlace";
  return (
    <>
      <MakerHeader tool="HoodieGen" />
      <main className="hoodie-main">
        <div className="hoodie-heading">
          <span className="maker-eyebrow">YOUR NEXT DESK COMPANION</span>
          <h1>A hoodie. Your style.</h1>
          <p>
            Turn artwork into a multicolor Hoodie Pen Pot. Design here, print in
            your slicer.
          </p>
        </div>
        <div className="hoodie-layout">
          <section className="hoodie-preview">
            <div className="hoodie-preview-top">
              <span>
                <Shirt size={18} /> Your hoodie
              </span>
              <button
                className="secondary"
                onClick={() => setReset((v) => v + 1)}
              >
                <RotateCcw size={15} /> Reset view
              </button>
            </div>
            <div className="hoodie-view">
              {model ? (
                fallback ? (
                  <PartsPreview
                    model={model}
                    project={{
                      ...DEFAULT_PROJECT,
                      colors,
                      diameter: 125,
                      thickness: 106,
                    }}
                    detail
                  />
                ) : (
                  <ModelViewer
                    model={model}
                    project={{
                      ...DEFAULT_PROJECT,
                      colors,
                      diameter: 125,
                      thickness: 106,
                    }}
                    label="Interactive 3D hoodie preview. Drag to turn; scroll to zoom."
                    azimuth={
                      d.mode === "image" && side === "back" ? Math.PI : 0
                    }
                    bottom={false}
                    zoom={1.3}
                    reset={reset}
                    onFailure={() => setFallback(true)}
                  />
                )
              ) : (
                <div className="hoodie-empty">
                  <Shirt size={72} />
                  <h2>Start with the original hoodie</h2>
                  <p>
                    Download Morganja’s Hoodie Pen Pot, then load its 3MF here.
                    Your model stays on your device.
                  </p>
                  <a
                    href={BASE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary"
                  >
                    Get the base model ↗
                  </a>
                </div>
              )}
            </div>
            <p className="hoodie-caption">
              Drag to turn · Scroll to zoom · Color is printed on the existing
              surface
            </p>
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
                <b>1</b> Load the hoodie
              </h2>
              <label className="hoodie-upload">
                <Upload size={18} />
                {ready ? "Replace base 3MF" : "Choose base 3MF"}
                <input
                  aria-label="Base hoodie 3MF"
                  type="file"
                  accept=".3mf"
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void base(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <small>
                Use the original{" "}
                <a href={BASE_URL} target="_blank" rel="noreferrer">
                  Hoodie Pen Pot by Morganja ↗
                </a>
                . Its license applies to your creation.
              </small>
            </section>
            <section>
              <h2>
                <b>2</b> Make it yours
              </h2>
              <div className="hoodie-modes">
                {(["image", "map"] as const).map((m) => (
                  <button
                    className={d.mode === m ? "active" : ""}
                    onClick={() => patch({ mode: m })}
                    key={m}
                  >
                    <strong>{m === "image" ? "Image" : "Surface map"}</strong>
                    <small>
                      {m === "image"
                        ? "Simple · front & back"
                        : "Advanced · all around"}
                    </small>
                  </button>
                ))}
              </div>
              {d.mode === "map" ? (
                <>
                  <p>
                    Paint across front, back, sleeves, and hood using a
                    wraparound map. Keep the canvas size and panel positions.
                  </p>
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        template(),
                        "HoodieGen-map-template.svg",
                        "image/svg+xml",
                      )
                    }
                  >
                    <Download size={16} /> Download map template
                  </button>
                  <details>
                    <summary>How the map works</summary>
                    <p>
                      Open the SVG in your editor, or give it to your image AI
                      as a layout reference. Keep the 2048 × 1024 canvas. Remove
                      labels and dashed guides before uploading. Front and back
                      occupy alternate panels; sleeve panels connect them. Top
                      reaches the hood; bottom reaches the hem. It is a
                      cylindrical wrap, so folds and panel boundaries can
                      stretch artwork. Check every side in the preview.
                    </p>
                  </details>
                  <label className="hoodie-upload">
                    Upload finished map
                    <input
                      aria-label="Surface map image"
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.svg"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void artwork(f, "map");
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {sources.map && (
                    <img
                      className="hoodie-art"
                      src={sources.map}
                      alt="Uploaded surface map"
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="hoodie-tabs">
                    {(["front", "back"] as const).map((s) => (
                      <button
                        key={s}
                        aria-pressed={side === s}
                        className={s === side ? "active" : ""}
                        onClick={() => setSide(s)}
                      >
                        {s === "front" ? "Front" : "Back"}
                        {d[s] ? " •" : ""}
                      </button>
                    ))}
                  </div>
                  <label className="hoodie-upload">
                    Upload {side} image
                    <input
                      aria-label={`${side} artwork`}
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.svg"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void artwork(f, side);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {d[side] && (
                    <>
                      <img
                        className="hoodie-art"
                        src={sources[side]}
                        alt={`${side} artwork`}
                      />
                      {(
                        [
                          ["width", "Width", 8, 65],
                          ["x", "Left / right", -25, 25],
                          ["z", "Height from base", 12, 90],
                        ] as const
                      ).map(([key, label, min, max]) => (
                        <label className="hoodie-range" key={key}>
                          {label}
                          <span>{d[place][key]} mm</span>
                          <input
                            aria-label={label}
                            type="range"
                            min={min}
                            max={max}
                            value={d[place][key]}
                            onChange={(e) =>
                              patch({
                                [place]: {
                                  ...d[place],
                                  [key]: +e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                      <div className="hoodie-tabs">
                        <button
                          className="secondary"
                          onClick={() =>
                            patch({ [place]: { ...d[place], x: 0, z: 52 } })
                          }
                        >
                          Center image
                        </button>
                        <button
                          className="secondary"
                          onClick={() => {
                            patch({ [side]: undefined });
                            setSources((v) => ({ ...v, [side]: "" }));
                          }}
                        >
                          Remove image
                        </button>
                      </div>
                    </>
                  )}
                  <label className="hoodie-check">
                    <input
                      type="checkbox"
                      checked={d.remove}
                      onChange={(e) => patch({ remove: e.target.checked })}
                    />{" "}
                    Remove edge background
                  </label>
                </>
              )}
              <label className="hoodie-range">
                Filament colors{" "}
                <select
                  aria-label="Number of filament colors"
                  value={d.colors.length}
                  onChange={(e) => {
                    const n = +e.target.value;
                    patch({
                      colors: Array.from(
                        { length: n },
                        (_, i) => colors[i] ?? initial.colors[i] ?? "#ffffff",
                      ),
                      auto: true,
                    });
                  }}
                >
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="hoodie-swatches">
                {colors.slice(0, d.colors.length).map((c, i) => (
                  <label key={i}>
                    <input
                      type="color"
                      aria-label={
                        i === 0 ? "Hoodie base color" : `Filament ${i + 1}`
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
                Shared palette for both sides. Change a swatch to choose the
                filament you own. Fine details follow the original mesh
                resolution.
              </small>
            </section>
            <section>
              <h2>
                <b>3</b> Ready to print
              </h2>
              <button
                className="primary"
                disabled={!model || !!busy || !!error}
                onClick={() => void save()}
              >
                <Download size={18} /> Download 3MF
              </button>
              <div className="hoodie-export">
                <button
                  className="secondary"
                  disabled={!model || !!busy || !!error}
                  onClick={() => setExportPanel("studio")}
                >
                  <BambuLogo /> Open in Bambu Studio
                </button>
                <button
                  className="secondary"
                  disabled={!model || !!busy || !!error}
                  onClick={() => setExportPanel("maker")}
                >
                  <img src="/makerworld.svg" alt="" width="20" height="20" />{" "}
                  Export to MakerWorld
                </button>
              </div>
              <small>
                Original geometry and model credits are preserved. Slice the
                project again before printing.
              </small>
            </section>
          </aside>
        </div>
        {exportPanel && (
          <section className="hoodie-handoff" ref={handoff}>
            <button className="secondary" onClick={() => setExportPanel(null)}>
              Close
            </button>
            <h2>
              {exportPanel === "studio"
                ? "Open your hoodie in Bambu Studio"
                : "Share your hoodie on MakerWorld"}
            </h2>
            <p>
              {exportPanel === "studio"
                ? "Download the project and launch Studio, then choose File → Open Project and select HoodieGen.3mf. Choose your printer and check filament assignments before slicing."
                : "Download your 3MF, copy the credit below into your model description, and open MakerWorld to upload. Check the original model’s license before sharing a remix."}
            </p>
            <textarea
              aria-label="Required model credit"
              readOnly
              value={CREDIT}
            />
            <button
              className="secondary"
              onClick={() => {
                navigator.clipboard
                  .writeText(CREDIT)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError("Select and copy the credit text above."),
                  );
              }}
            >
              {copied ? "Credit copied" : "Copy credit"}
            </button>
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => void save(exportPanel === "studio")}
            >
              {exportPanel === "studio"
                ? "Download & launch Studio"
                : "Download 3MF"}
            </button>
            {exportPanel === "maker" && (
              <a
                href="https://makerworld.com/en/my/models/publish?type=original"
                target="_blank"
                rel="noreferrer"
                className="secondary"
              >
                Open MakerWorld ↗
              </a>
            )}
          </section>
        )}
        <footer className="hoodie-credit">
          Made with HoodieGen on MakerGen · Base model:{" "}
          <a href={BASE_URL} target="_blank" rel="noreferrer">
            Hoodie Pen Pot by Morganja ↗
          </a>
        </footer>
      </main>
    </>
  );
}
