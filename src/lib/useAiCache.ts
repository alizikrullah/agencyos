import { useState, useEffect, useCallback } from 'react'

interface CacheEntry<T> { value: T; ts: number }

const PREFIX = 'agencyos_ai_cache:'

function readCache<T>(storageKey: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as CacheEntry<T>) : null
  } catch { return null }
}

// Cache hasil AI (insight/benchmark/recommendation) di localStorage supaya tidak
// generate ulang tiap buka halaman. Key biasanya per-entity (cth: `industry:<clientId>`).
export function useAiCache<T>(key: string) {
  const storageKey = PREFIX + key
  const [entry, setEntry] = useState<CacheEntry<T> | null>(() => readCache<T>(storageKey))

  // Re-read saat key berubah (cth: pindah antar klien tanpa remount komponen).
  useEffect(() => { setEntry(readCache<T>(storageKey)) }, [storageKey])

  const save = useCallback((value: T) => {
    const e: CacheEntry<T> = { value, ts: Date.now() }
    setEntry(e)
    try { localStorage.setItem(storageKey, JSON.stringify(e)) } catch { /* abaikan quota */ }
  }, [storageKey])

  const clear = useCallback(() => {
    setEntry(null)
    try { localStorage.removeItem(storageKey) } catch { /* */ }
  }, [storageKey])

  return { cached: entry?.value ?? null, cachedAt: entry?.ts ?? null, save, clear }
}

export function timeAgo(ts: number | null): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'baru saja'
  if (min < 60) return `${min} menit lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} jam lalu`
  const day = Math.floor(hr / 24)
  return `${day} hari lalu`
}
