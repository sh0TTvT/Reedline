import type { Arrangement } from './score'

let context: AudioContext | undefined
let master: GainNode | undefined
let volume = 0.55
function graph() {
  if (!context) {
    context = new AudioContext()
    master = context.createGain()
    master.gain.value = volume * 0.35
    master.connect(context.destination)
  }
  return context
}
export function setVolume(v: number) { volume = v; if (context && master) master.gain.setTargetAtTime(v * 0.35, context.currentTime, 0.012) }
function reed(ctx: AudioContext, midi: number, at: number, length: number) {
  const osc = ctx.createOscillator(), amp = ctx.createGain()
  osc.setPeriodicWave(wave ??= ctx.createPeriodicWave(new Float32Array(7), new Float32Array([0, 1, .33, .26, .085, .045, .035])))
  osc.frequency.value = 440 * 2 ** ((midi - 69) / 12)
  const end = at + Math.max(.012, length)
  amp.gain.setValueAtTime(.001, at)
  amp.gain.exponentialRampToValueAtTime(.80, at + Math.min(.022, length / 3))
  amp.gain.setValueAtTime(.80, Math.max(at + Math.min(.022, length / 3), end - .019))
  amp.gain.exponentialRampToValueAtTime(.001, end)
  osc.connect(amp); amp.connect(master!)
  osc.onended = () => { osc.disconnect(); amp.disconnect(); voices.delete(osc) }
  voices.add(osc); osc.start(at); osc.stop(end + .004)
}
let wave: PeriodicWave | undefined
const voices = new Set<OscillatorNode>()
let timer: ReturnType<typeof setInterval> | undefined
let generation = 0
export function silence() {
  generation++
  clearInterval(timer)
  for (const osc of voices) { try { osc.stop() } catch { /* voice finished */ } }
  voices.clear()
}
export async function audition(midi: number) {
  const ctx = graph(), current = generation
  await ctx.resume()
  if (current === generation) reed(ctx, midi, ctx.currentTime + .004, .38)
}
export async function preview(arr: Arrangement, speed: number, from: number, tick: (s: number, done: boolean) => void) {
  silence()
  const current = generation, ctx = graph()
  await ctx.resume()
  if (generation !== current) return
  const zero = ctx.currentTime + .035
  let i = arr.notes.findIndex(n => n.start + n.duration > from)
  if (i < 0) i = arr.notes.length
  function schedule() {
    const now = ctx.currentTime
    const position = Math.max(from, from + (now - zero) * speed)
    while (i < arr.notes.length && arr.notes[i].start <= position + .16 * speed) {
      const n = arr.notes[i++]
      const at = Math.max(now + .002, zero + (Math.max(from, n.start) - from) / speed)
      const end = zero + (n.start + n.duration - from) / speed
      if (end > at + .008) reed(ctx, n.pitch, at, Math.max(.01, end - at - .012))
    }
    if (position >= arr.duration) { clearInterval(timer); tick(arr.duration, true); return }
    tick(position, false)
  }
  timer = setInterval(schedule, 32)
  schedule()
}
