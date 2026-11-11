import { useRef, useState, type PointerEvent } from "react";
export default function ImageCrop({
  source,
  onApply,
  onCancel,
}: {
  source: string;
  onApply: (source: string, rect: number[]) => void;
  onCancel: () => void;
}) {
  const [rect, setRect] = useState([0, 0, 1, 1]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const start = useRef<number[] | null>(null);
  const point = (e: PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    ];
  };
  async function apply() {
    setBusy(true);
    try {
      const img = new Image();
      img.src = source;
      await img.decode();
      const [x, y, w, h] = rect,
        scale = source.startsWith("data:image/svg+xml")
          ? 2048 / Math.max(img.naturalWidth, img.naturalHeight)
          : Math.min(
              1,
              2048 / Math.max(img.naturalWidth * w, img.naturalHeight * h),
            );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * w * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * h * scale));
      canvas
        .getContext("2d")!
        .drawImage(
          img,
          img.naturalWidth * x,
          img.naturalHeight * y,
          img.naturalWidth * w,
          img.naturalHeight * h,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      onApply(canvas.toDataURL("image/png"), rect);
    } catch {
      setError("Could not crop this image. Try a different selection.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="crop-panel" aria-label="Crop image">
      <strong>Drag a box around what you want to keep</strong>
      <p>
        Everything outside the box will be removed. Cropping clears brush edits.
        Reset crop restores your original image and cleanup.
      </p>
      <div
        className="crop-surface"
        role="img"
        aria-label="Crop selection"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const p = point(e),
            a = start.current;
          setRect([
            Math.min(a[0], p[0]),
            Math.min(a[1], p[1]),
            Math.max(0.01, Math.abs(a[0] - p[0])),
            Math.max(0.01, Math.abs(a[1] - p[1])),
          ]);
        }}
        onPointerUp={() => {
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <img src={source} alt="Image to crop" draggable={false} />
        <span
          style={{
            left: rect[0] * 100 + "%",
            top: rect[1] * 100 + "%",
            width: rect[2] * 100 + "%",
            height: rect[3] * 100 + "%",
          }}
        />
      </div>
      <div className="crop-fields">
        {["Left", "Top", "Width", "Height"].map((label, i) => (
          <label key={label}>
            {label} %
            <input
              aria-label={"Crop " + label.toLowerCase()}
              type="number"
              min={i < 2 ? 0 : 1}
              max="100"
              value={Math.round(rect[i] * 100)}
              onChange={(e) =>
                setRect((v) => {
                  const n = [...v];
                  n[i] = Math.max(
                    i < 2 ? 0 : 0.01,
                    Math.min(1, Number(e.target.value) / 100),
                  );
                  n[2] = Math.min(n[2], 1 - n[0]);
                  n[3] = Math.min(n[3], 1 - n[1]);
                  return n;
                })
              }
            />
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="cleanup-tools">
        <button
          className="button light small"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel crop
        </button>
        <button
          className="button primary small"
          disabled={busy || rect[2] <= 0 || rect[3] <= 0}
          onClick={apply}
        >
          {busy ? "Cropping…" : "Apply crop"}
        </button>
      </div>
    </section>
  );
}
