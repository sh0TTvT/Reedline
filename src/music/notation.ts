import { assertTrack, degrees, type Note, type Track } from './score'

export function readNotation(text: string): { track: Track; bpm: number; title: string } {
  let title = '', bpm = 100, beat = 0, last: Note | undefined
  const notes: Note[] = []
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  // Beat units keep a later BPM header independent of the order of headers.
  for (const [line, raw] of lines.entries()) {
    const s = raw.replace(/\/\/.*$/, '').trim()
    if (!s) continue
    const header = s.match(/^(title|曲名|bpm|速度)\s*[:=：]\s*(.+)$/i)
    if (header) {
      if (/^(title|曲名)$/i.test(header[1])) title = header[2].trim().slice(0, 160)
      else {
        bpm = Number(header[2])
        if (!(bpm >= 20 && bpm <= 400)) throw new Error('简谱 BPM 应在 20 到 400 之间。')
      }
      continue
    }
    const tokens = s.replace(/[|｜]/g, ' ').trim().split(/\s+/).filter(Boolean)
    for (const token of tokens) {
      if (token === '-') {
        if (last) last.duration += 1
        beat += 1
        continue
      }
      // A bare compact group such as 1235 is four quarter notes.
      const parts = /^[0-7]{2,}$/.test(token) ? [...token] : [token]
      for (const part of parts) {
        const m = part.match(/^([#b]?)([0-7])([#b]?)([',]*)(?::(\d+(?:\.\d+)?|\.\d+))?$/)
        if (!m || (m[1] && m[3]) || (m[4].includes("'") && m[4].includes(','))) {
          throw new Error('简谱第 ' + (line + 1) + ' 行无法识别「' + part.slice(0, 24) + '」。')
        }
        const duration = m[5] ? Number(m[5]) : 1
        if (!(duration > 0 && duration <= 128)) throw new Error('音符时值应大于 0，最多 128 拍。')
        const degree = Number(m[2])
        if (degree) {
          const sign = m[1] || m[3]
          const octave = m[4].length * (m[4].startsWith(',') ? -1 : 1)
          const midi = 60 + degrees[degree - 1] + octave * 12 + (sign === '#' ? 1 : sign === 'b' ? -1 : 0)
          if (midi < 0 || midi > 127) throw new Error('简谱音高超出 MIDI 范围。')
          last = { midi, start: beat, duration }
          notes.push(last)
        } else last = undefined
        beat += duration
      }
    }
  }
  const seconds = 60 / bpm
  const track = { name: '主旋律', duration: beat * seconds, notes: notes.map(n => ({ ...n, start: n.start * seconds, duration: n.duration * seconds })) }
  assertTrack(track)
  return { track, bpm, title }
}
