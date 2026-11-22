import { describe, expect, it } from 'vitest'
import { writeMidi, type MidiEvent } from 'midi-file'
import { arrange, activeIndex, timeText } from '../src/music/score'
import { readNotation } from '../src/music/notation'
import { readMidi } from '../src/music/midi'
import { transcribe } from '../src/music/pitch'

describe('notation and fingering', () => {
  it('displays durations for sub-second audio clips', () => {
    expect(timeText(.6)).toBe('0:00.6')
    expect(timeText(62)).toBe('1:02')
  })
  it('reads rests, ties, fractional beats, sharps, flats and octaves', () => {
    const s = readNotation("曲名=试曲\nBPM=120\n0 1, - | #2:0.5 b3:.5 1' 0:2")
    expect(s.title).toBe('试曲')
    expect(s.track.notes.map(n => [n.midi,n.start,n.duration])).toEqual([[48,.5,1],[63,1.5,.25],[63,1.75,.25],[72,2,.5]])
    expect(s.track.duration).toBe(3.5)
    expect(activeIndex(s.track.notes, 0)).toBe(-1)
    expect(activeIndex(s.track.notes, 1.7)).toBe(1)
    expect(activeIndex(s.track.notes, 3.3)).toBe(-1)
  })
  it('rejects broken and empty scores with location', () => {
    expect(() => readNotation('BPM=2\n1')).toThrow(/BPM/)
    expect(() => readNotation('1 2\n8')).toThrow(/第 2 行/)
    expect(() => readNotation('0 0')).toThrow(/音符/)
  })
  it('maps the eight-key register and distinguishes combined semitones', () => {
    const track = readNotation("1, #1, 1 #4 1' 2' 1'''").track
    const a = arrange(track,0,true)
    expect(a.notes.map(n => [n.lane,n.octave,n.sharp])).toEqual([[0,-1,false],[0,-1,true],[0,0,false],[3,0,true],[7,0,false],[1,1,false],[7,1,false]])
    expect(a.folded).toBe(1)
    expect(arrange(track,0,false).rounded).toBe(1)
  })
  it('keeps the top voice of chords and truncates overlapping notes', () => {
    const a = arrange({ name:'T', duration:3, notes:[
      {start:0,midi:60,duration:3}, {start:0,midi:64,duration:2},
      {start:.5,midi:62,duration:1},{start:1,midi:67,duration:2},
    ] },0,false)
    expect(a.notes.map(n => [n.midi,n.duration])).toEqual([[64,1],[67,2]])
    expect(a.omitted).toBe(2)
  })
})

const on = (noteNumber: number, deltaTime: number, channel=0): MidiEvent => ({type:'noteOn',channel,noteNumber,velocity:90,deltaTime})
const off = (noteNumber: number, deltaTime: number, channel=0): MidiEvent => ({type:'noteOff',channel,noteNumber,velocity:0,deltaTime})
const eot: MidiEvent = {type:'endOfTrack',deltaTime:0}
describe('MIDI', () => {
  it('preserves tempo changes, separate channels, and skips percussion', () => {
    const bytes = writeMidi({ header:{format:1,numTracks:2,ticksPerBeat:96}, tracks:[
      [{type:'setTempo',microsecondsPerBeat:500000,deltaTime:0},{type:'setTempo',microsecondsPerBeat:1000000,deltaTime:96},eot],
      [{type:'trackName',text:'Melody',deltaTime:0},on(60,0),on(36,0,9),off(36,24,9),off(60,72),on(72,0,1),off(72,96,1),eot],
    ] })
    const m = readMidi(Uint8Array.from(bytes))
    expect(m.tracks).toHaveLength(2)
    expect(m.tracks[0].notes).toEqual([{start:0,midi:60,duration:.5}])
    expect(m.tracks[1].notes).toEqual([{start:.5,midi:72,duration:1}])
    expect(m.bpm).toBe(120)
  })
  it('honors SMPTE frame timing and leading silence', () => {
    const bytes = writeMidi({header:{format:0,numTracks:1,framesPerSecond:25,ticksPerFrame:40},tracks:[[on(67,250),off(67,500),eot]]})
    expect(readMidi(Uint8Array.from(bytes)).tracks[0].notes[0]).toEqual({midi:67,start:.25,duration:.5})
  })
  it('rejects unrecognized data and drum-only songs', () => {
    expect(() => readMidi(new Uint8Array([1,2]))).toThrow(/MIDI/)
    const drum = writeMidi({header:{format:0,numTracks:1,ticksPerBeat:48},tracks:[[on(36,0,9),off(36,48,9),eot]]})
    expect(() => readMidi(Uint8Array.from(drum))).toThrow(/打击乐/)
  })
})
describe('audio transcription', () => {
  it('recovers concert A and C separated by silence', () => {
    const rate=12000, pcm = new Float32Array(rate*2)
    for (let i=0; i<pcm.length; i++) {
      const t=i/rate, hz=t>.15 && t<.7 ? 440 : t>1.0 && t<1.65 ? 523.25 : 0
      if (hz) pcm[i]=.45*Math.sin(2*Math.PI*hz*t)
    }
    const t = transcribe(pcm,rate)
    expect(t.notes.map(n=>n.midi)).toEqual([69,72])
    expect(t.notes[0].start).toBeCloseTo(.15,1)
    expect(t.notes[1].duration).toBeCloseTo(.65,1)
  })
  it('reports silence as unplayable', () => expect(() => transcribe(new Float32Array(12000),12000)).toThrow(/音高/))
})
