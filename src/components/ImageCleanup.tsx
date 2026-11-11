import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Minus, Plus, Maximize, Hand, Paintbrush } from "lucide-react";
import type { Artwork } from "../types";
import { connectedArea } from "../lib/regions";
import { loadPixels } from "../lib/image";
import { loadCleanupMask } from "../lib/cleanup";
export type CleanupTool = "paint" | "fill" | "erase" | "restore";
type Point = { x: number; y: number };
interface Props {
  source: string;
  mask: string;
  artwork: Artwork | null;
  colors: string[];
  mapping: number[];
  active: boolean;
  tool: CleanupTool;
  slot: number;
  size: number;
  onEdit: (mask: string) => void;
  onBusy: (busy: boolean) => void;
  onPreview: (image: string) => void;
}
interface Surface {
  width: number;
  height: number;
  maskCanvas: HTMLCanvasElement;
  scratch: HTMLCanvasElement;
  codes: ImageData;
  base: ImageData;
  view: ImageData;
}
const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};
const rgb = (hex: string) =>
  hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16));
export default function ImageCleanup({
  source,
  mask,
  artwork,
  colors,
  mapping,
  active,
  tool,
  slot,
  size,
  onEdit,
  onBusy,
  onPreview,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null);
  const surface = useRef<Surface | null>(null);
  const previousProps = useRef<unknown[]>([]),
    emittedMask = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false),
    [failure, setFailure] = useState("");
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false),
    [cursor, setCursor] = useState<Point | null>(null);
  const stroke = useRef<Point | null>(null),
    panStart = useRef<{ point: Point; pan: Point } | null>(null);
  const lastPreview = useRef(0);
  const preview = useRef(onPreview);
  preview.current = onPreview;
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const props = [source, artwork, colors, mapping, active];
    if (
      mask === emittedMask.current &&
      surface.current &&
      props.every((p, i) => p === previousProps.current[i])
    )
      return;
    previousProps.current = props;
    let current = true;
    setLoaded(false);
    setFailure("");
    void (async () => {
      const pixels = await loadPixels(
        source,
        Math.max(artwork?.width ?? 1024, artwork?.height ?? 1024),
      );
      const { width, height, data } = pixels;
      const codes = await loadCleanupMask(mask, width, height);
      if (!current || !canvas.current) return;
      const baseCanvas = makeCanvas(width, height),
        ctx = baseCanvas.getContext("2d")!;
      if ((active || mask) && artwork) {
        ctx.scale(width / artwork.width, height / artwork.height);
        artwork.loops.forEach((loops, i) => {
          ctx.beginPath();
          for (const loop of loops) {
            if (!loop.length) continue;
            ctx.moveTo(loop[0][0], loop[0][1]);
            for (let j = 1; j < loop.length; j++)
              ctx.lineTo(loop[j][0], loop[j][1]);
            ctx.closePath();
          }
          ctx.fillStyle = colors[mapping[i] ?? i] ?? colors[0];
          ctx.fill("evenodd");
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else
        ctx.putImageData(
          new ImageData(new Uint8ClampedArray(data), width, height),
          0,
          0,
        );
      const base = ctx.getImageData(0, 0, width, height),
        view = new ImageData(new Uint8ClampedArray(base.data), width, height);
      const maskCanvas = makeCanvas(width, height),
        codeImage = new ImageData(width, height);
      const palette = colors.map(rgb);
      if (codes)
        for (let i = 0; i < codes.length; i++) {
          const code = codes[i];
          if (!code) continue;
          codeImage.data.set([code, 0, 0, 255], i * 4);
          if (code === 255) view.data.fill(0, i * 4, i * 4 + 4);
          else
            view.data.set(
              [...palette[Math.min(code - 1, colors.length - 1)], 255],
              i * 4,
            );
        }
      maskCanvas.getContext("2d")!.putImageData(codeImage, 0, 0);
      canvas.current.width = width;
      canvas.current.height = height;
      canvas.current.getContext("2d")!.putImageData(view, 0, 0);
      surface.current = {
        width,
        height,
        maskCanvas,
        codes: codeImage,
        base,
        view,
        scratch: makeCanvas(width, height),
      };
      setLoaded(true);
      if (active || mask)
        preview.current(canvas.current.toDataURL("image/png"));
    })().catch((e) => {
      if (current) setFailure((e as Error).message);
    });
    return () => {
      current = false;
    };
  }, [source, mask, artwork, colors, mapping, active, revision]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    function resize() {
      if (!element || !canvas.current) return;
      const ratio = canvas.current.width / canvas.current.height;
      const width = Math.min(element.clientWidth, element.clientHeight * ratio);
      setFrame({ width, height: width / ratio });
    }
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [loaded, source]);
  const clampPan = (pt: Point): Point => ({
    x: Math.max(
      -Math.max(0, (frame.width * zoom - (host.current?.clientWidth ?? 0)) / 2),
      Math.min(
        Math.max(
          0,
          (frame.width * zoom - (host.current?.clientWidth ?? 0)) / 2,
        ),
        pt.x,
      ),
    ),
    y: Math.max(
      -Math.max(
        0,
        (frame.height * zoom - (host.current?.clientHeight ?? 0)) / 2,
      ),
      Math.min(
        Math.max(
          0,
          (frame.height * zoom - (host.current?.clientHeight ?? 0)) / 2,
        ),
        pt.y,
      ),
    ),
  });
  function point(e: PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  }
  function publish(force = false) {
    if (
      !canvas.current ||
      (!force && performance.now() - lastPreview.current < 65)
    )
      return;
    lastPreview.current = performance.now();
    preview.current(canvas.current.toDataURL("image/png"));
  }
  function draw(
    pt: Point,
    code = tool === "erase" ? 255 : tool === "restore" ? 0 : slot + 1,
  ) {
    const s = surface.current;
    if (!s || !canvas.current) return;
    const prev = stroke.current ?? pt,
      scale =
        Math.max(s.width, s.height) /
        Math.max(artwork?.width ?? s.width, artwork?.height ?? s.height);
    const diameter = Math.max(1, size * scale),
      radius = diameter / 2 + 2;
    const x = Math.max(0, Math.floor(Math.min(pt.x, prev.x) - radius)),
      y = Math.max(0, Math.floor(Math.min(pt.y, prev.y) - radius));
    const w = Math.max(
        0,
        Math.min(s.width, Math.ceil(Math.max(pt.x, prev.x) + radius)) - x,
      ),
      h = Math.max(
        0,
        Math.min(s.height, Math.ceil(Math.max(pt.y, prev.y) + radius)) - y,
      );
    if (w && h) {
      const ctx = s.scratch.getContext("2d", { willReadFrequently: true })!;
      ctx.clearRect(x, y, w, h);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = diameter;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x + 0.001, pt.y);
      ctx.stroke();
      const pixels = ctx.getImageData(x, y, w, h).data,
        color = rgb(colors[Math.min(slot, colors.length - 1)]);
      const write = (col: number, row: number) => {
        if (col < 0 || row < 0 || col >= s.width || row >= s.height) return;
        const i = (row * s.width + col) * 4;
        s.codes.data.set(code ? [code, 0, 0, 255] : [0, 0, 0, 0], i);
        if (!code) s.view.data.set(s.base.data.subarray(i, i + 4), i);
        else if (code === 255) s.view.data.fill(0, i, i + 4);
        else s.view.data.set([...color, 255], i);
      };
      for (let row = 0; row < h; row++)
        for (let col = 0; col < w; col++)
          if (pixels[(row * w + col) * 4 + 3] >= 128) write(x + col, y + row);
      // An antialiased one-pixel circle can cover four pixels below 50% each.
      // Always stamp its centerline so a precise click cannot disappear.
      if (diameter <= 2) {
        const steps = Math.max(
          1,
          Math.ceil(Math.max(Math.abs(pt.x - prev.x), Math.abs(pt.y - prev.y))),
        );
        for (let i = 0; i <= steps; i++)
          write(
            Math.floor(prev.x + ((pt.x - prev.x) * i) / steps),
            Math.floor(prev.y + ((pt.y - prev.y) * i) / steps),
          );
      }
      s.maskCanvas.getContext("2d")!.putImageData(s.codes, 0, 0, x, y, w, h);
      canvas.current.getContext("2d")!.putImageData(s.view, 0, 0, x, y, w, h);
      publish();
    }
    stroke.current = pt;
  }
  function fill(pt: Point) {
    const s = surface.current;
    if (!s || !canvas.current) return;
    const area = connectedArea(s.view.data, s.width, s.height, pt.x, pt.y);
    if (!area.length) return;
    const color = rgb(colors[Math.min(slot, colors.length - 1)]);
    for (const i of area) {
      s.codes.data.set([slot + 1, 0, 0, 255], i * 4);
      s.view.data.set([...color, 255], i * 4);
    }
    s.maskCanvas.getContext("2d")!.putImageData(s.codes, 0, 0);
    canvas.current.getContext("2d")!.putImageData(s.view, 0, 0);
    emittedMask.current = s.maskCanvas.toDataURL("image/png");
    publish(true);
    onEdit(emittedMask.current);
  }
  function finish(commit: boolean) {
    if (panStart.current) {
      panStart.current = null;
      onBusy(false);
      return;
    }
    if (!stroke.current) return;
    stroke.current = null;
    if (commit && surface.current) {
      const next = surface.current.maskCanvas.toDataURL("image/png");
      emittedMask.current = next;
      publish(true);
      onEdit(next);
    } else {
      emittedMask.current = null;
      setRevision((v) => v + 1);
    }
    onBusy(false);
  }
  const label = active
    ? moving
      ? "Image cleanup. Drag to move the zoomed image."
      : tool === "fill"
        ? "Fill area. Choose a filament, then click one connected color area."
        : tool === "erase"
          ? "Image eraser. Drag over unwanted pixels to remove them."
          : tool === "restore"
            ? "Restore automatic colors. Drag to remove brush corrections."
            : "Image paint brush. Drag to paint with the selected filament."
    : "Original uploaded image";
  return (
    <div className={"cleanup-stage" + (active ? " is-active" : "")}>
      <div
        ref={host}
        className={
          "image-cleanup" +
          (active && tool === "fill" ? " filling" : "") +
          (active ? (moving ? " moving" : " erasing") : "")
        }
      >
        <div
          className="image-cleanup-frame"
          style={{
            width: frame.width * zoom || "100%",
            height: frame.height * zoom || "100%",
            transform: `translate(-50%,-50%) translate(${pan.x}px,${pan.y}px)`,
          }}
        >
          <canvas
            ref={canvas}
            role="img"
            aria-label={label}
            tabIndex={active ? 0 : -1}
            onPointerDown={(e) => {
              if (!active || !loaded || e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.focus();
              e.currentTarget.setPointerCapture(e.pointerId);
              if (tool === "fill" && !moving && !e.altKey) {
                fill(point(e));
                return;
              }
              onBusy(true);
              if (moving || e.altKey)
                panStart.current = {
                  point: { x: e.clientX, y: e.clientY },
                  pan,
                };
              else draw(point(e));
            }}
            onPointerMove={(e) => {
              const pt = point(e);
              setCursor(pt);
              if (panStart.current) {
                const start = panStart.current;
                setPan(
                  clampPan({
                    x: start.pan.x + e.clientX - start.point.x,
                    y: start.pan.y + e.clientY - start.point.y,
                  }),
                );
              } else if (stroke.current) draw(pt);
            }}
            onPointerLeave={() => setCursor(null)}
            onPointerUp={() => finish(true)}
            onPointerCancel={() => finish(false)}
            onLostPointerCapture={() => finish(false)}
            onKeyDown={(e) => {
              if (!active || !loaded || moving) return;
              const pt = cursor ?? {
                x: (surface.current?.width ?? 0) / 2,
                y: (surface.current?.height ?? 0) / 2,
              };
              const step = e.shiftKey ? 10 : 1;
              if (e.key.startsWith("Arrow")) {
                e.preventDefault();
                setCursor({
                  x: Math.max(
                    0,
                    Math.min(
                      (surface.current?.width ?? 1) - 1,
                      pt.x +
                        (e.key === "ArrowRight"
                          ? step
                          : e.key === "ArrowLeft"
                            ? -step
                            : 0),
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      (surface.current?.height ?? 1) - 1,
                      pt.y +
                        (e.key === "ArrowDown"
                          ? step
                          : e.key === "ArrowUp"
                            ? -step
                            : 0),
                    ),
                  ),
                });
              } else if (
                e.key === " " ||
                e.key === "Delete" ||
                e.key === "Backspace"
              ) {
                e.preventDefault();
                if (tool === "fill" && e.key === " ") fill(pt);
                else draw(pt, e.key === " " ? undefined : 255);
                finish(true);
              }
            }}
          />
          {active &&
            tool !== "fill" &&
            !moving &&
            cursor &&
            loaded &&
            surface.current && (
              <span
                className="eraser-cursor"
                aria-hidden="true"
                style={{
                  left: `${(cursor.x / surface.current.width) * 100}%`,
                  top: `${(cursor.y / surface.current.height) * 100}%`,
                  width: `${(((size / Math.max(artwork?.width ?? 1, artwork?.height ?? 1)) * Math.max(surface.current.width, surface.current.height)) / surface.current.width) * 100}%`,
                  borderColor: tool === "paint" ? colors[slot] : "#fff",
                }}
              />
            )}
        </div>
        {failure && <span role="alert">{failure}</span>}
      </div>
      {active && (
        <div className="cleanup-view-tools">
          <button
            aria-label="Zoom out cleanup"
            disabled={zoom <= 1}
            onClick={() => {
              setZoom((v) => Math.max(1, v - 1));
              setPan({ x: 0, y: 0 });
            }}
          >
            <Minus size={15} />
          </button>
          <span aria-live="polite">{zoom}×</span>
          <button
            aria-label="Zoom in cleanup"
            disabled={zoom >= 8}
            onClick={() => setZoom((v) => Math.min(8, v + 1))}
          >
            <Plus size={15} />
          </button>
          <button
            aria-label="Fit cleanup image"
            title="Fit image"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <Maximize size={15} />
          </button>
          <button
            aria-label="Move cleanup view"
            aria-pressed={moving}
            title={moving ? "Switch back to brush" : "Move view (or hold Alt)"}
            onClick={() => setMoving((v) => !v)}
          >
            {moving ? <Paintbrush size={15} /> : <Hand size={15} />}
            <span>{moving ? "Brush" : "Move"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
