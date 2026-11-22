import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { desktop, send } from './bridge'
import { Icon } from './components/Icon'
import { ImportDialog } from './components/ImportDialog'
import { Modal } from './components/Modal'
import { Settings, mouseNames } from './components/Settings'
import { Timeline } from './components/Timeline'
import { audition } from './music/audio'
import { demos } from './music/demos'
import { activeIndex, arrange, degrees, pitchName, timeText, type Song } from './music/score'
import { libraryRead, libraryWrite, readSettings, type Settings as Prefs } from './storage'
import { usePlayer } from './usePlayer'
import './style.css'

const phases: Record<string, string> = { ready: '待命', idle: '待命', countdown: '准备中', playing: '游戏演奏中', paused: '游戏已暂停', stopped: '已停止', finished: '演奏结束', error: '演奏中断' }
type Panel = 'import' | 'settings' | 'remove' | 'desktop' | null
export default function App() {
  const [prefs, setPrefs] = useState(readSettings), [songs, setSongs] = useState<Song[]>(demos)
  const [selected, setSelected] = useState(prefs.last), [trackNo, setTrackNo] = useState(-1)
  const [loaded, setLoaded] = useState(false), [search, setSearch] = useState('')
  const [panel, setPanel] = useState<Panel>(null), [files, setFiles] = useState<File[]>([])
  const [toast, setToast] = useState(''), toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [flash, setFlash] = useState(-1), flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [drawer, setDrawer] = useState(false)
  const notice = useCallback((message: string) => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 5200) }, [])
  const song = songs.find(s => s.id === selected) ?? demos[0]
  const t = trackNo >= 0 && trackNo < song.tracks.length ? trackNo : song.preferred
  const track = song.tracks[t]
  const arr = useMemo(() => arrange(track, prefs.transpose, prefs.combine), [track, prefs.transpose, prefs.combine])
  const player = usePlayer(song.id + '/' + t, song.title, arr, prefs, loaded, notice)
  const busy = player.active || player.local === 'playing'
  const noteIndex = activeIndex(arr.notes, player.pos)
  const note = (player.local === 'playing' || player.state.phase === 'playing') && noteIndex >= 0 ? arr.notes[noteIndex] : null
  const result = songs.filter(s => (s.title + ' ' + s.credit + ' ' + s.kind).toLowerCase().includes(search.trim().toLowerCase()))
  const update = (v: Partial<Prefs>) => setPrefs(p => ({ ...p, ...v }))
  useEffect(() => { libraryRead().then(custom => setSongs([...demos, ...custom])).catch(() => notice('本地曲库暂时不可用。')).finally(() => setLoaded(true)) }, [notice])
  useEffect(() => { try { localStorage.setItem('reedline-settings', JSON.stringify(prefs)) } catch { notice('偏好设置无法保存到本机。') } }, [prefs, notice])
  useEffect(() => { send('editing', { value: !!panel }) }, [panel, player.connected])
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault(); if (!busy && !panel && loaded) { setFiles([]); setPanel('import') }
      } else if (e.key === 'Escape') setDrawer(false)
    }
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut)
  }, [busy, panel, loaded])
  function choose(s: Song) {
    if (player.active) return
    if (s.id !== selected || player.local !== 'idle') player.stop()
    setSelected(s.id); setTrackNo(-1); update({ last: s.id }); setDrawer(false)
  }
  function imported(s: Song) {
    setSongs(list => [...list, s]); setSelected(s.id); setTrackNo(-1); setSearch(''); update({ last: s.id }); notice('已加入曲库 · ' + s.title)
  }
  async function removeSong() {
    try { await libraryWrite(song.id); setSongs(list => list.filter(s => s.id !== song.id)); choose(demos[0]); setPanel(null); notice('已从曲库移除。') }
    catch { notice('曲库写入失败，歌曲仍保存在本机。') }
  }
  function tap(lane: number) {
    if (busy) return
    setFlash(lane); clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => setFlash(-1), 280)
    void audition(60 + degrees[lane]).catch(() => notice('无法打开音频输出。'))
  }
  function openImport(dropped: File[] = []) { if (!busy && !panel && loaded) { setFiles(dropped); setPanel('import'); setDrawer(false) } }
  const stateLabel = player.local === 'playing' ? '正在试听' : player.local === 'paused' ? '试听已暂停' : phases[player.state.phase]
  const mods = note ? [note.octave < 0 ? mouseNames[prefs.buttons[0]] : note.octave > 0 ? mouseNames[prefs.buttons[1]] : '', note.sharp ? mouseNames[prefs.buttons[2]] : ''].filter(Boolean).join(' + ') : ''
  return <div className="shell" onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }}
    onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); openImport([...e.dataTransfer.files]) } }}>
    {drawer && <button className="scrim" aria-label="收起曲库" onClick={() => setDrawer(false)}/>}
    <aside className={'sidebar' + (drawer ? ' show' : '')} aria-label="本地曲库">
      <div className="brand"><img src="/reedline.svg" alt=""/><div><b>Reedline</b><span>口琴演奏台</span></div></div>
      <div className="shelf"><div className="shelf-head"><h2><Icon name="library" size={17}/> 我的曲库</h2><span className="count">{songs.length}</span></div>
        <label className="search"><Icon name="search" size={15}/><input aria-label="搜索曲目" placeholder="搜索曲目" value={search} onChange={e => setSearch(e.target.value)}/></label>
        <div className="song-list">{result.map(s => <button className={'song' + (song.id === s.id ? ' selected' : '')} key={s.id} disabled={player.active}
          onClick={() => choose(s)} aria-pressed={song.id === s.id}><span className={'sleeve sleeve-' + s.cover}><i/></span>
          <span className="song-copy"><strong>{s.title}</strong><small>{s.kind === '示例' ? '内置曲谱' : s.kind} · {timeText(s.tracks[s.preferred].duration)}</small></span>
          {song.id === s.id && <Icon name="wave" size={15}/>}</button>)}</div>
        {!result.length && <p className="muted small">没有匹配的曲目</p>}
      </div>
      <div className="side-bottom"><div className="shortcut-title">后台快捷键</div><div className="shortcut"><span>开始 / 暂停 / 继续</span><kbd>F6</kbd></div><div className="shortcut"><span>停止演奏</span><kbd>F8</kbd></div>
        <button className="settings-link" disabled={busy} onClick={() => { setPanel('settings'); setDrawer(false) }}><Icon name="sliders" size={17}/>演奏设置</button></div>
    </aside>
    <main>
      <header className="topbar"><div className="top-title"><button className="iconbtn sidebar-toggle" aria-label="打开曲库" onClick={() => setDrawer(true)}><Icon name="library"/></button>
        <div><div className="eyebrow">HARMONICA STUDIO</div><h1>演奏工作台</h1></div></div>
        <div className="header-actions">{desktop && <button className="iconbtn tray-button" title="收进托盘，后台待命" aria-label="收进托盘" onClick={() => send('tray')}><Icon name="tray"/></button>}
          <button className="solid import-btn" disabled={busy || !loaded} onClick={() => openImport()}><Icon name="import" size={17}/>导入歌曲</button></div>
      </header>
      <section className="hero" aria-label="当前曲目">
        <div className="hero-photo"/><div className="hero-content" key={song.id}><div className="hero-label"><i/> 当前曲目</div>
          <h2 title={song.title}>{song.title}</h2><p>{song.credit} <span> / </span> {song.kind === '示例' ? '内置曲谱' : '本地曲库'}</p>
          <div className="hero-meta"><span><Icon name="clock" size={15}/>{timeText(arr.duration / prefs.speed)}</span>
            <span><Icon name="music" size={15}/>{arr.notes.length} 音</span>{song.bpm && <span>{Math.round(song.bpm * prefs.speed)} BPM</span>}</div>
        </div></section>
      <div className="transport"><div className="transport-buttons">
        <button className="primary" disabled={!loaded || (!!desktop && !player.connected)} onClick={() => desktop ? player.toggleGame() : setPanel('desktop')}>
          <Icon name={player.state.phase === 'playing' || player.state.phase === 'countdown' ? 'pause' : 'play'} size={17}/>
          {player.state.phase === 'countdown' ? '暂停倒计时' : player.state.phase === 'playing' ? '暂停演奏' : player.state.phase === 'paused' ? '继续演奏' : '游戏演奏'}</button>
        <button className="outline" disabled={player.active} onClick={player.togglePreview}><Icon name={player.local === 'playing' ? 'pause' : 'headphones'} size={17}/>
          {player.local === 'playing' ? '暂停试听' : player.local === 'paused' ? '继续试听' : '试听'}</button>
        <button className="iconbtn" aria-label="停止" title="停止并回到开头" disabled={!player.active && player.local === 'idle' && player.pos === 0} onClick={player.stop}><Icon name="stop" size={16}/></button>
        </div><div className="volume"><button className="iconbtn" aria-label={prefs.volume ? '静音' : '打开音量'} title="试听音量" onClick={() => update({volume: prefs.volume ? 0 : .55})}><Icon name={prefs.volume ? 'volume' : 'mute'} size={17}/></button>
        <input type="range" aria-label="试听音量" min="0" max="1" step=".01" value={prefs.volume} onChange={e => update({volume: Number(e.target.value)})}/></div></div>
      {player.state.phase === 'countdown' && <div className="banner" role="status"><b>{player.state.remaining}</b> 秒后开始，请将游戏切到前台并打开口琴。</div>}
      {player.state.message && <div className="banner warn" role="status">{player.state.message}</div>}
      {(!player.hotkeys.f6 || !player.hotkeys.f8) && <div className="banner warn">快捷键 {(!player.hotkeys.f6 ? 'F6 ' : '') + (!player.hotkeys.f8 ? 'F8' : '')} 已被其他程序占用。可使用托盘菜单控制。</div>}
      {player.state.missed > 0 && ['finished','error'].includes(player.state.phase) && <div className="banner warn">{player.state.missed} 个音符来不及发出，可降低速度后重试。</div>}
      <section className="card roll-card">
        <div className="card-head"><h2><Icon name="wave" size={19}/>旋律时间线</h2><div className="meter-read"><span className={'state-dot' + (busy ? ' on' : '')}/><span role="status">{stateLabel}</span><b>{timeText(player.pos / prefs.speed)} <em>/ {timeText(arr.duration / prefs.speed)}</em></b></div></div>
        <Timeline arr={arr} pos={player.pos} speed={prefs.speed} seek={player.seek} locked={player.active}/>
        <input className="seek" type="range" aria-label="全曲进度" min="0" max={arr.duration} step=".05" disabled={player.active} value={player.pos} onChange={e => player.seek(Number(e.target.value))}/>
        <div className="mix-row"><label>音轨<select aria-label="音轨" disabled={busy || song.tracks.length < 2} value={t} onChange={e => { player.stop(); setTrackNo(Number(e.target.value)) }}>
          {song.tracks.map((v,i) => <option key={i} value={i}>{v.name}</option>)}</select></label>
          <label>速度<select aria-label="演奏速度" value={prefs.speed} disabled={busy} onChange={e => update({speed: Number(e.target.value)})}>
            {[.5,.75,.9,1,1.1,1.25,1.5,2].map(v => <option key={v} value={v}>{v.toFixed(2).replace(/0$/, '')}×</option>)}</select></label>
          <div className="transpose"><span>移调</span><button aria-label="降低半音" disabled={busy || prefs.transpose <= -12} onClick={() => update({ transpose: prefs.transpose - 1 })}><Icon name="minus" size={13}/></button>
            <output>{prefs.transpose > 0 ? '+' : ''}{prefs.transpose}</output><button aria-label="升高半音" disabled={busy || prefs.transpose >= 12} onClick={() => update({ transpose: prefs.transpose + 1 })}><Icon name="plus" size={13}/></button></div></div>
        {(arr.folded > 0 || arr.rounded > 0 || arr.omitted > 0) && <p className="adapt">曲谱适配 · {[[arr.folded,'移入音域'],[arr.rounded,'近似半音'],[arr.omitted,'省略重叠音']].filter(a => a[0]).map(a => a[1] + ' ' + a[0]).join(' / ')}</p>}
      </section>
      <section className="card keyboard-card"><div className="card-head"><h2><Icon name="keys" size={19}/>口琴键位</h2><span className="panel-caption">{note ? pitchName(note.pitch) + (mods ? ' · ' + mods : '') : '点击琴键试音'}</span></div>
        <div className="keyboard">{prefs.keys.map((key,i) => <button key={i} aria-label={'试音 ' + key} disabled={busy} className={flash === i || note?.lane === i ? 'lit' : ''} onClick={() => tap(i)}>
          <small>{['Do','Re','Mi','Fa','Sol','La','Si','Do′'][i]}</small><b>{key}</b></button>)}</div>
        <div className="key-legend">{['低八度','高八度','升半音'].map((role,i) => <span key={role}><strong>{mouseNames[prefs.buttons[i]]}</strong>{role}</span>)}</div>
      </section>
      {song.kind !== '示例' && <button className="remove" disabled={busy} onClick={() => setPanel('remove')}><Icon name="trash" size={14}/>从曲库移除</button>}
    </main>
    {panel === 'settings' && <Settings value={prefs} update={update} close={() => setPanel(null)}/>}
    {panel === 'import' && <ImportDialog initial={files} close={() => setPanel(null)} added={imported}/>}
    {panel === 'remove' && <Modal title="移除曲目" close={() => setPanel(null)}><p>从本地曲库移除《{song.title}》？原始文件会保留。</p><div className="dialog-actions"><button className="outline" onClick={() => setPanel(null)}>取消</button><button className="solid" onClick={() => void removeSong()}>移除</button></div></Modal>}
    {panel === 'desktop' && <Modal title="游戏演奏" close={() => setPanel(null)}><p>请打开 Windows 版 Reedline，选择曲目后收进托盘。在游戏内拿起口琴，按 <kbd>F6</kbd> 开始，按 <kbd>F8</kbd> 停止。</p><div className="dialog-actions"><button className="solid" onClick={() => setPanel(null)}>知道了</button></div></Modal>}
    {toast && <div className="toast" role="status"><Icon name="info" size={16}/>{toast}<button aria-label="关闭提示" onClick={() => setToast('')}><Icon name="close" size={14}/></button></div>}
  </div>
}
