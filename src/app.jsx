import { useEffect, useMemo, useState } from "react";
import { primaryPumpModels, rootsModels } from "./data/pumps";
import { calculateToolingVolume } from "./utils/toolingVolume";
import { calculateNetwork, calculatePipeVolume } from "./utils/network";

const STORAGE_KEY = "vacuum-multivac-state";
const ATM = 1013;

export default function App() {
  /* ───────── STATE ───────── */

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
          networkPressure: 35,
          pumpModel: "Busch R5 RA 0250",

          /* Roots */
          rootsModel: "Aucune",

          /* Réseau AMONT vannes */
          mainLength: "",
          mainDiameter: 60,
          rootsLength: "3",

          /* Vannes */
          valvePosition: "close", // close | remote

          /* Réseau AVAL vannes */
          downstreamLength: "",
          downstreamDiameter: 32,

          /* Coudes */
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

  /* ───────── VOLUMES ───────── */

  const volumeOutillage = useMemo(
    () => calculateToolingVolume(s),
    [s]
  );

  const network = useMemo(
    () =>
      calculateNetwork({
        mainLength: +s.mainLength || 0,
        mainDiameter: +s.mainDiameter,
        hasRoots: s.rootsModel !== "Aucune",
        rootsLength: +s.rootsLength || 0,
        distributionType: "none",
        distributionLength: 0,
        distributionDiameter: 60,
        smallBendsBefore: +s.smallBendsBefore || 0,
        largeBendsBefore: +s.largeBendsBefore || 0,
        smallBendsAfter: +s.smallBendsAfter || 0,
        largeBendsAfter: +s.largeBendsAfter || 0
      }),
    [s]
  );

  const volumeAval =
    volumeOutillage +
    (s.valvePosition === "remote"
      ? calculatePipeVolume(
          +s.downstreamLength || 0,
          +s.downstreamDiameter
        )
      : 0);

  const volumeAmont = network.volume;
  const penalty = Math.max(network.penalty, 1);

  /* ───────── DÉBITS ───────── */

  function sourceFlow(p) {
    if (s.sourceType === "pump") {
      return primaryPumpModels[s.pumpModel]?.flow(p) || 0;
    }

    const pNet = Number(s.networkPressure);
    if (!pNet || pNet <= 0) return 0;

    if (p > 100) return 0.12;
    if (p > 40) return 0.10;
    if (p > 10) return 0.07;
    return 0.05;
  }

  function rootsGain(p) {
    const r = rootsModels[s.rootsModel];
    if (!r || !r.enabled) return 1;
    return r.gain(p);
  }

  /* ───────── CALCUL TEMPS (2 PHASES) ───────── */

  const time = useMemo(() => {
    if (volumeAval <= 0) return null;

    const pReseau =
      s.sourceType === "network"
        ? Number(s.networkPressure)
        : ATM;

    const pFinal = Number(s.finalPressure);
    if (!pReseau || !pFinal || pFinal <= 0) return null;

    let t = 0;
    const steps = 40;

    /* Phase A : aval vannes seul */
    if (pReseau < ATM) {
      let p = ATM;
      const dlog = (Math.log(ATM) - Math.log(pReseau)) / steps;

      for (let i = 0; i < steps; i++) {
        const pNext = Math.exp(Math.log(p) - dlog);
        const q = sourceFlow(p) / penalty;

        if (q > 0) {
          t += (volumeAval / q) * Math.log(p / pNext) * 3600;
        }
        p = pNext;
      }
    }

    /* Phase B : volume total */
    if (pReseau > pFinal) {
      let p = pReseau;
      const volumeTotal = volumeAval + volumeAmont;
      const dlog =
        (Math.log(pReseau) - Math.log(pFinal)) / steps;

      for (let i = 0; i < steps; i++) {
        const pNext = Math.exp(Math.log(p) - dlog);
        const q =
          (sourceFlow(p) * rootsGain(p)) / penalty;

        if (q > 0) {
          t +=
            (volumeTotal / q) *
            Math.log(p / pNext) *
            3600;
        }
        p = pNext;
      }
    }

    return isFinite(t) ? t : null;
  }, [s, volumeAval, volumeAmont, penalty]);

  /* ───────── UI ───────── */

  return (
    <div className="app">
      <h1>Calculateur Vide Multivac</h1>

      <h2>Outillage</h2>
      <input type="number" step="any" placeholder="Laize (mm)"
        value={s.laize} onChange={(e) => u("laize", e.target.value)} />
      <input type="number" step="any" placeholder="Pas d’avance (mm)"
        value={s.pitch} onChange={(e) => u("pitch", e.target.value)} />
      <input type="number" step="any" placeholder="Profondeur (mm)"
        value={s.depth} onChange={(e) => u("depth", e.target.value)} />

      <label>
        <input type="checkbox"
          checked={s.hasFillers}
          onChange={(e) => u("hasFillers", e.target.checked)} />
        Cales de remplissage
      </label>

      {s.hasFillers && (
        <input type="number" step="any"
          placeholder="Épaisseur cales (mm)"
          value={s.fillerThickness}
          onChange={(e) => u("fillerThickness", e.target.value)} />
      )}

      <div className="result light">
        Volume outillage : <strong>{volumeOutillage.toFixed(4)} m³</strong>
      </div>

      <h2>Source de vide</h2>
      <label>
        <input type="radio"
          checked={s.sourceType === "network"}
          onChange={() => u("sourceType", "network")} />
        Réseau de vide
      </label>
      <label>
        <input type="radio"
          checked={s.sourceType === "pump"}
          onChange={() => u("sourceType", "pump")} />
        Pompe locale
      </label>

      {s.sourceType === "network" && (
        <input type="number" step="any"
          placeholder="Pression réseau (mbar abs)"
          value={s.networkPressure}
          onChange={(e) => u("networkPressure", e.target.value)} />
      )}

      {s.sourceType === "pump" && (
        <select value={s.pumpModel}
          onChange={(e) => u("pumpModel", e.target.value)}>
          {Object.keys(primaryPumpModels).map((p) =>
            <option key={p}>{p}</option>
          )}
        </select>
      )}

      <h2>Roots</h2>
      <select value={s.rootsModel}
        onChange={(e) => u("rootsModel", e.target.value)}>
        {Object.keys(rootsModels).map((r) =>
          <option key={r}>{r}</option>
        )}
      </select>

      <h2>Vannes de vide</h2>
      <label>
        <input type="radio"
          checked={s.valvePosition === "close"}
          onChange={() => u("valvePosition", "close")} />
        Vannes proches de l’outillage
      </label>
      <label>
        <input type="radio"
          checked={s.valvePosition === "remote"}
          onChange={() => u("valvePosition", "remote")} />
        Vannes déportées
      </label>

      {s.valvePosition === "remote" && (
        <>
          <input type="number" step="any"
            placeholder="Longueur aval vannes (m)"
            value={s.downstreamLength}
            onChange={(e) => u("downstreamLength", e.target.value)} />
          <select
            value={s.downstreamDiameter}
            onChange={(e) => u("downstreamDiameter", e.target.value)}>
            <option value={22}>Ø22</option>
            <option value={32}>Ø32</option>
          </select>
        </>
      )}

      <h2>Objectif</h2>
      <input type="number" step="any"
        placeholder="Vide final (mbar abs)"
        value={s.finalPressure}
        onChange={(e) => u("finalPressure", e.target.value)} />

      <div className="result">
        {time !== null
          ? <>Temps estimé : <strong>{time.toFixed(3)} s</strong></>
          : <>Renseigne les paramètres</>}
      </div>
    </div>
  );
}
``
