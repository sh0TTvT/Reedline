import { useEffect, useRef, useState } from 'react'
import { accepted, importSong } from '../music/importer'
import { libraryWrite } from '../storage'
import type { Song } from '../music/score'
import { Modal } from './Modal'
import { Icon } from './Icon'

export function ImportDialog({ close, added, initial }: { close: () => void; added: (s: Song) => void; initial?: File[] }) {
  const input = useRef<HTMLInputElement>(null), job = useRef<AbortController | null>(null)
  const [activity, setActivity] = useState(''), [errors, setErrors] = useState<string[]>([]), [over, setOver] = useState(false)
  const [progress, setProgress] = useState(0)
  useEffect(() => { if (initial?.length) void load(initial); return () => job.current?.abort() }, [])
  async function load(files: File[]) {
    if (job.current || !files.length) return
    const ctl = new AbortController(); job.current = ctl; setErrors([])
    const failures: string[] = []
    for (const [i, file] of files.entries()) {
      if (ctl.signal.aborted) break
      setActivity('正在导入 ' + (i + 1) + '/' + files.length + ' · ' + file.name); setProgress(0)
      try {
        const song = await importSong(file, ctl.signal, setProgress)
        ctl.signal.throwIfAborted()
        try { await libraryWrite(song) } catch { throw new Error('本地曲库写入失败，请检查可用磁盘空间。') }
        added(song)
      } catch (e) {
        if (!ctl.signal.aborted) failures.push(file.name + ' · ' + (e instanceof Error ? e.message : '读取失败。'))
      }
    }
    job.current = null
    if (ctl.signal.aborted) return
    setActivity(''); setErrors(failures)
    if (!failures.length) close()
  }
  return <Modal title="导入歌曲" close={close}>
    <button className={'dropzone' + (over ? ' over' : '')} disabled={!!activity} onClick={() => input.current?.click()}
      onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); void load([...e.dataTransfer.files]) }}>
      <span className="drop-icon"><Icon name="import" size={26}/></span><strong>选择文件或拖到这里</strong>
      <small>MIDI · TXT · WAV · MP3 · M4A · OGG · FLAC</small>
    </button>
    <input ref={input} aria-label="选择歌曲文件" type="file" accept={accepted} multiple hidden onChange={e => { void load([...(e.target.files || [])]); e.target.value = '' }}/>
    <p className="import-tip">MIDI 可选择旋律轨。音频适合清唱、口哨和单音乐器，带伴奏的录音可能识别出其他声部。文件在本机处理。</p>
    <details><summary>数字简谱怎么写</summary><p>1–7 对应唱名，0 是休止，- 延长一拍。逗号降八度，英文单引号升八度，# 升半音。冒号后写拍数。</p>
      <pre>{"曲名=练习曲\nBPM=96\n1 2 3:2 | 0 #4:0.5 5:0.5 1':2"}</pre></details>
    {!!activity && <div className="importing" role="status"><span>{activity}</span><progress max={1} value={progress || undefined}/><button className="quiet" onClick={close}>取消导入</button></div>}
    {errors.length > 0 && <ul className="errors" role="alert">{errors.map((e,i) => <li key={i}>{e}</li>)}</ul>}
  </Modal>
}
