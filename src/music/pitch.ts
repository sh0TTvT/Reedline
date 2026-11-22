import { PitchDetector } from 'pitchy'
import { assertTrack, type Note } from './score'

export function transcribe(samples: Float32Array, rate: number, progress: (n: number) => void = () => {}) {
  const size = 1024, hop = Math.round(rate * 0.015)
  const frame = new Float32Array(size)
  const detector = PitchDetector.forFloat32Array(size)
  const frames: number[] = []
  for (let center = 0; center < samples.length; center += hop) {
    frame.fill(0)
    const start = center - size / 2
    frame.set(samples.subarray(Math.max(0, start), Math.min(samples.length, start + size)), Math.max(0, -start))
    let energy = 0
    const gateStart = (size - hop) >> 1
    for (let j = gateStart; j < gateStart + hop; j++) energy += frame[j] * frame[j]
    let midi = -1
    if (energy / hop > 0.00004) {
      const [hz, clarity] = detector.findPitch(frame, rate)
      if (clarity >= 0.88 && hz >= 65 && hz <= 1800) midi = Math.round(69 + 12 * Math.log2(hz / 440))
    }
    frames.push(midi)
    if (frames.length % 160 === 0) progress(center / samples.length)
  }
  // Correct isolated pitch flips without bridging a real break in the phrase.
  const stable = frames.map((p, i) => i > 0 && i + 1 < frames.length && frames[i-1] === frames[i+1] ? frames[i-1] : p)
  const notes: Note[] = []
  const duration = samples.length / rate
  for (let i = 0; i < stable.length;) {
    const first = i, midi = stable[i++]
    while (i < stable.length && stable[i] === midi) i++
    const start = first * hop / rate, end = Math.min(duration, i * hop / rate)
    if (midi >= 0 && end - start >= 0.075) notes.push({ midi, start, duration: end - start })
  }
  if (!notes.length) throw new Error('没有识别出稳定的音高。可以试试清唱、口哨、单音乐器，或导入 MIDI。')
  const track = { name: '识别旋律', notes, duration }
  assertTrack(track)
  return track
}
