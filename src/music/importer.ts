import type { ImportData, ImportResponse } from './import.worker'
import type { Song } from './score'

export const accepted = '.mid,.midi,.txt,.wav,.mp3,.m4a,.ogg,.flac'
export async function importSong(file: File, signal: AbortSignal, onProgress: (n: number) => void): Promise<Song> {
  const ext = file.name.split('.').pop()!.toLowerCase()
  if (!accepted.split(',').includes('.' + ext)) throw new Error('不支持这个格式。请使用 MIDI、TXT 或音频文件。')
  const mode = ext === 'mid' || ext === 'midi' ? 'midi' : ext === 'txt' ? 'text' : 'audio'
  const limit = mode === 'audio' ? 48 : mode === 'text' ? 1 : 4
  if (!file.size || file.size > limit * 1024 * 1024) throw new Error('文件为空或超过 ' + limit + ' MB。')
  let bytes = await file.arrayBuffer()
  signal.throwIfAborted()
  if (mode === 'audio') {
    let decoded: AudioBuffer
    try { decoded = await new OfflineAudioContext(1, 1, 12000).decodeAudioData(bytes) }
    catch { throw new Error('系统无法解码此音频，请导出为 WAV 或 MP3 后重试。') }
    signal.throwIfAborted()
    if (decoded.duration > 600) throw new Error('音频转谱每次最多支持 10 分钟。')
    const mono = new Float32Array(decoded.length)
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const channel = decoded.getChannelData(c)
      for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / decoded.numberOfChannels
    }
    bytes = mono.buffer
  }
  return new Promise<Song>((resolve, reject) => {
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate() }
    const abort = () => { cleanup(); reject(new DOMException('已取消导入', 'AbortError')) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('识别超时，请截取较短片段再试。')) }, 120000)
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = () => { cleanup(); reject(new Error('歌曲解析失败，请检查文件格式。')) }
    worker.onmessage = ({ data }: MessageEvent<ImportResponse>) => {
      if ('progress' in data) { onProgress(data.progress); return }
      cleanup()
      if ('error' in data) reject(new Error(data.error))
      else resolve(data.song)
    }
    worker.postMessage({ mode, title: file.name.slice(0, -(ext.length + 1)).slice(0, 160) || '未命名乐曲', bytes } satisfies ImportData, [bytes])
  })
}
