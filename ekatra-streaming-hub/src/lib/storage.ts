import { useCallback, useEffect, useState } from 'react'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/** useState that survives reloads. Falls back to memory if storage is unavailable. */
export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback))

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage blocked (private mode, sandboxed frame) — keep in memory */
    }
  }, [key, value])

  const update = useCallback((next: T | ((prev: T) => T)) => setValue(next), [])
  return [value, update] as const
}
