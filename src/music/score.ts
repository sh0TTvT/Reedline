export type Note = { midi: number; start: number; duration: number }
export type Track = { name: string; notes: Note[]; duration: number }
export type Song = {
  id: string; title: string; credit: string; kind: '示例' | 'MIDI' | '简谱' | '音频'
  bpm: number | null; tracks: Track[]; preferred: number; cover: number; addedAt?: number
}
export const degrees = [0, 2, 4, 5, 7, 9, 11, 12]
export const defaultKeys = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',']
export const keyOptions = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', ',', '.', '/', ';']
export const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
export const pitchName = (n: number) => noteNames[n % 12] + (Math.floor(n / 12) - 1)
export function timeText(seconds: number, tenths = seconds > 0 && seconds < 1) {
  const n = Math.max(0, Math.floor(seconds + 0.0001))
  const base = Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0')
  return tenths ? base + '.' + Math.floor(Math.max(0, seconds) * 10 + .0001) % 10 : base
}
export type Finger = { lane: number; octave: number; sharp: boolean; pitch: number }
export type PlayNote = Note & Finger
export type Arrangement = { notes: PlayNote[]; duration: number; folded: number; rounded: number; omitted: number }
function fingerings(combine: boolean) {
  const table = new Map<number, Finger>()
  // Insert the simplest fingering first. The comma key plays C5 directly.
  for (const octave of [0, -1, 1]) for (const sharp of [false, true]) {
    if (octave && sharp && !combine) continue
    for (let lane = 0; lane < degrees.length; lane++) {
      const pitch = 60 + degrees[lane] + octave * 12 + Number(sharp)
      const candidate = { lane, octave, sharp, pitch }
      const difficulty = (f: Finger) => Number(f.sharp) + Number(!!f.octave) * 2
      if (!table.has(pitch) || difficulty(candidate) < difficulty(table.get(pitch)!)) table.set(pitch, candidate)
    }
  }
  return table
}
const tables = [fingerings(false), fingerings(true)]
export function arrange(track: Track, transpose: number, combine: boolean): Arrangement {
  const table = tables[Number(combine)]
  const pitches = [...table.keys()].sort((a, b) => a - b)
  const notes: PlayNote[] = []
  let folded = 0, rounded = 0, omitted = 0
  const sorted = [...track.notes].sort((a, b) => a.start - b.start || b.midi - a.midi || b.duration - a.duration)
  for (const n of sorted) {
    const previous = notes.at(-1)
    if (previous && previous.start + previous.duration > n.start + 0.00001) {
      if (previous.start === n.start || previous.midi > n.midi) { omitted++; continue }
      previous.duration = n.start - previous.start
    }
    let pitch = n.midi + transpose
    const original = pitch
    while (pitch < pitches[0]) pitch += 12
    while (pitch > pitches[pitches.length - 1]) pitch -= 12
    if (pitch !== original) folded++
    if (!table.has(pitch)) {
      pitch = pitches.reduce((best, p) => Math.abs(p - pitch) < Math.abs(best - pitch) ? p : best)
      rounded++
    }
    notes.push({ ...n, ...table.get(pitch)! })
  }
  return { notes, duration: track.duration, folded, rounded, omitted }
}
export function activeIndex(notes: Note[], at: number) {
  let lo = 0, hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (notes[mid].start <= at) lo = mid + 1
    else hi = mid
  }
  const i = lo - 1
  return i >= 0 && at < notes[i].start + notes[i].duration ? i : -1
}
export function assertTrack(track: Track) {
  if (!track.notes.length) throw new Error('没有找到可演奏的音符。')
  if (track.notes.length > 50000 || !(track.duration > 0 && track.duration <= 3600)) {
    throw new Error('每轨最多支持 50,000 个音符，乐曲最长 60 分钟。')
  }
}
