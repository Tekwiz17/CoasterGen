import { useEffect, useRef, useState, type ReactNode } from "react";
import { parseMillimeters } from "../lib/units";
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
  const format = (n: number) => String(Number(n.toFixed(4)));
  const [draft, setDraft] = useState(() => format(value));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current || parseMillimeters(draft) !== value) {
      setDraft(format(value));
      setInvalid(false);
    }
  }, [value]);
  function commit() {
    const parsed = parseMillimeters(draft);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    if (parsed !== value) onChange(parsed);
    setDraft(format(parsed));
    setInvalid(false);
  }
  return (
    <label className="field">
      <span>{label}</span>
      <div className="number-wrap">
        <input
          aria-label={label}
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-invalid={invalid || undefined}
          type={unit === "mm" ? "text" : "number"}
          inputMode="decimal"
          step={step}
          value={draft}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            if (cancelled.current) {
              cancelled.current = false;
              return;
            }
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              cancelled.current = true;
              setDraft(format(value));
              setInvalid(false);
              e.currentTarget.blur();
            }
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const n =
                (parseMillimeters(draft) ?? value) +
                (e.key === "ArrowUp" ? step : -step);
              const bounded = Math.max(
                min,
                Math.min(max, Number(n.toFixed(4))),
              );
              onChange(bounded);
              setDraft(format(bounded));
              setInvalid(false);
            }
          }}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            setInvalid(false);
            // A plain number keeps the existing live preview. Unit-suffixed
            // drafts convert on Enter/blur, without interrupting typing.
            if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim())) {
              const n = Number(text);
              if (Number.isFinite(n)) onChange(n);
            }
          }}
        />
        <span>{unit}</span>
      </div>
      {invalid && (
        <small role="alert">
          Enter a number in mm, or add in for inches (for example, 4in).
        </small>
      )}
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
