import { useEffect, useRef } from "react";
import type { ModelData, Project } from "../types";
/** Canvas fallback for devices without WebGL; actual triangles, not placeholder art. */
export default function PartsPreview({
  model,
  project,
}: {
  model: ModelData;
  project: Project;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!,
      host = canvas.parentElement!;
    const draw = () => {
      const width = host.clientWidth,
        height = host.clientHeight,
        ratio = Math.min(devicePixelRatio, 2);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.clearRect(0, 0, width, height);
      const faces: { points: number[][]; depth: number; color: string }[] = [];
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const projectPoint = (x: number, y: number, z: number) => [
        (x - y) * 0.866,
        (x + y) * 0.42 - z,
        x + y + z,
      ];
      for (const part of model.parts) {
        const p = part.positions,
          step = Math.max(1, Math.ceil(part.indices.length / 3 / 80000));
        for (let i = 0; i < part.indices.length; i += 3 * step) {
          const world: number[][] = [];
          const points = [0, 1, 2].map((j) => {
            const k = part.indices[i + j] * 3;
            world.push([p[k], p[k + 1], p[k + 2]]);
            return projectPoint(p[k], p[k + 1], p[k + 2]);
          });
          for (const v of points) {
            minX = Math.min(minX, v[0]);
            maxX = Math.max(maxX, v[0]);
            minY = Math.min(minY, v[1]);
            maxY = Math.max(maxY, v[1]);
          }
          const u = world[1].map((v, k) => v - world[0][k]),
            v = world[2].map((v, k) => v - world[0][k]);
          const n = [
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ];
          const shade =
            0.73 +
            0.27 *
              Math.max(
                0,
                (-0.4 * n[0] - 0.5 * n[1] + 0.85 * n[2]) /
                  (Math.hypot(...n) || 1),
              );
          const color = project.colors[part.colorIndex]
            .slice(1)
            .match(/../g)!
            .map((h) => Math.round(parseInt(h, 16)));
          faces.push({
            points,
            depth: points.reduce((n, p) => n + p[2], 0),
            color: `rgb(${color.join(",")})`,
          });
        }
      }
      const scale = Math.min(
          (width - 60) / (project.diameter * 1.732 || 1),
          (height - 90) / (project.diameter * 0.84 + project.thickness || 1),
        ),
        cx = 0,
        cy = -project.thickness / 2;
      for (const face of faces.sort((a, b) => a.depth - b.depth)) {
        ctx.beginPath();
        face.points.forEach((p, j) => {
          const x = (p[0] - cx) * scale + width / 2,
            y = (p[1] - cy) * scale + height / 2;
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = face.color;
        ctx.fill();
        ctx.strokeStyle = face.color;
        ctx.lineWidth = 0.35;
        ctx.stroke();
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(host);
    draw();
    return () => observer.disconnect();
  }, [model, project]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Basic isometric preview of separated model parts"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
