import { useEffect, useState } from "react";
import { api } from "../api";
import type { TrainRef } from "../types";

type Props = { trains: TrainRef[]; onChange: (t: TrainRef[]) => void };

/** Pick trains the route must use (any of them). Search by number or name. */
export function TrainPicker({ trains, onChange }: Props) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<TrainRef[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .trains(q, ctrl.signal)
        .then((r) => {
          setHits(r.filter((h) => !trains.some((x) => x.number === h.number)));
          setActive(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text, trains]);

  const add = (t: TrainRef) => {
    onChange([...trains, { number: t.number, name: t.name }]);
    setText("");
    setHits([]);
  };

  return (
    <div className="trains-pick">
      <div className="field station">
        <label htmlFor="train-pick">Trains (optional — routes must use at least one)</label>
        <input
          id="train-pick"
          value={text}
          placeholder="Train number or name, e.g. 17307 or Basava"
          autoComplete="off"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls="train-pick-list"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setTimeout(() => setHits([]), 120)}
          onKeyDown={(e) => {
            if (!hits.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % hits.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + hits.length) % hits.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              add(hits[active]);
            } else if (e.key === "Escape") setHits([]);
          }}
        />
        {hits.length > 0 && (
          <ul className="suggest" id="train-pick-list" role="listbox">
            {hits.map((t, i) => (
              <li
                key={t.number}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(t);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="code">{t.number}</span>
                <span className="name">{t.name}</span>
                <span className="state">
                  {t.from} → {t.to}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {trains.length > 0 && (
        <ul className="via-list">
          {trains.map((t) => (
            <li key={t.number} className="chip via-chip">
              <span className="code">{t.number}</span> {t.name}
              <button type="button" aria-label={`Remove ${t.number}`} onClick={() => onChange(trains.filter((x) => x.number !== t.number))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
