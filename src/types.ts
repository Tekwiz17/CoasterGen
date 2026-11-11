export type Vec2 = [number, number];
export type Shape = "circle" | "rounded" | "hexagon";
export type MagnetMode = "none" | "center" | "outer";
export interface Project {
  version: 1;
  name: string;
  shape: Shape;
  diameter: number;
  thickness: number;
  inlayDepth: number;
  margin: number;
  colorCount: number;
  colors: string[];
  matchBase: string;
  mapping: number[];
  source: string;
  sourceName: string;
  sample: string;
  artScale: number;
  artX: number;
  artY: number;
  rotation: number;
  mirror: boolean;
  removeBackground: boolean;
  detail: number;
  smoothEdges: boolean;
  snapEnabled: boolean;
  showGuides: boolean;
  magnetMode: MagnetMode;
  magnetDiameter: number;
  magnetDepth: number;
  magnetCount: number;
  edgeGap: number;
  clearance: number;
}
export interface Artwork {
  width: number;
  height: number;
  loops: Vec2[][][];
  sourceColors: string[];
  counts: number[];
  pixels: number;
  removed: number;
}
export interface MeshPart {
  name: string;
  colorIndex: number;
  positions: Float32Array;
  indices: Uint32Array;
  volume: number;
}
export interface ModelData {
  parts: MeshPart[];
  volume: number;
  triangles: number;
  warnings: string[];
}
export const DEFAULT_COLORS = ["#F2E9D8", "#DFAB49", "#D6603F", "#263D39"];
export const DEFAULT_PROJECT: Project = {
  version: 1,
  name: "Solstice",
  shape: "circle",
  diameter: 100,
  thickness: 4,
  inlayDepth: 0.6,
  margin: 3,
  colorCount: 4,
  colors: DEFAULT_COLORS,
  matchBase: DEFAULT_COLORS[0],
  mapping: [0, 1, 2, 3],
  source: "",
  sourceName: "Solstice.svg",
  sample: "sunset",
  artScale: 90,
  artX: 0,
  artY: 0,
  rotation: 0,
  mirror: false,
  removeBackground: false,
  detail: 512,
  smoothEdges: true,
  snapEnabled: true,
  showGuides: true,
  magnetMode: "none",
  magnetDiameter: 6,
  magnetDepth: 2,
  magnetCount: 4,
  edgeGap: 5,
  clearance: 0.2,
};
export const colorName = (hex: string) => {
  const [r, g, b] = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((x) => parseInt(x, 16));
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  if (max - min < 28)
    return max < 75 ? "Charcoal" : max < 170 ? "Pebble" : "Porcelain";
  if (r > 205 && g > 185 && b > 155) return "Warm ivory";
  if (r > g * 1.15 && g > b * 1.3)
    return r - g < 75 ? "Golden ochre" : "Terracotta";
  if (g > r * 1.05 && g > b * 0.95) return g < 110 ? "Forest" : "Sage";
  if (b > r && b > g) return "Ocean blue";
  if (r > b * 1.4) return "Coral";
  return "Custom color";
};
