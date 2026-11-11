import { ArrowRight } from "lucide-react";
import { colorName, type Artwork } from "../types";
export function ColorCount({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="color-budget">
      <div className="label-row">
        <strong>Total colors</strong>
        <span>Includes the coaster base</span>
      </div>
      <div className="color-count" role="group" aria-label="Total colors">
        {[2, 3, 4, 5, 6, 7, 8].map((n) => (
          <button
            key={n}
            aria-label={n + " total colors"}
            aria-pressed={value === n}
            className={value === n ? "selected" : ""}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="control-note">
        {value} colors = 1 base + {value - 1} artwork{" "}
        {value === 2 ? "color" : "colors"}.
        {value <= 4
          ? " Fits a single four-slot AMS."
          : " Check your available filament slots."}
      </p>
    </div>
  );
}
export function Filaments({
  colors,
  onChange,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
}) {
  return (
    <div className="filament-list">
      {colors.map((hex, i) => (
        <label className="filament-row" key={i}>
          <span className="swatch" style={{ background: hex }}>
            <input
              type="color"
              aria-label={"Filament " + (i + 1) + " color"}
              value={hex}
              onChange={(e) => {
                const next = [...colors];
                next[i] = e.target.value.toUpperCase();
                onChange(next);
              }}
            />
          </span>
          <span>
            <strong>{i === 0 ? "Coaster base" : "Artwork " + i}</strong>
            <small>{hex.toUpperCase()}</small>
          </span>
          <span className="slot-number">{i + 1}</span>
        </label>
      ))}
    </div>
  );
}
export function ColorMapping({
  art,
  colors,
  mapping,
  onChange,
}: {
  art: Artwork;
  colors: string[];
  mapping: number[];
  onChange: (map: number[]) => void;
}) {
  return (
    <div className="color-mapping">
      <p className="control-note">
        Choose which filament prints each image color. Choose Base to blend a
        region into the coaster.
      </p>
      {art.sourceColors.map((hex, i) =>
        art.counts[i] > 0 ? (
          <label className="mapping-row" key={i}>
            <span
              className="source-swatch"
              style={{ background: hex }}
              title={hex}
            />
            <span className="detected-label">Color {i + 1}</span>
            <ArrowRight size={14} />
            <select
              aria-label={"Map detected color " + (i + 1)}
              value={mapping[i] ?? 0}
              onChange={(e) => {
                const next = [...mapping];
                next[i] = Number(e.target.value);
                onChange(next);
              }}
            >
              {colors.map((color, j) => (
                <option key={j} value={j}>
                  {j === 0 ? "Base" : "Artwork " + j} · {colorName(color)}
                </option>
              ))}
            </select>
            <span
              className="target-swatch"
              style={{ background: colors[mapping[i] ?? 0] }}
            />
          </label>
        ) : null,
      )}
    </div>
  );
}
