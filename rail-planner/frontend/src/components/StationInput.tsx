import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import type { StationHit } from "../types";

type Props = {
  label: string;
  value: StationHit | null;
  onChange: (s: StationHit | null) => void;
  placeholder?: string;
};

export function StationInput({ label, value, onChange, placeholder }: Props) {
  const id = useId();
  const [text, setText] = useState(value ? `${value.name} (${value.code})` : "");
  const [hits, setHits] = useState<StationHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef(false);

  useEffect(() => {
    setText(value ? `${value.name} (${value.code})` : "");
  }, [value]);

  useEffect(() => {
    if (!typed.current) return;
    const q = text.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .stations(q, ctrl.signal)
        .then((r) => {
          setHits(r);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  const pick = (s: StationHit) => {
    typed.current = false;
    onChange(s);
    setText(`${s.name} (${s.code})`);
    setOpen(false);
  };

  return (
    <div className="field station">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          typed.current = true;
          setText(e.target.value);
          if (value) onChange(null);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || !hits.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % hits.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + hits.length) % hits.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(hits[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && hits.length > 0 && (
        <ul className="suggest" id={`${id}-list`} role="listbox">
          {hits.map((s, i) => (
            <li
              key={s.code}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="code">{s.code}</span>
              <span className="name">{s.name}</span>
              <span className="state">{s.state}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
