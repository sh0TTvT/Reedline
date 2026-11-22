import { readMidi } from './midi'
import { readNotation } from './notation'
import { transcribe } from './pitch'
import type { Song } from './score'

export type ImportData = { title: string; mode: 'midi' | 'text' | 'audio'; bytes: ArrayBuffer }
export type ImportResponse = { progress: number } | { song: Song } | { error: string }
self.onmessage = (event: MessageEvent<ImportData>) => {
  const { mode, title, bytes } = event.data
  try {
    const base = { title, id: crypto.randomUUID(), preferred: 0, cover: crypto.getRandomValues(new Uint8Array(1))[0] % 6, addedAt: Date.now() }
    let song: Song
    if (mode === 'midi') {
      song = { ...base, kind: 'MIDI', credit: 'MIDI 文件', ...readMidi(new Uint8Array(bytes)) }
    } else if (mode === 'text') {
      const { track, bpm, title: name } = readNotation(new TextDecoder().decode(bytes))
      song = { ...base, kind: '简谱', title: name || title, credit: '数字简谱', bpm, tracks: [track] }
    } else {
      const track = transcribe(new Float32Array(bytes), 12000, progress => self.postMessage({ progress }))
      song = { ...base, kind: '音频', credit: '音频转谱', bpm: null, tracks: [track] }
    }
    self.postMessage({ song })
  } catch (e) { self.postMessage({ error: e instanceof Error ? e.message : '文件解析失败。' }) }
}
