import { useEffect, useRef, useState } from "react";
import type { Artwork } from "../types";
import { loadPixels } from "../lib/image";
interface Props {
  source: string;
  artwork: Artwork | null;
  colors: string[];
  mapping: number[];
  active: boolean;
  size: number;
  onEdit: (source: string) => void;
  onBusy: (busy: boolean) => void;
}
export default function ImageCleanup({
  source,
  artwork,
  colors,
  mapping,
  active,
  size,
  onEdit,
  onBusy,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const original = useRef<HTMLCanvasElement | null>(null);
  const stroke = useRef<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [redraw, setRedraw] = useState(0);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    let current = true;
    setLoaded(false);
    setFailure("");
    void loadPixels(source, 1024)
      .then(({ width, height, data }) => {
        if (!current || !canvas.current) return;
        const raw = document.createElement("canvas");
        raw.width = width;
        raw.height = height;
        raw
          .getContext("2d")!
          .putImageData(
            new ImageData(new Uint8ClampedArray(data), width, height),
            0,
            0,
          );
        original.current = raw;
        const display = canvas.current;
        display.width = width;
        display.height = height;
        const ctx = display.getContext("2d")!;
        if (active && artwork) {
          const sx = width / artwork.width,
            sy = height / artwork.height;
          ctx.scale(sx, sy);
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
          ctx.globalCompositeOperation = "destination-in";
          ctx.drawImage(raw, 0, 0);
          ctx.globalCompositeOperation = "source-over";
        } else ctx.drawImage(raw, 0, 0);
        setLoaded(true);
      })
      .catch((e) => {
        if (current) setFailure((e as Error).message);
      });
    return () => {
      current = false;
    };
  }, [source, artwork, colors, mapping, active, redraw]);
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
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  }
  function erase(pt: { x: number; y: number }) {
    const previous = stroke.current ?? pt;
    for (const target of [original.current, canvas.current]) {
      if (!target) continue;
      const ctx = target.getContext("2d")!;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = (Math.max(target.width, target.height) * size) / 100;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(pt.x + 0.001, pt.y);
      ctx.stroke();
      ctx.restore();
    }
    stroke.current = pt;
  }
  function finish(commit: boolean) {
    if (!stroke.current) return;
    stroke.current = null;
    if (commit && original.current)
      onEdit(original.current.toDataURL("image/png"));
    else setRedraw((v) => v + 1);
    onBusy(false);
  }
  return (
    <div ref={host} className={"image-cleanup" + (active ? " erasing" : "")}>
      <div
        className="image-cleanup-frame"
        style={{ width: frame.width || "100%", height: frame.height || "100%" }}
      >
        <canvas
          ref={canvas}
          role="img"
          aria-label={
            active
              ? "Image eraser. Drag over unwanted pixels to remove them."
              : "Original uploaded image"
          }
          onPointerDown={(e) => {
            if (!active || !loaded || e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            onBusy(true);
            erase(point(e));
          }}
          onPointerMove={(e) => {
            const pt = point(e);
            setCursor(pt);
            if (stroke.current) erase(pt);
          }}
          onPointerLeave={() => setCursor(null)}
          onPointerUp={() => finish(true)}
          onPointerCancel={() => finish(false)}
          onLostPointerCapture={() => finish(false)}
        />
        {active && cursor && loaded && canvas.current && (
          <span
            className="eraser-cursor"
            aria-hidden="true"
            style={{
              left: `${(cursor.x / canvas.current.width) * 100}%`,
              top: `${(cursor.y / canvas.current.height) * 100}%`,
              width: `${(Math.max(canvas.current.width, canvas.current.height) * size) / canvas.current.width}%`,
            }}
          />
        )}
      </div>
      {failure && <span role="alert">{failure}</span>}
    </div>
  );
}
