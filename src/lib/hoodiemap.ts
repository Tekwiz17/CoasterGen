// The atlas and sampler share panel geometry so the SVG matches printed artwork.
export const MAP_WIDTH = 2048,
  MAP_HEIGHT = 1024;
export const panels = [
  { name: "FRONT", x: 55, y: 185, w: 570, h: 740, kind: "body" },
  { name: "BACK", x: 695, y: 185, w: 570, h: 740, kind: "body" },
  { name: "RIGHT SLEEVE", x: 1335, y: 390, w: 260, h: 535, kind: "sleeve" },
  { name: "LEFT SLEEVE", x: 1715, y: 390, w: 260, h: 535, kind: "sleeve" },
  { name: "HOOD FRONT", x: 1335, y: 95, w: 260, h: 230, kind: "hood" },
  { name: "HOOD BACK", x: 1715, y: 95, w: 260, h: 230, kind: "hood" },
] as const;
function span(kind: string, t: number): [number, number] {
  if (kind === "body") {
    if (t < 0.1) return [0.2 - 1.4 * t, 0.8 + 1.4 * t];
    if (t < 0.25)
      return [0.06 + 0.933333 * (t - 0.1), 0.94 - 0.933333 * (t - 0.1)];
    return [0.2, 0.8];
  }
  if (kind === "sleeve") return [0.06 + 0.2 * t, 0.94 - 0.2 * t];
  const half = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))) * 0.47;
  return [0.5 - half, 0.5 + half];
}
/**
 * Map distances, not normalized rectangles. Each panel uses one pixels/mm
 * scale in both axes. Uncovered garment stays base-colored.
 * Sleeve coordinates are mirrored around the same centerline on both arms.
 */
export function panelPoint(x:number,y:number,z:number,height:number,width:number,zoom=1) {
  const t=Math.max(0,Math.min(1,z/height));
  const bodyHalf=width*0.288;
  let index:number, across:number, down:number, physicalHeight:number;
  if(t>0.78 && Math.abs(x)<bodyHalf) {
    index=y<0?4:5;
    across=y<0?x:-x;
    physicalHeight=height*0.22;
    down=height-z;
  } else if(Math.abs(x)>bodyHalf) {
    index=x>0?2:3;
    // Both arms use the same arc coordinate. Folds in depth cannot shift
    // one sleeve's design independently of the other.
    const center=width*(0.39-0.07*t);
    const radius=width*0.105;
    const angle=Math.atan2((Math.abs(x)-center)/radius,Math.abs(y)/(width*0.25));
    across=angle*radius;
    physicalHeight=height*0.78;
    down=height*0.82-z;
  } else {
    index=y<0?0:1;
    across=y<0?x:-x;
    physicalHeight=height*0.78;
    down=physicalHeight-z;
  }
  const p=panels[index];
  const scale=physicalHeight/p.h*Math.max(0.5,Math.min(2,zoom));
  return {index,u:0.5+across/(scale*p.w),v:0.5+(down-physicalHeight/2)/(scale*p.h)};
}
export function atlasUV(x:number,y:number,z:number,height:number,width:number,zoom=1) {
  const {index,u,v}=panelPoint(x,y,z,height,width,zoom);
  const p=panels[index];
  if(v<0 || v>=1)return [-1,-1];
  const [left,right]=span(p.kind,v);
  if(u<left || u>right)return [-1,-1];
  return [(p.x+p.w*u)/MAP_WIDTH,(p.y+p.h*v)/MAP_HEIGHT];
}
export function mapTemplate(guides = true) {
  const shapes = panels
    .map((p) => {
      const rows = Array.from({ length: 81 }, (_, i) => i / 80);
      const points = [
        ...rows.map((t) => [span(p.kind, t)[0], t]),
        ...[...rows].reverse().map((t) => [span(p.kind, t)[1], t]),
      ];
      const path =
        points
          .map(
            ([u, v], i) =>
              `${i ? "L" : "M"}${(p.x + u * p.w).toFixed(1)},${(p.y + v * p.h).toFixed(1)}`,
          )
          .join(" ") + "Z";
      return `<path d="${path}" fill="#e4e8dc"/>${guides ? `<path d="${path}" fill="none" stroke="#476459" stroke-width="3" stroke-dasharray="10 8"/><text x="${p.x + p.w / 2}" y="${p.y - 18}" text-anchor="middle">${p.name}</text><path d="M${p.x + p.w / 2},${p.y + 35}V${p.y + p.h - 25}" stroke="#476459" stroke-opacity=".35" stroke-dasharray="7 9"/>` : ""}`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024" viewBox="0 0 2048 1024"><title>HoodieGen flattened sweatshirt atlas</title><desc>Keep all six pieces in place. Front and back, detached tapered sleeves, and separate hood panels. Top is shoulder or hood crown. Bottom is hem or cuff. Paint inside the shapes. Remove the guides group before importing.</desc><g font-family="sans-serif" font-size="22" fill="#476459">${guides ? '<text x="55" y="55" font-size="32">HOODIEGEN / DESIGN YOUR HOODIE</text><text x="55" y="95">2048 × 1024 · Keep panel positions · Paint inside pieces · Remove guides before upload</text>' : ""}${shapes}</g></svg>`;
}
