import { useEffect, useMemo, useState } from "react";
import { primaryPumpModels, rootsModels } from "./data/pumps";
import { calculateToolingVolume } from "./utils/toolingVolume";
import { calculateNetwork } from "./utils/network";

const STORAGE_KEY = "vacuum-multivac-state";

/* Utilitaire : accepte virgule OU point */
function parseNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  return Number(String(value).replace(",", "."));
}

export default function App() {
  const [s, setS] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (
      (saved && JSON.parse(saved)) || {
        laize: "",
        pitch: "",
        depth: "",
        hasFillers: false,
        fillerThickness: "",

        sourceType: "network",
        pumpModel: "Busch R5 RA 0250",
        networkPressure: 30,

        rootsModel: "Aucune",

        mainLength: "",
        rootsLength: "3",
        distributionType: "close",
        distributionLength: "",
        distributionDiameter: 32,

        smallBendsBefore: "0",
        largeBendsBefore: "0",
        smallBendsAfter: "0",
        largeBendsAfter: "0",

        finalPressure: "80"
      }
    );
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, [s]);

  const update = (k, v) => setS((prev) => ({ ...prev, [k]: v }));

  /* ───────── VOLUME OUTILLAGE ───────── */

  const toolingVolume = useMemo(
    () =>
      calculateToolingVolume({
        laize: parseNumber(s.laize),
        pitch: parseNumber(s.pitch),
        depth: parseNumber(s.depth),
        hasFillers: s.hasFillers,
        fillerThickness: parseNumber(s.fillerThickness)
      }),
    [s]
  );

  /* ───────── RÉSEAU ───────── */

  const network = useMemo(
    () =>
      calculateNetwork({
        mainLength: parseNumber(s.mainLength),
        mainDiameter: 60,
        hasRoots: s.rootsModel !== "Aucune",
        rootsLength: parseNumber(s.rootsLength),
        distributionType: s.distributionType,
        distributionLength: parseNumber(s.distributionLength),
        distributionDiameter: parseNumber(s.distributionDiameter),
        smallBendsBefore: parseNumber(s.smallBendsBefore),
        largeBendsBefore: parseNumber(s.largeBendsBefore),
        smallBendsAfter: parseNumber(s.smallBendsAfter),
        largeBendsAfter: parseNumber(s.largeBendsAfter)
      }),
    [s]
  );

  const totalVolume = toolingVolume + network.volume;

  /* ───────── DÉBIT SOURCE ───────── */

  function sourceFlow(p) {
    if (s.sourceType === "pump") {
      return primaryPumpModels[s.pumpModel]?.flow(p) || 0;
    }
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

  /* ───────── TEMPS (CONTINU) ───────── */

  const time = useMemo(() => {
    if (totalVolume <= 0) return null;

    const pStart = 1000;
    const pEnd = parseNumber(s.finalPressure);
    if (pEnd <= 0 || pEnd >= pStart) return null;

    const steps = 30;
    let t = 0;
    let p = pStart;
    const dp = (Math.log(pStart) - Math.log(pEnd)) / steps;

    for (let i = 0; i < steps; i++) {
      const pNext = Math.exp(Math.log(p) - dp);
      const q =
        (sourceFlow(p) * rootsGain(p)) /
        Math.max(network.penalty, 1);

      if (q > 0) {
        t += (totalVolume / q) * Math.log(p / pNext) * 3600;
      }
      p = pNext;
    }

    return isFinite(t) ? t : null;
  }, [totalVolume, s, network]);

  /* ───────── UI ───────── */

  return (
    <div className="app">
      <h1>Calculateur Vide Multivac</h1>

      <h2>Outillage</h2>
      <input placeholder="Laize (mm)" value={s.laize} onChange={(e) => update("laize", e.target.value)} />
      <input placeholder="Pas d’avance (mm)" value={s.pitch} onChange={(e) => update("pitch", e.target.value)} />
      <input placeholder="Profondeur (mm)" value={s.depth} onChange={(e) => update("depth", e.target.value)} />

      <label>
        <input type="checkbox" checked={s.hasFillers} onChange={(e) => update("hasFillers", e.target.checked)} />
        Cales de remplissage
      </label>

      {s.hasFillers && (
        <input placeholder="Épaisseur cales (mm)" value={s.fillerThickness} onChange={(e) => update("fillerThickness", e.target.value)} />
      )}

      <div className="result light">
        Volume outillage : <strong>{toolingVolume.toFixed(4)} m³</strong>
      </div>

      <h2>Source de vide</h2>
      <label><input type="radio" checked={s.sourceType === "network"} onChange={() => update("sourceType", "network")} /> Réseau</label>
      <label><input type="radio" checked={s.sourceType === "pump"} onChange={() => update("sourceType", "pump")} /> Pompe locale</label>

      {s.sourceType === "pump" && (
        <select value={s.pumpModel} onChange={(e) => update("pumpModel", e.target.value)}>
          {Object.keys(primaryPumpModels).map((p) => <option key={p}>{p}</option>)}
        </select>
      )}

      <h2>Roots</h2>
      <select value={s.rootsModel} onChange={(e) => update("rootsModel", e.target.value)}>
        {Object.keys(rootsModels).map((r) => <option key={r}>{r}</option>)}
      </select>

      <h2>Réseau de vide</h2>
      <input placeholder="Longueur pompe → distributeur (m)" value={s.mainLength} onChange={(e) => update("mainLength", e.target.value)} />

      {s.rootsModel !== "Aucune" && (
        <input placeholder="Longueur Roots → distributeur (m)" value={s.rootsLength} onChange={(e) => update("rootsLength", e.target.value)} />
      )}

      <h3>Coudes</h3>
      <input placeholder="Petits rayons AVANT Roots" value={s.smallBendsBefore} onChange={(e) => update("smallBendsBefore", e.target.value)} />
      <input placeholder="Grands rayons AVANT Roots" value={s.largeBendsBefore} onChange={(e) => update("largeBendsBefore", e.target.value)} />

      {s.rootsModel !== "Aucune" && (
        <>
          <input placeholder="Petits rayons APRÈS Roots" value={s.smallBendsAfter} onChange={(e) => update("smallBendsAfter", e.target.value)} />
          <input placeholder="Grands rayons APRÈS Roots" value={s.largeBendsAfter} onChange={(e) => update("largeBendsAfter", e.target.value)} />
        </>
      )}

      <h2>Objectif</h2>
      <input placeholder="Vide final (mbar abs)" value={s.finalPressure} onChange={(e) => update("finalPressure", e.target.value)} />

      <div className="result">
        {time !== null ? (
          <>Temps estimé : <strong>{time.toFixed(3)} s</strong></>
        ) : (
          <>Renseigne les champs pour calculer</>
        )}
      </div>
    </div>
  );
}
