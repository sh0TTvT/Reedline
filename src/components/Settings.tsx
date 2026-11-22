import { Modal } from './Modal'
import { keyOptions } from '../music/score'
import { defaults, type Settings as Prefs } from '../storage'

export const mouseNames: Record<string, string> = { left: '左键', right: '右键', middle: '中键' }
export function Settings({ value, update, close }: { value: Prefs; update: (v: Partial<Prefs>) => void; close: () => void }) {
  function swap(values: string[], index: number, next: string) {
    const copy = [...values], other = copy.indexOf(next)
    if (other >= 0) copy[other] = copy[index]
    copy[index] = next
    return copy
  }
  return <Modal title="演奏设置" close={close}>
    <section className="setting-section"><h3>音键映射</h3><p>与游戏内的八个音键保持一致。选择重复键位时会自动对调。</p>
      <div className="map-grid">{value.keys.map((k, i) => <label key={i}>{['1','2','3','4','5','6','7','高 1'][i]}
        <select aria-label={'音键 ' + (i+1)} value={k} onChange={e => update({ keys: swap(value.keys, i, e.target.value) })}>
          {keyOptions.map(v => <option key={v}>{v}</option>)}</select></label>)}</div>
    </section>
    <section className="setting-section"><h3>鼠标变调</h3><div className="mouse-grid">
      {['低八度','高八度','升半音'].map((name,i) => <label key={name}>{name}<select value={value.buttons[i]} onChange={e => update({ buttons: swap(value.buttons, i, e.target.value) })}>
        {Object.entries(mouseNames).map(([key,title]) => <option value={key} key={key}>{title}</option>)}</select></label>)}</div>
      <label className="switch-row"><span><strong>组合半音</strong><small>允许同时按八度键与半音键，适合支持双鼠标键的游戏版本。</small></span>
        <input type="checkbox" checked={value.combine} onChange={e => update({ combine: e.target.checked })}/></label>
    </section>
    <section className="setting-section"><label className="switch-row"><span><strong>演奏倒计时</strong><small>开始或继续前，预留切回游戏的时间。</small></span>
      <select aria-label="演奏倒计时" value={value.countdown} onChange={e => update({ countdown: Number(e.target.value) })}>
        {Array.from({length:10},(_,i) => <option key={i} value={i+1}>{i+1} 秒</option>)}</select></label></section>
    <div className="dialog-actions"><button className="quiet" onClick={() => update({ keys: defaults.keys, buttons: defaults.buttons, countdown: defaults.countdown, combine: false })}>恢复默认键位与倒计时</button>
      <button className="solid" onClick={close}>完成</button></div>
  </Modal>
}
