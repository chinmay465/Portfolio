import { useEffect, useState } from "react";

type NumberFieldProps = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  integer?: boolean;
  label: string;
  id?: string;
  disabled?: boolean;
};

/** Number input that can be cleared and retyped (so "0" is easy to enter); commits on every valid value. */
export function NumberField({ value, onChange, min = 0, step = 1, integer, label, id, disabled }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value || text === "") setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id}
      type="number"
      inputMode={integer ? "numeric" : "decimal"}
      min={min}
      step={step}
      value={text}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.valueAsNumber;
        if (e.target.value !== "" && !Number.isNaN(n) && n >= min) onChange(integer ? Math.floor(n) : n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

type SliderProps = {
  label: string;
  unit: string;
  range: number; // slider track length only; the number box accepts any value
  step: number;
  value: number;
  hint: string;
  onChange: (v: number) => void;
  integer?: boolean;
  unlimited?: boolean;
  onUnlimited?: (v: boolean) => void;
};

export function Slider({ label, unit, range, step, value, hint, onChange, integer, unlimited, onUnlimited }: SliderProps) {
  const max = Math.max(range, value);
  return (
    <div className={`slider ${unlimited ? "off" : ""}`}>
      <div className="slider-top">
        <span>{label}</span>
        <span className="val">
          {unlimited ? (
            <span className="nolimit">No limit</span>
          ) : (
            <>
              <NumberField value={value} onChange={onChange} step={step} integer={integer} label={`${label}${unit ? ` (${unit})` : ""}`} />
              {unit}
            </>
          )}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        aria-label={`${label} slider`}
        disabled={unlimited}
      />
      <span className="hint">
        {hint}
        {onUnlimited && (
          <label className="nl">
            <input type="checkbox" checked={!!unlimited} onChange={(e) => onUnlimited(e.target.checked)} /> No limit
          </label>
        )}
      </span>
    </div>
  );
}
