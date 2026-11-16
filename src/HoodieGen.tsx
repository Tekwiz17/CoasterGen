import ImportDialog from "./components/ImportDialog";
import type { Project, Artwork } from "./types";
import { panels, mapTemplate } from "./lib/hoodiemap";
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
export default function HoodieGen() {
  const [editing, setEditing] = useState<{source:string;name:string;key:"front"|"back"|"map"} | null>(null);
  const [colorLimit, setColorLimit] = useState(4);
  const [idea, setIdea] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const aiPrompt = `Edit the uploaded HoodieGen PNG template into this design: ${idea || "[describe your hoodie]"}. Use at most ${colorLimit} flat solid colors, including the garment base. Keep the exact 2048 × 1024 canvas and every piece position, outline, and size. Fill every garment piece completely, including sleeves and hood. Keep the space outside pieces transparent. No shadows, gradients, texture, labels, guides, mockup, or 3D perspective. Keep logos and text centered away from seams. Return only the finished flat template PNG.`;
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
    const controller = new AbortController();
    setBusy("Loading your hoodie…");
    fetch("/hoodie-base.3mf", { signal: controller.signal })
      .then((r) => {
        if (!r.ok)
          throw Error(
            "Could not download the default hoodie. Try loading a base 3MF below.",
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
      if(key==="map") {
        const counts=new Map<string,number>();
        for(let i=0;i<r.width*r.height;i++){const x=(i%r.width)/r.width*2048,y=Math.floor(i/r.width)/r.height*1024;
          if(r.data[i*4+3]<128 || !panels.some(p=>x>p.x+p.w*.27&&x<p.x+p.w*.73&&y>p.y+p.h*.12&&y<p.y+p.h*.95))continue;
          const c="#"+Array.from(r.data.slice(i*4,i*4+3)).map(v=>v.toString(16).padStart(2,"0")).join("");counts.set(c,(counts.get(c)||0)+1);
        }
        const dominant=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];
        if(dominant)setD(v=>({...v,colors:[dominant,...v.colors.slice(1)]}));
      }
      setEditing({source, name:file.name, key});
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
      {editing && <ImportDialog context="hoodie" source={editing.source} name={editing.name}
        project={{...DEFAULT_PROJECT, source:editing.source, colors:d.colors, colorCount:d.colors.length, removeBackground:true, detail:1024, smoothEdges:true, preserveDetails:false}}
        onClose={()=>setEditing(null)}
        onApply={(p:Project, art:Artwork)=>{
          if(editing.key==="map" && Math.abs(art.width/art.height-2)>0.02){setError("Surface maps must keep the 2:1 canvas. Reset the crop before applying.");return;}
          const canvas=document.createElement("canvas");canvas.width=art.width;canvas.height=art.height;
          const ctx=canvas.getContext("2d")!;
          const draw=(loops:number[][][],color:string)=>{ctx.beginPath();for(const loop of loops){loop.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}ctx.fillStyle=color;ctx.fill("evenodd");};
          art.loops.forEach((loops,i)=>draw(loops,p.colors[p.mapping[i]??i]));
          art.paintLoops?.forEach((loops,i)=>draw(loops,p.colors[i]));
          const source=canvas.toDataURL("image/png");
          setSources(v=>({...v,[editing.key]:source}));
          setD(v=>({...v,[editing.key]:{width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data},colors:p.colors,auto:editing.key==="map",remove:false,smooth:p.smoothEdges}));
          setEditing(null);
        }} />}

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
                className="button secondary"
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
                  <ModelViewer smoothSurface frontView
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
                  <h2>{busy ? "Loading your hoodie…" : "Load the hoodie"}</h2>
                  <p>
                    The original hoodie loads automatically. You can also choose
                    its 3MF below. Your artwork stays on your device.
                  </p>
                  <a
                    href={BASE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="button secondary"
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
                <b>1</b> Your hoodie
              </h2>
              {ready && (
                <p role="status">Original hoodie loaded · Ready to design</p>
              )}
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
                    flattened sweatshirt map with detached sleeves and separate
                    hood panels. Keep the canvas size and piece positions.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() =>
                      download(
                        mapTemplate(),
                        "HoodieGen-map-template.svg",
                        "image/svg+xml",
                      )
                    }
                  >
                    <Download size={16} /> Download map template
                  </button>
                  <img
                    className="hoodie-art"
                    src={
                      "data:image/svg+xml;charset=utf-8," +
                      encodeURIComponent(mapTemplate())
                    }
                    alt="Flattened hoodie map: front, back, detached sleeves and hood panels"
                  />
                  <button
                    className="text-button"
                    onClick={() =>
                      download(
                        mapTemplate(false),
                        "HoodieGen-map-blank.svg",
                        "image/svg+xml",
                      )
                    }
                  >
                    Download blank map without guides
                  </button>
                  <button className="button secondary" onClick={async () => {
                    try {
                      const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(mapTemplate(false));
                      await img.decode(); const canvas = document.createElement("canvas"); canvas.width = 2048; canvas.height = 1024;
                      canvas.getContext("2d")!.drawImage(img, 0, 0);
                      canvas.toBlob(async blob => { if(blob) download(new Uint8Array(await blob.arrayBuffer()), "HoodieGen-map-blank.png", "image/png"); }, "image/png");
                    } catch { setError("PNG download failed. Please try again."); }
                  }}>Download PNG template</button>
                  <details>
                    <summary>Create with AI</summary>
                    <label className="field">Your design<textarea value={idea} onChange={e => {setIdea(e.target.value);setPromptCopied(false);}} placeholder="Describe the design you want…" /></label>
                    <label className="field">Maximum colors<input type="number" min="2" max="8" value={colorLimit} onChange={e => {setColorLimit(Math.max(2,Math.min(8,+e.target.value || 4)));setPromptCopied(false);}} /></label>
                    <p>Download the PNG above, attach it to an image generator, then paste this prompt.</p>
                    <textarea aria-label="AI image prompt" readOnly value={aiPrompt} rows={8}/>
                    <button className="button secondary" onClick={() => navigator.clipboard.writeText(aiPrompt).then(()=>setPromptCopied(true)).catch(()=>setError("Select and copy the prompt above."))}>{promptCopied ? "Copied" : "Copy AI prompt"}</button>
                    <p>Try <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT</a> or <a href="https://gemini.google.com/" target="_blank" rel="noreferrer">Gemini</a>. Free accounts have usage limits.</p>
                  </details>
                  <details>
                    <summary>How the map works</summary>
                    <p>
                      Open the SVG in your editor, or give it to your image AI
                      as a layout reference. Keep the 2048 × 1024 canvas. Remove
                      labels and dashed guides before uploading. The large
                      pieces are the front and back. Tapered pieces are sleeves;
                      the two small rounded pieces cover the hood. Top points
                      toward the shoulders; bottom points toward the hem or
                      cuffs. Check the folds and seams in the 3D preview.
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
                          className="button secondary"
                          onClick={() =>
                            patch({ [place]: { ...d[place], x: 0, z: 52 } })
                          }
                        >
                          Center image
                        </button>
                        <button
                          className="button secondary"
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
              {d.mode==="map" && <div>
                <label className="hoodie-range">Artwork size · {Math.round((d.mapScale??1)*100)}%
                  <input aria-label="Map artwork size" type="range" min="0.5" max="2" step="0.05" value={d.mapScale??1} onChange={e=>patch({mapScale:+e.target.value})}/>
                </label>
                <small>Proportions stay locked. Increase size to fill more of each piece; artwork beyond the seams is cropped. Uncovered areas use the base color.</small>
              </div>}
              <label className="hoodie-check"><input type="checkbox" checked={!!d.betaEdges} onChange={e=>patch({betaEdges:e.target.checked})}/> Smooth color edges (beta)</label>
              <small>Refines the mesh along color boundaries in both preview and 3MF. Takes longer and creates larger files.</small>
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
                  onClick={() => setExportPanel("studio")}
                >
                  <BambuLogo /> Open in Bambu Studio
                </button>
                <button
                  className="button secondary"
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
            <button className="button secondary" onClick={() => setExportPanel(null)}>
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
              className="button secondary"
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
              className="button primary"
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
                className="button secondary"
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
