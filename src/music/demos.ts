import { readNotation } from './notation'
import type { Song } from './score'

const sources = [
  ['欢乐颂', '路德维希·范·贝多芬', 108,
    '3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3:1.5 2:0.5 2:2\n3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2:1.5 1:0.5 1:2\n2 2 3 1 | 2 3:0.5 4:0.5 3 1 | 2 3:0.5 4:0.5 3 2 | 1 2 5,:2\n3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2:1.5 1:0.5 1:2'],
  ['小星星', '法国传统童谣', 96,
    "1 1 5 5 | 6 6 5:2 | 4 4 3 3 | 2 2 1:2\n5 5 4 4 | 3 3 2:2 | 5 5 4 4 | 3 3 2:2\n1 1 5 5 | 6 6 5:2 | 4 4 3 3 | 2 2 1:2"],
  ['两只老虎', '法国传统轮唱曲', 112,
    "1 2 3 1 | 1 2 3 1 | 3 4 5:2 | 3 4 5:2\n5:.5 6:.5 5:.5 4:.5 3 1 | 5:.5 6:.5 5:.5 4:.5 3 1 | 1 5, 1:2 | 1 5, 1:2"],
] as const
export const demos: Song[] = sources.map(([title, credit, bpm, text], i) => ({
  id: 'demo-' + i, title, credit, kind: '内置曲谱', bpm, preferred: 0, cover: i,
  tracks: [readNotation('BPM=' + bpm + '\n' + text).track],
}))
