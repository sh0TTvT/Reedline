import { parseMidi, type MidiEvent, type MidiHeader } from 'midi-file'
import { assertTrack, type Note, type Track } from './score'

type Event = { tick: number; data: MidiEvent }
function clock(header: MidiHeader, events: Event[]) {
  if (header.framesPerSecond && header.ticksPerFrame) {
    const fps = header.framesPerSecond === 29 ? 30000 / 1001 : header.framesPerSecond
    const ticks = fps * header.ticksPerFrame
    return { bpm: null, seconds: (tick: number) => tick / ticks }
  }
  const ppq = header.ticksPerBeat
  if (!ppq) throw new Error('MIDI 时间分辨率无效。')
  const points = [{ tick: 0, time: 0, us: 500000 }]
  for (const { tick, data } of events.filter(e => e.data.type === 'setTempo').sort((a, b) => a.tick - b.tick)) {
    if (data.type !== 'setTempo' || !data.microsecondsPerBeat) continue
    const last = points[points.length - 1]
    if (tick === last.tick) { last.us = data.microsecondsPerBeat; continue }
    points.push({ tick, time: last.time + (tick - last.tick) * last.us / ppq / 1e6, us: data.microsecondsPerBeat })
  }
  return { bpm: Math.round(6e7 / points[0].us), seconds(tick: number) {
    let lo = 0, hi = points.length
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1
      if (points[mid].tick <= tick) lo = mid
      else hi = mid
    }
    const point = points[lo]
    return point.time + (tick - point.tick) * point.us / ppq / 1e6
  } }
}
export function readMidi(bytes: Uint8Array) {
  let file
  try { file = parseMidi(bytes) } catch { throw new Error('无法读取 MIDI 文件，请检查文件是否完整。') }
  if (file.header.format === 2) throw new Error('请将独立乐段的 MIDI 导出为格式 0 或 1。')
  if (file.tracks.length !== file.header.numTracks) throw new Error('MIDI 音轨数据不完整。')
  const timeline = file.tracks.map(track => {
    let tick = 0
    return track.map(data => ({ tick: tick += data.deltaTime, data }))
  })
  const { seconds, bpm } = clock(file.header, timeline.flat())
  const tracks: Track[] = []
  for (const [index, events] of timeline.entries()) {
    const named = events.find(e => e.data.type === 'trackName')?.data
    const base = named?.type === 'trackName' && named.text.trim() || '音轨 ' + (index + 1)
    const channels = new Map<number, Note[]>()
    const active = new Map<number, number[]>()
    function close(key: number, tick: number) {
      const starts = active.get(key)
      if (!starts?.length) return
      const start = starts.shift()!
      if (!starts.length) active.delete(key)
      if (tick <= start) return
      const channel = key >> 7
      if (!channels.has(channel)) channels.set(channel, [])
      const time = seconds(start)
      channels.get(channel)!.push({ start: time, duration: seconds(tick) - time, midi: key & 127 })
    }
    for (const { tick, data } of events) {
      if ((data.type !== 'noteOn' && data.type !== 'noteOff') || data.channel === 9) continue
      const key = data.channel * 128 + data.noteNumber
      if (data.type === 'noteOn' && data.velocity > 0) {
        if (!active.has(key)) active.set(key, [])
        active.get(key)!.push(tick)
      } else close(key, tick)
    }
    const end = events.at(-1)?.tick ?? 0
    for (const [key, starts] of active) while (starts.length) close(key, end)
    for (const [channel, notes] of channels) {
      const track = { name: base + (channels.size > 1 ? ' · CH ' + (channel + 1) : ''), notes, duration: seconds(end) }
      assertTrack(track)
      tracks.push(track)
    }
  }
  if (!tracks.length) throw new Error('MIDI 没有旋律音轨。第 10 通道的打击乐已忽略。')
  const rank = (t: Track) => {
    const avg = t.notes.reduce((sum, n) => sum + n.midi, 0) / t.notes.length
    return (/melody|lead|vocal|旋律|主唱/i.test(t.name) ? 100 : 0) + avg + Math.min(15, Math.log2(t.notes.length) * 2)
  }
  const preferred = tracks.reduce((best, t, i) => rank(t) > rank(tracks[best]) ? i : best, 0)
  return { tracks, bpm, preferred }
}
