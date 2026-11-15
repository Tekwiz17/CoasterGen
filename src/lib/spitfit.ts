import type { ManifoldToplevel, Manifold } from "manifold-3d";
import type { Fit, Grouping, SplitPart, SplitResult } from "./spitgen";
export const FITS: Record<
  Fit,
  { clearance: number; description: string; tip: string }
> = {
  SnapFit: {
    clearance: 0.2,
    description: "Split mushroom pegs that flex into matching sockets.",
    tip: "Press straight in. Print a small test first; PLA snap fingers can be brittle.",
  },
  ClickFit: {
    clearance: 0.15,
    description: "Ball-ended studs and matching detent sockets.",
    tip: "Press together until seated. Check the test fit before assembling all pieces.",
  },
  GlueFit: {
    clearance: 0.25,
    description: "Loose alignment pins with space for adhesive.",
    tip: "Dry-fit first, then apply a little glue inside each socket.",
  },
  TightFit: {
    clearance: 0.05,
    description: "Close-fitting tapered pins for a friction fit.",
    tip: "Press gradually. Increase clearance if your printer makes the fit too tight.",
  },
};
export function splitModel(
  api: ManifoldToplevel,
  input: SplitPart[],
  grouping: Grouping,
  fit: Fit,
  clearance: number,
  diameter: number,
): SplitResult {
  if (
    !Number.isFinite(clearance) ||
    clearance < 0 ||
    clearance > 0.6 ||
    !Number.isFinite(diameter) ||
    diameter < 1.5 ||
    diameter > 8
  )
    throw Error("Use 0–0.6 mm clearance and 1.5–8 mm pins.");
  const refs: Manifold[] = [];
  const keep = (m: Manifold) => {
    refs.push(m);
    return m;
  };
  try {
    const buckets = new Map<string, { part: SplitPart; solid: Manifold }>();
    for (const part of input) {
      const mesh = new api.Mesh({
        numProp: 3,
        vertProperties: part.positions,
        triVerts: part.indices,
      });
      mesh.merge();
      let solid: Manifold;
      try {
        solid = keep(api.Manifold.ofMesh(mesh));
      } catch {
        throw Error(
          `${part.name} is not a closed solid. Export separate solid color parts from your slicer.`,
        );
      }
      if (solid.status() !== "NoError" || solid.isEmpty())
        throw Error(
          `${part.name} is not a closed solid. Surface-painted color shells cannot become printable pieces; export separate solid parts from your slicer.`,
        );
      const chunks =
        grouping === "pieces" ? solid.decompose().map(keep) : [solid];
      for (const [i, s] of chunks.entries()) {
        const key =
          grouping === "colors"
            ? part.color
            : grouping === "pieces"
              ? `${buckets.size}`
              : `${part.group}:${part.name}:${part.color}`;
        const prior = buckets.get(key);
        buckets.set(key, {
          part: {
            ...part,
            name:
              grouping === "colors"
                ? `Color ${buckets.has(key) ? [...buckets.keys()].indexOf(key) + 1 : buckets.size + 1}`
                : part.name + (chunks.length > 1 ? ` · piece ${i + 1}` : ""),
          },
          solid: prior ? keep(prior.solid.add(s)) : s,
        });
      }
    }
    const parts = [...buckets.values()];
    if (parts.length > 64)
      throw Error("More than 64 pieces. Try Color or Color + group grouping.");
    let connectors = 0;
    const warnings: string[] = [];
    const radius = diameter / 2;
    // Test candidate interfaces against the actual solids, not just bounding boxes.
    for (let a = 0; a < parts.length; a++)
      for (let b = a + 1; b < parts.length; b++) {
        const A = parts[a].solid,
          B = parts[b].solid,
          ba = A.boundingBox(),
          bb = B.boundingBox();
        if (
          [0, 1, 2].some(
            (k) => ba.max[k] < bb.min[k] - 0.05 || bb.max[k] < ba.min[k] - 0.05,
          )
        )
          continue;
        const mesh = A.getMesh(),
          stride = mesh.numProp;
        let joined = false;
        const candidates: { p: number[]; n: number[]; area: number }[] = [];
        for (let t = 0; t < mesh.triVerts.length; t += 3) {
          const v = [0, 1, 2].map((j) => {
            const i = mesh.triVerts[t + j] * stride;
            return Array.from(mesh.vertProperties.slice(i, i + 3));
          });
          const u = v[1].map((x, k) => x - v[0][k]),
            w = v[2].map((x, k) => x - v[0][k]);
          const n = [
              u[1] * w[2] - u[2] * w[1],
              u[2] * w[0] - u[0] * w[2],
              u[0] * w[1] - u[1] * w[0],
            ],
            len = Math.hypot(...n);
          if (len < diameter * diameter) continue;
          candidates.push({
            p: [0, 1, 2].map((k) => (v[0][k] + v[1][k] + v[2][k]) / 3),
            n: n.map((x) => x / len),
            area: len,
          });
        }
        for (const { p, n } of candidates
          .sort((a, b) => b.area - a.area)
          .slice(0, 40)) {
          const depth = diameter * 1.1;
          const pitch =
              (Math.acos(Math.max(-1, Math.min(1, n[2]))) * 180) / Math.PI,
            yaw = (Math.atan2(n[1], n[0]) * 180) / Math.PI;
          const place = (m: Manifold) =>
            keep(
              keep(m.rotate([0, pitch, yaw])).translate(
                p as [number, number, number],
              ),
            );
          const shaft = (r: number, h: number, z: number, top = r) =>
            keep(
              keep(api.Manifold.cylinder(h, r, top, 24)).translate([0, 0, z]),
            );
          const envelope = place(
            shaft(radius * 1.3 + clearance, depth + 0.7, -0.35),
          );
          const inA = keep(envelope.intersect(A)).volume(),
            inB = keep(envelope.intersect(B)).volume();
          const expected = Math.PI * (radius * 1.3 + clearance) ** 2;
          // Need material behind the root and around the complete receiving socket.
          if (inA < expected * 0.25 || inB < expected * (depth - 0.1)) continue;
          let male = shaft(
            radius,
            depth + 0.35,
            -0.35,
            fit === "TightFit" ? radius * 0.92 : radius,
          );
          let socket = shaft(radius + clearance, depth + 0.25, 0);
          if (fit === "SnapFit") {
            male = keep(
              male.add(
                shaft(
                  radius * 1.22,
                  diameter * 0.28,
                  depth * 0.62,
                  radius * 0.9,
                ),
              ),
            );
            socket = keep(
              socket.add(
                shaft(
                  radius * 1.22 + clearance,
                  diameter * 0.33,
                  depth * 0.6,
                  radius + clearance,
                ),
              ),
            );
            const slit = keep(
              keep(
                api.Manifold.cube([diameter * 0.22, diameter * 3, depth]),
              ).translate([-diameter * 0.11, -diameter * 1.5, depth * 0.22]),
            );
            male = keep(male.subtract(slit));
          } else if (fit === "ClickFit") {
            male = keep(
              male.add(
                keep(
                  keep(api.Manifold.sphere(radius * 1.2, 24)).translate([
                    0,
                    0,
                    depth * 0.74,
                  ]),
                ),
              ),
            );
            socket = keep(
              socket.add(
                keep(
                  keep(
                    api.Manifold.sphere(radius * 1.2 + clearance, 24),
                  ).translate([0, 0, depth * 0.74]),
                ),
              ),
            );
            const slit = keep(
              keep(
                api.Manifold.cube([diameter * 0.18, diameter * 3, depth]),
              ).translate([-diameter * 0.09, -diameter * 1.5, depth * 0.24]),
            );
            male = keep(male.subtract(slit));
          }
          const peg = place(male),
            hole = place(socket);
          // Leave a 0.35 mm wall around every socket, including the tip.
          const safety = keep(
            hole.minkowskiSum(keep(api.Manifold.sphere(0.35, 8))),
          );
          const above = place(
            shaft(radius * 1.6 + clearance, depth + diameter, 0),
          );
          const needed = keep(safety.intersect(above));
          if (keep(needed.subtract(B)).volume() > 0.01) continue;
          const attached = keep(A.add(peg)),
            cut = keep(B.subtract(hole));
          if (
            attached.status() !== "NoError" ||
            cut.status() !== "NoError" ||
            cut.isEmpty()
          )
            continue;
          parts[a].solid = attached;
          parts[b].solid = cut;
          connectors++;
          joined = true;
          break;
        }
        if (!joined)
          warnings.push(
            `${parts[a].part.name} / ${parts[b].part.name}: no safe pin location at ${diameter} mm. These parts keep their original mating surfaces.`,
          );
      }
    if (!connectors)
      warnings.unshift(
        "No connectors could be added safely. Pieces are still separated; try a smaller pin or use the original surfaces for gluing.",
      );
    const output = parts.map(({ part, solid }) => {
      const m = solid.getMesh();
      return {
        ...part,
        positions: new Float32Array(m.vertProperties),
        indices: new Uint32Array(m.triVerts),
        volume: solid.volume(),
      };
    });
    return { parts: output, warnings, connectors };
  } finally {
    for (let i = refs.length - 1; i >= 0; i--) refs[i].delete();
  }
}
