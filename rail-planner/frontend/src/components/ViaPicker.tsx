import { useState } from "react";
import type { StationHit } from "../types";
import { StationInput } from "./StationInput";

type Props = { via: StationHit[]; onChange: (v: StationHit[]) => void };

/** Ordered list of stations the route must pass through (changing trains there or riding through). */
export function ViaPicker({ via, onChange }: Props) {
  const [adding, setAdding] = useState<StationHit | null>(null);
  const [key, setKey] = useState(0); // remount the input to clear it after each pick

  const add = (s: StationHit | null) => {
    setAdding(s);
    if (s && !via.some((v) => v.code === s.code)) {
      onChange([...via, s]);
      setAdding(null);
      setKey((k) => k + 1);
    }
  };
  const move = (i: number, d: number) => {
    const next = [...via];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };

  return (
    <div className="via">
      <div className="via-row">
        <StationInput key={key} label="Via stations (optional, in order)" value={adding} onChange={add} placeholder="Add a station to pass through" />
      </div>
      {via.length > 0 && (
        <ol className="via-list">
          {via.map((s, i) => (
            <li key={s.code} className="chip via-chip">
              <span className="n">{i + 1}</span>
              {s.name} <span className="code">{s.code}</span>
              {i > 0 && (
                <button type="button" aria-label={`Move ${s.name} earlier`} onClick={() => move(i, -1)}>
                  ↑
                </button>
              )}
              {i < via.length - 1 && (
                <button type="button" aria-label={`Move ${s.name} later`} onClick={() => move(i, 1)}>
                  ↓
                </button>
              )}
              <button type="button" aria-label={`Remove ${s.name}`} onClick={() => onChange(via.filter((v) => v.code !== s.code))}>
                ×
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="link" onClick={() => onChange([])}>
              Clear
            </button>
          </li>
        </ol>
      )}
    </div>
  );
}
