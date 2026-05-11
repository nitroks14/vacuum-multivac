import { useEffect, useMemo, useState } from "react";
import { primaryPumpModels, rootsModels } from "./data/pumps";
import { calculateToolingVolume } from "./utils/toolingVolume";
import { calculateNetwork } from "./utils/network";

const STORAGE_KEY = "vacuum-multivac-state";

export default function App() {
  const [s, setS] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved
      ? JSON.parse(saved)
      : {
          /* Outillage */
          laize: "",
          pitch: "",
          depth: "",
          hasFillers: false,
          fillerThickness: "",

          /* Source */
          sourceType: "network", // network | pump
          networkPressure: 30, // mbar abs
          pumpModel: "Busch R5 RA 0250",

          /* Roots */
          rootsModel: "Aucune",

          /* Réseau */
          mainLength: "",
          rootsLength: "3",
          distributionType: "close",
          distributionLength: "",
          distributionDiameter: 32,

          smallBendsBefore: 0,
          largeBendsBefore: 0,
          smallBendsAfter: 0,
          largeBendsAfter: 0,

          /* Objectif */
          finalPressure: 80
        };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, [s]);

  const u = (k, v) => setS((p) => ({ ...p, [k]: v }));

  /* ───────── Volume outillage ───────── */
  const toolingVolume = useMemo(() => calculateToolingVolume(s), [s]);

  /* ───────── Réseau ───────── */
  const network = useMemo(
    () =>
      calculateNetwork({
        mainLength: +s.mainLength || 0,
        mainDiameter: 60,
        hasRoots: s.rootsModel !== "Aucune",
        rootsLength: +s.rootsLength || 0,
        distributionType: s.distributionType,
        distributionLength: +s.distributionLength || 0,
        distributionDiameter: +s.distributionDiameter,
        smallBendsBefore: +s.smallBendsBefore || 0,
        largeBendsBefore: +s.largeBendsBefore || 0,
        smallBendsAfter: +s.smallBendsAfter || 0,
        largeBendsAfter: +s.largeBendsAfter || 0
      }),
    [s]
  );

  const totalVolume = toolingVolume + network.volume;

  /* ───────── Débit source ───────── */
  function sourceFlow(p) {
    if (s.sourceType === "pump") {
      return primaryPumpModels[s.pumpModel]?.flow(p) || 0;
    }

    /* Réseau de vide : dépend de la pression réseau */
    const pNet = +s.networkPressure || 0;
    if (pNet <= 0) return 0;

    // approximation terrain : plus le réseau est bas, plus le débit dispo chute
    if (p > pNet) return 0.12;
    if (p > 100) return 0.1;
    if (p > 40) return 0.08;
    if (p > 10) return 0.06;
    return 0.045;
  }

  function rootsGain(p) {
    const r = rootsModels[s.rootsModel];
    if (!r || !r.enabled) return 1;
    return r.gain(p);
  }

  /* ───────── Calcul temps (continu) ───────── */
  const time = useMemo(() => {
    if (totalVolume <= 0) return null;

    const pStart = 1000;
    const pEnd = +s.finalPressure;
    if (!pEnd || pEnd <= 0 || pEnd >= pStart) return null;

    let t = 0;
    let p = pStart;
    const steps = 40;
    const dlog = (Math.log(pStart) - Math.log(pEnd)) / steps;

    for (let i = 0; i < steps; i++) {
      const pNext = Math.exp(Math.log(p) - dlog);
      const q =
        (sourceFlow(p) * rootsGain(p)) / Math.max(network.penalty, 1);

      if (q > 0) {
        t += (totalVolume / q) * Math.log(p / pNext) * 3600;
      }
      p = pNext;
    }

    return isFinite(t) ? t : null;
  }, [totalVolume, s, network]);

  return (
    <div className="app">
      <h1>Calculateur Vide Multivac</h1>

      <h2>Outillage</h2>
      <input type="number" step="any" placeholder="Laize (mm)" value={s.laize} onChange={(e) => u("laize", e.target.value)} />
      <input type="number" step="any" placeholder="Pas d’avance (mm)" value={s.pitch} onChange={(e) => u("pitch", e.target.value)} />
      <input type="number" step="any" placeholder="Profondeur (mm)" value={s.depth} onChange={(e) => u("depth", e.target.value)} />

      <label>
        <input type="checkbox" checked={s.hasFillers} onChange={(e) => u("hasFillers", e.target.checked)} />
        Cales de remplissage
      </label>

      {s.hasFillers && (
        <input type="number" step="any" placeholder="Épaisseur cales (mm)" value={s.fillerThickness} onChange={(e) => u("fillerThickness", e.target.value)} />
      )}

      <div className="result light">Volume outillage : <strong>{toolingVolume.toFixed(4)} m³</strong></div>

      <h2>Source de vide</h2>
      <label><input type="radio" checked={s.sourceType === "network"} onChange={() => u("sourceType", "network")} /> Réseau de vide</label>
      <label><input type="radio" checked={s.sourceType === "pump"} onChange={() => u("sourceType", "pump")} /> Pompe locale</label>

      {s.sourceType === "network" && (
        <input type="number" step="any" placeholder="Pression réseau (mbar abs)" value={s.networkPressure} onChange={(e) => u("networkPressure", e.target.value)} />
      )}

      {s.sourceType === "pump" && (
        <select value={s.pumpModel} onChange={(e) => u("pumpModel", e.target.value)}>
          {Object.keys(primaryPumpModels).map((p) => <option key={p}>{p}</option>)}
        </select>
      )}

      <h2>Roots</h2>
      <select value={s.rootsModel} onChange={(e) => u("rootsModel", e.target.value)}>
        {Object.keys(rootsModels).map((r) => <option key={r}>{r}</option>)}
      </select>

      <h2>Réseau de vide</h2>
      <input type="number" step="any" placeholder="Longueur pompe → distributeur (m)" value={s.mainLength} onChange={(e) => u("mainLength", e.target.value)} />
      {s.rootsModel !== "Aucune" && (
        <input type="number" step="any" placeholder="Longueur Roots → distributeur (m)" value={s.rootsLength} onChange={(e) => u("rootsLength", e.target.value)} />
      )}

      <h3>Coudes</h3>
      <input type="number" step="1" placeholder="Petits rayons avant Roots" value={s.smallBendsBefore} onChange={(e) => u("smallBendsBefore", e.target.value)} />
      <input type="number" step="1" placeholder="Grands rayons avant Roots" value={s.largeBendsBefore} onChange={(e) => u("largeBendsBefore", e.target.value)} />
      {s.rootsModel !== "Aucune" && (
        <>
          <input type="number" step="1" placeholder="Petits rayons après Roots" value={s.smallBendsAfter} onChange={(e) => u("smallBendsAfter", e.target.value)} />
          <input type="number" step="1" placeholder="Grands rayons après Roots" value={s.largeBendsAfter} onChange={(e) => u("largeBendsAfter", e.target.value)} />
        </>
      )}

      <h2>Objectif</h2>
      <input type="number" step="any" placeholder="Vide final (mbar abs)" value={s.finalPressure} onChange={(e) => u("finalPressure", e.target.value)} />

      <div className="result">
        {time !== null ? <>Temps estimé : <strong>{time.toFixed(3)} s</strong></> : <>Renseigne les paramètres</>}
      </div>
    </div>
  );
}
