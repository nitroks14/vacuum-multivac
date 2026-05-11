import { useState, useEffect } from 'react'
import { buschPumps, rootsPumps } from './data/pumps'
import { calculateTime } from './utils/calculation'

const STORAGE_KEY = 'vacuum-multivac-state'

export default function App() {
  const [state, setState] = useState(() =>
    JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
      pump: 100,
      roots: false,
      rootsFlow: 500,
      volume: 0.05,
      bends: 4,
      finalPressure: 10
    }
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const time = calculateTime({
    volume: state.volume,
    flow: state.roots ? state.rootsFlow : state.pump,
    finalPressure: state.finalPressure,
    bends: state.bends
  })

  return (
    <div className="app">
      <h1>Calculateur Vide Multivac</h1>

      <label>Pompe Busch (m³/h)</label>
      <select value={state.pump} onChange={e => setState({ ...state, pump: +e.target.value })}>
        {buschPumps.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <label>
        <input type="checkbox" checked={state.roots}
          onChange={e => setState({ ...state, roots: e.target.checked })} />
        Roots
      </label>

      {state.roots && (
        <>
          <label>Débit Roots (m³/h)</label>
          <select value={state.rootsFlow}
            onChange={e => setState({ ...state, rootsFlow: +e.target.value })}>
            {rootsPumps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </>
      )}

      <label>Volume total (m³)</label>
      <input type="number" step="0.01" value={state.volume}
        onChange={e => setState({ ...state, volume: +e.target.value })} />

      <label>Nombre de coudes 90°</label>
      <input type="number" value={state.bends}
        onChange={e => setState({ ...state, bends: +e.target.value })} />

      <label>Vide final (mbar abs)</label>
      <input type="number" value={state.finalPressure}
        onChange={e => setState({ ...state, finalPressure: +e.target.value })} />

      <div className="result">⏱ Temps estimé : <strong>{time.toFixed(1)} s</strong></div>
    </div>
  )
}
