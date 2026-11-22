import { useEffect, useMemo, useRef, useState } from 'react'
import { desktop, makePlan, send, type NativeState } from './bridge'
import { preview, setVolume, silence } from './music/audio'
import type { Arrangement } from './music/score'
import type { Settings } from './storage'

const initial: NativeState = { phase: 'idle', position: 0, remaining: 0, message: '', missed: 0 }
export function usePlayer(id: string, title: string, arr: Arrangement, settings: Settings, ready: boolean, notice: (s: string) => void) {
  const [state, setState] = useState(initial)
  const [local, setLocal] = useState<'idle' | 'playing' | 'paused'>('idle')
  const [pos, setPos] = useState(0), cursor = useRef(0)
  const [hotkeys, setHotkeys] = useState({ f6: true, f8: true })
  const [connected, setConnected] = useState(false)
  const active = ['countdown', 'playing', 'paused'].includes(state.phase)
  const plan = useMemo(() => makePlan(title, arr, settings), [title, arr, settings.speed, settings.countdown, settings.keys, settings.buttons])
  const put = (s: number) => { cursor.current = s; setPos(s) }
  useEffect(() => { setVolume(settings.volume) }, [settings.volume])
  useEffect(() => {
    silence(); setLocal('idle'); put(0)
  }, [id])
  useEffect(() => {
    if (!desktop) return
    const handle: Parameters<typeof desktop.addEventListener>[1] = ({ data }) => {
      if (data.type === 'hello') { setHotkeys({ f6: data.f6, f8: data.f8 }); setConnected(true) }
      if (data.type === 'notice') notice(data.message)
      if (data.type === 'silence') { silence(); setLocal('idle') }
      if (data.type === 'state') {
        setState(data.state)
        if (!['ready', 'idle'].includes(data.state.phase)) put(data.state.position / 1000)
      }
    }
    desktop.addEventListener('message', handle)
    send('ready')
    return () => { desktop?.removeEventListener('message', handle); silence() }
  }, [notice])
  useEffect(() => { if (connected && ready) send('prepare', { plan, start: cursor.current * 1000 }) }, [connected, ready, plan, id])
  function play(from: number) {
    setLocal('playing')
    void preview(arr, settings.speed, from, (at, done) => {
      put(at)
      if (done) { setLocal('idle'); send('seek', { position: 0 }) }
    }).catch(() => { setLocal('idle'); notice('无法打开音频输出，请检查系统播放设备。') })
  }
  function togglePreview() {
    if (active) return
    if (local === 'playing') { silence(); setLocal('paused'); send('seek', { position: cursor.current * 1000 }); return }
    play(cursor.current >= arr.duration ? 0 : cursor.current)
  }
  function seek(s: number) {
    if (active) return
    const at = Math.max(0, Math.min(arr.duration, s))
    put(at); send('seek', { position: at * 1000 })
    if (local === 'playing') play(at)
  }
  function toggleGame() {
    if (!active) { silence(); setLocal('idle'); send('seek', { position: cursor.current * 1000 }) }
    send('toggle')
  }
  function stop() { silence(); setLocal('idle'); put(0); send('stop') }
  return { pos, local, state, active, hotkeys, connected, togglePreview, toggleGame, seek, stop }
}
