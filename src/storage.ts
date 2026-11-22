import { defaultKeys, keyOptions, type Song } from './music/score'

let dbPromise: Promise<IDBDatabase> | undefined
function database() {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('reedline-library', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('songs', { keyPath: 'id' })
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => { dbPromise = undefined; reject(open.error) }
  })
  return dbPromise
}
export async function libraryRead(): Promise<Song[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const read = db.transaction('songs').objectStore('songs').getAll()
    read.onsuccess = () => resolve(read.result)
    read.onerror = () => reject(read.error)
  })
}
export async function libraryWrite(song: Song | string) {
  const db = await database()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('songs', 'readwrite'), store = tx.objectStore('songs')
    if (typeof song === 'string') store.delete(song)
    else store.put(song)
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error)
  })
}
export type Settings = {
  keys: string[]; buttons: string[]; combine: boolean; countdown: number
  speed: number; transpose: number; volume: number; last: string
}
export const defaults: Settings = {
  keys: defaultKeys, buttons: ['left','right','middle'], combine: false, countdown: 3,
  speed: 1, transpose: 0, volume: 0.55, last: 'demo-0',
}
export function readSettings(): Settings {
  try {
    const p = JSON.parse(localStorage.getItem('reedline-settings') || '{}')
    const bounded = (v: number, min: number, max: number, fallback: number) => Number.isFinite(v) && v >= min && v <= max ? v : fallback
    return {
      keys: Array.isArray(p.keys) && p.keys.length === 8 && new Set(p.keys).size === 8 && p.keys.every((x: string) => keyOptions.includes(x)) ? p.keys : defaults.keys,
      buttons: Array.isArray(p.buttons) && p.buttons.length === 3 && new Set(p.buttons).size === 3 && p.buttons.every((x: string) => defaults.buttons.includes(x)) ? p.buttons : defaults.buttons,
      combine: p.combine === true, countdown: Math.round(bounded(p.countdown, 1, 10, 3)),
      speed: bounded(p.speed, 0.5, 2, 1), transpose: Math.round(bounded(p.transpose, -12, 12, 0)),
      volume: bounded(p.volume, 0, 1, 0.55), last: typeof p.last === 'string' ? p.last : defaults.last,
    }
  } catch { return { ...defaults } }
}
