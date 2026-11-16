import Modal from "./components/Modal";
import { BambuLogo } from "./components/BrandIcons";
import { splitPreview } from "./lib/splitpreview";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import PartsPreview from "./components/PartsPreview";
import {
  Upload,
  Scissors,
  Download,
  RotateCcw,
  LoaderCircle,
  ArrowLeft,
} from "lucide-react";
import { MakerHeader } from "./MakerGen";
import { FITS } from "./lib/spitfit";
import { part3mf, safeName, splitBundle } from "./lib/spitexport";
import type { Fit, Grouping, SplitResult } from "./lib/spitgen";
import { DEFAULT_PROJECT, type ModelData } from "./types";
import { download } from "./lib/image";
const ModelViewer = lazy(() => import("./components/ModelViewer"));
export default function SplitGen() {
  const [source, setSource] = useState<{
      bytes?: ArrayBuffer;
      demo?: boolean;
      name: string;
    } | null>(null),
    [fit, setFit] = useState<Fit>("GlueFit"),
    [grouping, setGrouping] = useState<Grouping>("groups"),
    [clearance, setClearance] = useState(0.25),
    [diameter, setDiameter] = useState(3),
    [result, setResult] = useState<SplitResult | null>(null),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [explode, setExplode] = useState(0),
    [failure, setFailure] = useState(false),
    [reset, setReset] = useState(0),
    [busyExport, setBusyExport] = useState(false);
  const [bambuOpen, setBambuOpen] = useState(false);
  const [bambuReady, setBambuReady] = useState(false);
  const [connections, setConnections] = useState(false);
  const [detail, setDetail] = useState(true);
  const [isolated, setIsolated] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const busy = !!progress;
  useEffect(() => {
    setResult(null);
    setIsolated(-1);
    setExplode(0);
    setConnections(false);
    setFailure(false);
  }, [source]);
  useEffect(() => {
    if (!source) return;
    setError("");
    setProgress("Opening your model…");
    const w = new Worker(new URL("./spit.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      w.terminate();
      setProgress("");
      setError("This model took too long. Try fewer parts or a smaller model.");
    }, 120000);
    w.onmessage = ({ data }) => {
      if (data.progress) setProgress(data.progress);
      else {
        clearTimeout(timer);
        setProgress("");
        if (data.error) {
          setError(data.error);
          setResult(null);
        } else {
          setResult(data.result);
          setIsolated((previous) =>
            previous < data.result.parts.length ? previous : -1,
          );
        }
        w.terminate();
      }
    };
    w.onerror = () => {
      clearTimeout(timer);
      setProgress("");
      setError("The geometry engine could not load. Refresh and try again.");
    };
    w.postMessage({ ...source, fit, grouping, clearance, diameter });
    return () => {
      clearTimeout(timer);
      w.terminate();
    };
  }, [source, fit, grouping, clearance, diameter]);
  async function upload(file?: File) {
    if (!file) return;
    if (!/\.3mf$/i.test(file.name) || file.size > 40 * 1024 * 1024) {
      setError("Choose a .3mf model under 40 MB.");
      return;
    }
    try {
      setSource({
        bytes: await file.arrayBuffer(),
        name: file.name.replace(/\.3mf$/i, ""),
      });
    } catch {
      setError("This file could not be read. Try it again.");
    }
  }
  const preview = useMemo(
    () =>
      result ? splitPreview(result, explode, isolated, connections) : null,
    [result, explode, isolated, connections],
  );
  function save() {
    if (!result || !source) return;
    setBusyExport(true);
    setTimeout(() => {
      try {
        download(
          splitBundle(result, source.name, fit, clearance, diameter),
          safeName(source.name) + "-SplitGen.zip",
          "application/zip",
        );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusyExport(false);
      }
    }, 30);
  }
  function downloadProject(launch = false) {
    if (!result || !source || busy || busyExport || error) return;
    setBusyExport(true);
    setTimeout(() => {
      try {
        download(
          part3mf(result.parts, source.name, true),
          safeName(source.name) + "-SplitGen.3mf",
          "model/3mf",
        );
        if (launch) {
          setBambuReady(true);
          const link = document.createElement("a");
          link.href = "bambustudio://";
          link.click();
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusyExport(false);
      }
    }, 30);
  }
  return (
    <>
      <div inert={bambuOpen}>
        <MakerHeader tool="SplitGen" />
        <main className="spit-page">
          <a className="maker-back" href="#/">
            <ArrowLeft size={14} />
            All tools
          </a>
          <div className="spit-heading">
            <div>
              <span className="maker-eyebrow">
                SPLIT. PRINT. PUT IT TOGETHER.
              </span>
              <h1>
                SplitGen<span>One model. Your pieces.</span>
              </h1>
              <p>
                Separate a 3MF by color and group. Choose how the parts go back
                together.
              </p>
            </div>
            <span className="spit-badge">
              <Scissors size={24} />
            </span>
          </div>
          <div className="spit-workspace">
            <section className="spit-preview panel" aria-label="Model preview">
              <div className="spit-preview-top">
                <strong>{source?.name ?? "Your model goes here"}</strong>
                {source && (
                  <button
                    className="text-button"
                    onClick={() => input.current?.click()}
                    disabled={busy}
                  >
                    Replace
                  </button>
                )}
              </div>
              <input
                ref={input}
                hidden
                type="file"
                accept=".3mf"
                aria-label="Upload 3MF model"
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {!source ? (
                <div
                  className="spit-empty"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void upload(e.dataTransfer.files[0]);
                  }}
                >
                  <div className="empty-pieces" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                  <h2>Give your model some space.</h2>
                  <p>
                    Drop a 3MF with separate solid parts.
                    <br />
                    Color and group information comes along.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => input.current?.click()}
                  >
                    <Upload size={17} />
                    Choose a 3MF
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      setSource({ demo: true, name: "Two-part test block" })
                    }
                  >
                    Try a sample model
                  </button>
                  <small>Up to 40 MB · Processed on your device</small>
                </div>
              ) : busy && !result ? (
                <div className="spit-empty" role="status">
                  <LoaderCircle className="spin" size={28} />
                  <h2>Finding the right split.</h2>
                  <p>{progress}</p>
                  <button
                    className="button light"
                    onClick={() => setSource(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : preview ? (
                <>
                  {busy && (
                    <p className="control-note" role="status">
                      Updating fit… Preview stays in place.
                    </p>
                  )}
                  <div
                    className="connection-view-tools"
                    role="group"
                    aria-label="Preview layout"
                  >
                    <button
                      className="button light small"
                      aria-pressed={!connections}
                      onClick={() => setConnections(false)}
                    >
                      Assembly
                    </button>
                    <button
                      className="button light small"
                      aria-pressed={connections}
                      disabled={!result?.joints?.length}
                      onClick={() => {
                        setConnections(true);
                        setExplode(35);
                        setReset((v) => v + 1);
                      }}
                    >
                      See connections
                    </button>
                    <label>
                      <input
                        type="checkbox"
                        checked={detail}
                        onChange={(e) => setDetail(e.target.checked)}
                      />
                      Surface detail
                    </label>
                  </div>
                  <div className="spit-canvas">
                    {failure ? (
                      <PartsPreview
                        detail={detail}
                        model={preview.model}
                        project={preview.project}
                      />
                    ) : (
                      <Suspense fallback={<p>Loading preview…</p>}>
                        <ModelViewer
                          trueColors
                          detail={detail}
                          model={preview.model}
                          project={preview.project}
                          bottom={false}
                          zoom={1}
                          reset={reset}
                          onFailure={() => setFailure(true)}
                        />
                      </Suspense>
                    )}
                  </div>
                  <div className="spit-preview-controls">
                    <select
                      aria-label="Inspect part"
                      value={isolated}
                      onChange={(e) => setIsolated(Number(e.target.value))}
                    >
                      <option value={-1}>
                        All {result?.parts.length} parts
                      </option>
                      {result?.parts.map((p, i) => (
                        <option key={i} value={i}>
                          {i + 1}. {p.name} · {p.color}
                        </option>
                      ))}
                    </select>
                    <label>
                      Spacing {explode}%
                      <input
                        aria-label="Explode view"
                        type="range"
                        min="0"
                        max="100"
                        value={explode}
                        onChange={(e) => setExplode(Number(e.target.value))}
                      />
                    </label>
                    <button
                      className="icon-button"
                      aria-label="Reset model view"
                      onClick={() => {
                        setExplode(0);
                        setConnections(false);
                        setReset((v) => v + 1);
                      }}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                  <p className="control-note">
                    {failure ? "Basic preview. " : "Drag to orbit. "} Explode
                    only changes the preview; your assembly keeps its original
                    coordinates.{" "}
                    {connections
                      ? "Mating faces are turned upward so you can inspect actual pins, slits and sockets."
                      : "Choose See connections to reveal hidden mating faces."}
                  </p>
                </>
              ) : (
                <div className="spit-empty">
                  <Scissors size={32} />
                  <h2>
                    {error
                      ? "Let’s try another file."
                      : "Your parts are ready."}
                  </h2>
                  <p>
                    {error ||
                      "3D preview is unavailable on this device. You can still download all parts."}
                  </p>
                  <button
                    className="button light"
                    onClick={() => input.current?.click()}
                  >
                    Choose another 3MF
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      setSource({ demo: true, name: "Two-part test block" })
                    }
                  >
                    Try the sample
                  </button>
                </div>
              )}
            </section>
            <aside className="spit-settings panel">
              <div className="spit-step">
                <span>1</span>
                <h2>Separate by</h2>
              </div>
              <select
                aria-label="Separate by"
                value={grouping}
                onChange={(e) => setGrouping(e.target.value as Grouping)}
              >
                <option value="groups">Color + model group</option>
                <option value="colors">Color only</option>
                <option value="pieces">Every connected piece</option>
              </select>
              <p className="control-note">
                Color + group keeps named model parts separate. Color only
                combines matching colors.
              </p>
              <div className="spit-step">
                <span>2</span>
                <h2>Choose your fit</h2>
              </div>
              {result?.recommendation && (
                <div className="spit-recommendation" role="status">
                  <strong>Recommended: {result.recommendation.fit}</strong>
                  <p>{result.recommendation.reason}</p>
                  {fit !== result.recommendation.fit && (
                    <button
                      className="button light small"
                      onClick={() => {
                        setFit(result.recommendation!.fit);
                        setClearance(
                          FITS[result.recommendation!.fit].clearance,
                        );
                      }}
                    >
                      Use {result.recommendation.fit}
                    </button>
                  )}
                  <small>
                    Geometry-based starting point. Material and calibration
                    affect the fit.
                  </small>
                </div>
              )}
              <div className="fit-options">
                {(Object.keys(FITS) as Fit[]).map((name) => (
                  <button
                    key={name}
                    aria-pressed={fit === name}
                    onClick={() => {
                      setFit(name);
                      setClearance(FITS[name].clearance);
                    }}
                  >
                    <span className={"fit-symbol " + name} aria-hidden="true" />
                    <span>
                      <strong>{name}</strong>
                      <small>{FITS[name].description}</small>
                    </span>
                    <i />
                  </button>
                ))}
              </div>
              <details className="disclosure">
                <summary>
                  Fine-tune your fit<span>mm</span>
                </summary>
                <div className="field-grid">
                  <label className="field">
                    Pin diameter
                    <input
                      aria-label="Pin diameter"
                      type="number"
                      min="1.5"
                      max="8"
                      step=".5"
                      value={diameter}
                      onChange={(e) => setDiameter(Number(e.target.value))}
                    />
                  </label>
                  <label className="field">
                    Radial clearance
                    <input
                      aria-label="Radial clearance"
                      type="number"
                      min="0"
                      max=".6"
                      step=".05"
                      value={clearance}
                      onChange={(e) => setClearance(Number(e.target.value))}
                    />
                  </label>
                </div>
              </details>
              <p className="spit-fit-tip">{FITS[fit].tip}</p>
              <div className="spit-step">
                <span>3</span>
                <h2>Take it to the printer</h2>
              </div>
              <button
                className="button primary full"
                disabled={!result || busy || busyExport || !!error}
                onClick={() => downloadProject()}
              >
                <Download size={17} />
                {busyExport ? "Preparing…" : "Download 3MF"}
              </button>
              <button
                className="button light full split-bambu-button"
                disabled={!result || busy || busyExport || !!error}
                onClick={() => {
                  setBambuReady(false);
                  setBambuOpen(true);
                }}
              >
                <BambuLogo />
                Open in Bambu Studio
              </button>
              <p className="control-note">
                One 3MF project with every piece as a separate named part, with
                colors and fit geometry. All parts are included, even when
                inspecting just one.
              </p>
              <details className="disclosure" open>
                <summary>
                  Individual files & ZIP<span>Optional</span>
                </summary>
                <button
                  className="button light full"
                  disabled={!result || busy || busyExport || !!error}
                  onClick={save}
                >
                  <Download size={17} />
                  {busyExport ? "Packing pieces…" : "Download all pieces"}
                </button>
                <p className="control-note">
                  ZIP with individual 3MF + STL files, a print layout, and an
                  assembly guide.
                </p>
              </details>
            </aside>
          </div>
          {error && (
            <p className="validation-message" role="alert">
              {error}
            </p>
          )}
          {result && (
            <section
              className="spit-results panel"
              aria-label="Separated parts"
            >
              <div className="spit-results-heading">
                <h2>{result.parts.length} parts, ready to make</h2>
                <span>
                  {result.connectors} connector pairs · {fit}
                </span>
              </div>
              <div className="spit-part-list">
                {result.parts.map((p, i) => (
                  <div key={i}>
                    <i style={{ background: p.color }} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.group} · {p.color} · {(p.volume / 1000).toFixed(1)}{" "}
                        cm³
                      </small>
                    </span>
                    <button
                      className="button light small"
                      onClick={() => {
                        try {
                          download(
                            part3mf([p], p.name, true),
                            `${i + 1}-${safeName(p.name)}.3mf`,
                            "model/3mf",
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      3MF <Download size={14} />
                    </button>
                  </div>
                ))}
              </div>
              {result.warnings.length > 0 && (
                <details className="disclosure" open>
                  <summary>
                    Fit notes<span>{result.warnings.length}</span>
                  </summary>
                  {result.warnings.map((w, i) => (
                    <p className="control-note" key={i}>
                      {w}
                    </p>
                  ))}
                </details>
              )}
            </section>
          )}
          <p className="spit-footnote">
            Works with closed solid mesh parts, including CoasterGen exports.
            Painted surface-only colors, gradients, and textures need solid
            parts before splitting. Fit geometry is a starting point; print a
            test pair before a full model.
          </p>
        </main>
      </div>
      {bambuOpen && (
        <Modal
          title="Open your parts in Bambu Studio"
          onClose={() => setBambuOpen(false)}
        >
          <div className="bambu-intro">
            <BambuLogo large />
            <p>
              Download one colored 3MF with all your separate parts, then launch
              Bambu Studio.
            </p>
          </div>
          <ol className="bambu-steps">
            <li>Click below to download the project and launch Studio.</li>
            <li>
              In Studio, use <strong>File → Open Project</strong> and select{" "}
              <strong>{safeName(source?.name ?? "model")}-SplitGen.3mf</strong>.
            </li>
            <li>
              Each piece stays a separate named part. Choose your printer,
              assign filaments, and arrange the pieces on your plates before
              slicing.
            </li>
          </ol>
          <button
            className="button primary full"
            disabled={!result || busy || busyExport || !!error}
            onClick={() => downloadProject(true)}
          >
            <BambuLogo />
            {bambuReady
              ? "Download again & launch Studio"
              : "Download & launch Studio"}
          </button>
          <p className="control-note" role="status">
            {bambuReady
              ? "Downloaded. If Studio did not open, launch it manually and open the downloaded 3MF."
              : "Your browser may ask permission to open Bambu Studio. The downloaded file is opened manually in Studio."}
          </p>
        </Modal>
      )}
    </>
  );
}
