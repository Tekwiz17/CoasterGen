import { zipSync, strToU8 } from "fflate";
import { export3mf, exportStl } from "./export";
import { DEFAULT_PROJECT, type ModelData } from "../types";
import { FITS } from "./spitfit";
import type { SplitPart, SplitResult, Fit } from "./spitgen";
export const safeName = (s: string) =>
  s
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 65) || "part";
function floor(part: SplitPart) {
  const p = part.positions;
  const min = [Infinity, Infinity, Infinity];
  for (let i = 0; i < p.length; i++) min[i % 3] = Math.min(min[i % 3], p[i]);
  return {
    ...part,
    positions: p.map((v, i) => v - min[i % 3] + (i % 3 === 2 ? 0 : 2)),
  };
}
export function part3mf(parts: SplitPart[], name: string, layOut = false) {
  const colors = [...new Set(parts.map((p) => p.color))];
  let x = 0;
  const ready = parts.map((p) => {
    let next = layOut ? floor(p) : p;
    if (layOut) {
      const pos = next.positions.slice();
      let max = 0;
      for (let i = 0; i < pos.length; i += 3) {
        max = Math.max(max, pos[i]);
        pos[i] += x;
      }
      next = { ...next, positions: pos };
      x += max + 5;
    }
    return { ...next, colorIndex: colors.indexOf(p.color) };
  });
  const model: ModelData = {
    parts: ready,
    volume: ready.reduce((n, p) => n + p.volume, 0),
    triangles: ready.reduce((n, p) => n + p.indices.length / 3, 0),
    warnings: [],
  };
  return export3mf(
    {
      ...DEFAULT_PROJECT,
      name,
      diameter: 0,
      colorCount: colors.length,
      colors,
    },
    model,
    0,
  );
}
export function splitBundle(
  result: SplitResult,
  name: string,
  fit: Fit,
  clearance: number,
  diameter: number,
) {
  const files: Record<string, Uint8Array> = {};
  result.parts.forEach((p, i) => {
    const prefix = `${String(i + 1).padStart(2, "0")}-${safeName(p.name)}`;
    files[`parts/${prefix}.3mf`] = part3mf([p], p.name, true);
    files[`parts/${prefix}.stl`] = new Uint8Array(
      exportStl({
        parts: [floor(p)],
        volume: p.volume,
        triangles: p.indices.length / 3,
        warnings: [],
      }),
    );
  });
  files["print-layout.3mf"] = part3mf(result.parts, name, true);
  files["assembly-reference.3mf"] = part3mf(result.parts, name);
  files["assembly-guide.txt"] = strToU8(
    `MakerGen / SpitGen\n${name}\n\n${fit}: ${FITS[fit].description}\n${FITS[fit].tip}\nRadial clearance: ${clearance} mm; pin diameter: ${diameter} mm\n${result.connectors} connector pairs added.\n\nparts/: one 3MF and STL for each part, on the bed.\nprint-layout.3mf: separated parts arranged in a row. Arrange onto plates in your slicer.\nassembly-reference.3mf: original assembled coordinates, for reference.\n\nTest-fit a pair before printing the full model. Fits depend on material and printer calibration.\n\n${result.warnings.join("\n")}\n\nMade with MakerGen: https://coastergen.vercel.app/#/spitgen\n`,
  );
  return zipSync(files, { level: 6 });
}
