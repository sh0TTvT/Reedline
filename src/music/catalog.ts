import { readMidi } from './midi'
import { readNotation } from './notation'
import type { Song } from './score'

type Entry = { id: string; file: string; credit: string }
const directory = import.meta.env.BASE_URL + 'scores/'

async function readFile(file: string) {
  const response = await fetch(directory + encodeURIComponent(file))
  if (!response.ok) throw new Error('无法读取 ' + file)
  return response
}

async function readScore({ id, file, credit }: Entry, index: number): Promise<Song> {
  const response = await readFile(file)
  const title = file.replace(/\.[^.]+$/, '')
  const song = { id: 'score-' + id, title, credit, kind: '内置曲谱' as const, cover: index % 6 }
  if (/\.midi?$/i.test(file)) return { ...song, ...readMidi(new Uint8Array(await response.arrayBuffer())) }
  const notation = readNotation(await response.text())
  return { ...song, title: notation.title || title, bpm: notation.bpm, preferred: 0, tracks: [notation.track] }
}

export async function readScoreCatalog() {
  const entries: Entry[] = await (await readFile('index.json')).json()
  const results = await Promise.allSettled(entries.map(readScore))
  const songs: Song[] = [], missing: string[] = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') songs.push(result.value)
    else missing.push(entries[index].file)
  })
  return { songs, missing }
}
