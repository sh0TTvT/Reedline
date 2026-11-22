import { useEffect, useRef, useState } from 'react'
import { pitchName, timeText, type Arrangement } from '../music/score'

export function Timeline({ arr, pos, speed, seek, locked }: { arr: Arrangement; pos: number; speed: number; seek: (s: number) => void; locked: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null), bounds = useRef({ width: 0, start: 0, span: 1 })
  const [size, setSize] = useState(0)
  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setSize(Math.round(e.contentRect.width)))
    obs.observe(canvas.current!); return () => obs.disconnect()
  }, [])
  useEffect(() => {
    if (!canvas.current || !size) return
    const node = canvas.current, ctx = node.getContext('2d')
    if (!ctx) return
    const h = 146, dpr = window.devicePixelRatio || 1
    node.width = size * dpr; node.height = h * dpr; ctx.scale(dpr, dpr)
    const left = 37, width = size - left - 10
    const span = Math.min(arr.duration, 16)
    const start = Math.max(0, Math.min(Math.floor(pos / span) * span, arr.duration - span))
    bounds.current = { width, start, span }
    const x = (s: number) => left + (s - start) * width / span
    const visible = []
    let lo = 0, hi = arr.notes.length
    while (lo < hi) { const m = (lo + hi) >>> 1; if (arr.notes[m].start + arr.notes[m].duration <= start) lo = m + 1; else hi = m }
    for (let i = lo; i < arr.notes.length && arr.notes[i].start < start + span; i++) visible.push(arr.notes[i])
    let min = 60, max = 72
    for (const n of visible) { min = Math.min(min, n.pitch); max = Math.max(max, n.pitch) }
    const y = (p: number) => 110 - (p - min) / (max - min) * 92
    ctx.font = '10px "IBM Plex Mono", monospace'; ctx.lineWidth = 1
    const labels = [...new Set([max, Math.round((min + max) / 2), min])]
    ctx.fillStyle = '#7a8980'
    for (const p of labels) ctx.fillText(pitchName(p), 2, y(p) + 3)
    ctx.strokeStyle = '#e2e9df'; ctx.beginPath()
    for (let i = 0; i <= 6; i++) { const yy = 12.5 + i * 17; ctx.moveTo(left, yy); ctx.lineTo(size - 10, yy) }
    for (let i = 0; i <= 8; i++) {
      const xx = left + width * i / 8; ctx.moveTo(xx, 7); ctx.lineTo(xx, 119)
      if (i % 2 === 0) {
        ctx.textAlign = i === 8 ? 'right' : 'left'; ctx.fillText(timeText((start + span * i / 8) / speed), xx + (i === 8 ? 0 : 2), 138)
      }
    }
    ctx.stroke(); ctx.textAlign = 'left'
    for (const n of visible) {
      const xx = Math.max(left, x(n.start)), end = Math.min(left + width, x(n.start + n.duration))
      ctx.fillStyle = n.start <= pos && pos < n.start + n.duration ? '#254e3e' : n.start < pos ? '#a4bc9c' : '#88b396'
      ctx.beginPath(); ctx.roundRect(xx, y(n.pitch) - 3.6, Math.max(2, end - xx - 2), 7.2, 2.6); ctx.fill()
    }
    const marker = Math.round(x(pos)) + .5
    ctx.strokeStyle = '#d56e42'; ctx.beginPath(); ctx.moveTo(marker, 4); ctx.lineTo(marker, 120); ctx.stroke()
    ctx.fillStyle = '#d56e42'; ctx.beginPath(); ctx.moveTo(marker-4, 3); ctx.lineTo(marker+4, 3); ctx.lineTo(marker, 10); ctx.fill()
  }, [arr, pos, size, speed])
  return <canvas ref={canvas} className="roll" aria-label="旋律时间线，左右方向键定位" tabIndex={locked ? -1 : 0} role="slider"
    aria-valuemin={0} aria-valuemax={Math.ceil(arr.duration)} aria-valuenow={Math.floor(pos)} aria-disabled={locked}
    onKeyDown={e => {
      if (locked) return
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); seek(e.key === 'Home' ? 0 : e.key === 'End' ? arr.duration : pos + (e.key === 'ArrowLeft' ? -1 : 1))
      }
    }}
    onPointerDown={e => { if (!locked) { const b = bounds.current; seek(b.start + Math.max(0, Math.min(1, (e.clientX - e.currentTarget.getBoundingClientRect().left - 37) / b.width)) * b.span) } }} />
}
