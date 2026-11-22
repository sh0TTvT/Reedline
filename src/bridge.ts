import type { Arrangement } from './music/score'
import type { Settings } from './storage'

export type NativeState = { phase: string; position: number; remaining: number; message: string; missed: number }
type NativeEvent = { type: 'hello'; f6: boolean; f8: boolean } | { type: 'state'; state: NativeState } | { type: 'silence' } | { type: 'notice'; message: string }
interface Desktop {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (e: MessageEvent<NativeEvent>) => void): void
  removeEventListener(type: 'message', listener: (e: MessageEvent<NativeEvent>) => void): void
}
export const desktop = (window as Window & { chrome?: { webview?: Desktop } }).chrome?.webview
const mouse: Record<string, number> = { left: 1, right: 2, middle: 4 }
const punctuation: Record<string, number> = { ',': 188, '.': 190, '/': 191, ';': 186 }
export function makePlan(title: string, arr: Arrangement, s: Settings) {
  return { title, duration: arr.duration * 1000, rate: s.speed, countdown: s.countdown, notes: arr.notes.map(n => {
    const key = s.keys[n.lane]
    const octave = n.octave < 0 ? mouse[s.buttons[0]] : n.octave > 0 ? mouse[s.buttons[1]] : 0
    return { at: n.start * 1000, length: n.duration * 1000, key: punctuation[key] ?? key.charCodeAt(0), mods: octave | (n.sharp ? mouse[s.buttons[2]] : 0) }
  }) }
}
export const send = (type: string, data: Record<string, unknown> = {}) => desktop?.postMessage({ type, ...data })
