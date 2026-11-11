import type { ReactNode } from "react";
export function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "mm",
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="number-wrap">
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number(value.toFixed(2))}
          onChange={(e) => {
            if (
              e.target.value !== "" &&
              Number.isFinite(e.target.valueAsNumber)
            )
              onChange(e.target.valueAsNumber);
          }}
        />
        <span>{unit}</span>
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
  reset,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  reset?: () => void;
}) {
  return (
    <label className="slider-field">
      <span>
        {label}
        <span className="slider-value">
          {reset && (
            <button
              type="button"
              className="text-button"
              onClick={(e) => {
                e.preventDefault();
                reset();
              }}
              title={`Reset ${label}`}
            >
              Reset
            </button>
          )}
          {Number(value.toFixed(1))}
          {unit}
        </span>
      </span>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--range": `${((value - min) / (max - min)) * 100}%` } as any}
      />
    </label>
  );
}
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <i aria-hidden="true" />
    </label>
  );
}
export function Section({
  number,
  title,
  icon,
  children,
}: {
  number: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="control-section">
      <div className="section-heading">
        <span className="section-icon">{icon}</span>
        <h2>{title}</h2>
        <span className="section-number">{number}</span>
      </div>
      {children}
    </section>
  );
}
