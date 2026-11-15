import type { Fit, SplitPart } from "./spitgen";
export function sourceBounds(parts: SplitPart[]) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts)
    for (let i = 0; i < p.positions.length; i++) {
      min[i % 3] = Math.min(min[i % 3], p.positions[i]);
      max[i % 3] = Math.max(max[i % 3], p.positions[i]);
    }
  return { min, max };
}
export function recommendFit(
  parts: SplitPart[],
  connectors?: number,
): { fit: Fit; reason: string } {
  const sizes = parts.map((p) => {
    const b = sourceBounds([p]);
    return b.max.map((v, i) => v - b.min[i]);
  });
  const thin = Math.min(...sizes.flat());
  if (parts.length < 2)
    return {
      fit: "GlueFit",
      reason:
        "Only one solid part was found. No joining fit is needed until it is separated further.",
    };
  if (connectors === 0)
    return {
      fit: "GlueFit",
      reason:
        "No safe pin location was found for these parts. Gluing the original mating surfaces is the most practical starting point.",
    };
  if (
    parts.some(
      (p, i) =>
        p.volume > 0 &&
        p.volume / (sizes[i].reduce((a, b) => a * b, 1) || 1) < 0.35,
    )
  )
    return {
      fit: "GlueFit",
      reason:
        "Some parts have a low solid volume for their size, suggesting thin walls or open space. Prefer a gentle glued fit over snap forces.",
    };
  let contact = false;
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = sourceBounds([parts[i]]),
        b = sourceBounds([parts[j]]);
      if (
        [0, 1, 2].every(
          (k) => a.max[k] >= b.min[k] - 0.05 && b.max[k] >= a.min[k] - 0.05,
        )
      )
        contact = true;
    }
  if (!contact)
    return {
      fit: "GlueFit",
      reason:
        "The parts are already spaced apart. Keep their original surfaces for manual alignment and gluing; automatic pins may not be possible.",
    };
  if (thin < 6)
    return {
      fit: "GlueFit",
      reason: `The thinnest part is only ${thin.toFixed(1)} mm across. A loose alignment fit is a gentler starting point than flexible snap fingers.`,
    };
  if (thin >= 12 && parts.length <= 3)
    return {
      fit: "TightFit",
      reason:
        "A few thick parts give friction pins room to seat. Start with a test pair and adjust clearance for your printer.",
    };
  if (thin >= 8 && parts.length >= 3)
    return {
      fit: "SnapFit",
      reason:
        "These thicker, multipart solids are candidates for flexible snap pins. Connector placement still checks the receiving walls.",
    };
  return {
    fit: "ClickFit",
    reason:
      "These compact solids have room to try ball-stud detents. Print a test pair before committing to the full assembly.",
  };
}
