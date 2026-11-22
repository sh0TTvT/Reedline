import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); close() }}
    onClick={e => { if (e.target === e.currentTarget) {
      const r = e.currentTarget.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close()
    } }}>
    <div className="dialog-head"><h2>{title}</h2><button className="iconbtn" aria-label="关闭" onClick={close}><Icon name="close"/></button></div>
    {children}
  </dialog>
}
