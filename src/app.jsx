import { useEffect, useMemo, useState } from "react";
import { primaryPumpModels, rootsModels } from "./data/pumps";
import { calculateToolingVolume } from "./utils/toolingVolume";
import { calculateNetwork } from "./utils/network";

/* ────────────────────────────── */
/* CONFIG */
/* ────────────────────────────── */

const STORAGE_KEY = "vacuum-multivac-state";

/* ────────────────────────────── */
/* APP */
/* ────────────────────────────── */

export default function App() {
  /* ───────── STATE (persisté) ───────── */

  const [state, setState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (
      (saved && JSON.parse(saved)) || {
        /* Outillage */
        laize: "",
        pitch: "",
        depth: "",
        hasFillers: false,
        fillerThickness: "",

        /* Source de vide */
        sourceType: "network", // network | pump
        networkPressure: 30, // mbar
        pumpModel: "Busch R5 RA 0250",

        /* Roots */
        rootsModel: "Aucune",

        /* Réseau */
        mainLength: 0,
        rootsLength: 3,
        distributionType: "close", // close | remote
        distributionLength: 0,
        distributionDiameter: 32,
        smallBendsBefore: 0,
        largeBendsBefore: 0,
        smallBendsAfter: 0,
        largeBendsAfter: 0,

        /* Objectif */
        finalPressure: 80
      }
    );
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const update = (k, v) => setState((s) => ({ ...s, [k]: v }));

  /* ───────── CALCUL VOLUME ───────── */

  const toolingVolume = useMemo(
    () => calculateToolingVolume(state),
    [state]
  );

  /* ───────── CALCUL RÉSEAU ───────── */

  const network = useMemo(
    () =>
      calculateNetwork({
        mainLength: state.mainLength,
        mainDiameter: 60,
        hasRoots: state.rootsModel !== "Aucune",
        rootsLength: state.rootsLength,
        distributionType: state.distributionType,
        distributionLength: state.distributionLength,
        distributionDiameter: state.distributionDiameter,
        smallBendsBefore: state.smallBendsBefore,
        largeBendsBefore: state.largeBendsBefore,
        smallBendsAfter: state.smallBendsAfter,
        largeBendsAfter: state.largeBendsAfter
      }),
    [state]
  );

  const totalVolume = toolingVolume + network.volume;

  /* ───────── DÉBIT SOURCE ───────── */

  function sourceFlow(p) {
    if (state.sourceType === "pump") {
      return primaryPumpModels[state.pumpModel]?.flow(p) || 0;
    }
    // réseau générique Multivac (approximation terrain)
    if (p > 100) return 0.12;
    if (p > 40) return 0.10;
    if (p > 10) return 0.07;
    return 0.05;
  }

  /* ───────── ROOTS ───────── */

  function rootsGain(p) {
    const model = rootsModels[state.rootsModel];
    if (!model || !model.enabled) return 1;
    return model.gain(p);
  }

  /* ───────── TEMPS DE VIDE ───────── */

  const time = useMemo(() => {
    if (totalVolume <= 0) return null;

    const pStart = 1000;
    const pEnd = state.finalPressure;
    const steps = 30;
    let t = 0;
    let p = pStart;
    const dp = (Math.log(pStart) - Math.log(pEnd)) / steps;

    for (let i = 0; i < steps; i++) {
      const pNext = Math.exp(Math.log(p) - dp);
      const q =
        (sourceFlow(p) * rootsGain(p)) / Math.max(network.penalty, 1);
      if (q > 0) {
        t += (totalVolume / q) * Math.log(p / pNext) * 3600;
      }
      p = pNext;
    }

    return isFinite(t) ? t : null;
  }, [totalVolume, state, network]);

  /* ───────── UI ───────── */

  return (
    <div className="app">
      <h1>Calculateur Vide Multivac</h1>

      {/* ───────── OUTILLAGE ───────── */}
      <h2>Outillage</h2>

      <input
        placeholder="Laize (mm)"
        value={state.laize}
        onChange={(e) => update("laize", +e.target.value)}
      />
      <input
        placeholder="Pas d’avance (mm)"
        value={state.pitch}
        onChange={(e) => update("pitch", +e.target.value)}
      />
      <input
        placeholder="Profondeur (mm)"
        value={state.depth}
        onChange={(e) => update("depth", +e.target.value)}
      />

      <label>
        <input
          type="checkbox"
          checked={state.hasFillers}
          onChange={(e) => update("hasFillers", e.target.checked)}
        />
        Cales de remplissage
      </label>

      {state.hasFillers && (
        <input
          placeholder="Épaisseur cales (mm)"
          value={state.fillerThickness}
          onChange={(e) => update("fillerThickness", +e.target.value)}
        />
      )}

      <div className="result light">
        Volume outillage : <strong>{toolingVolume.toFixed(4)} m³</strong>
      </div>

      {/* ───────── SOURCE DE VIDE ───────── */}
      <h2>Source de vide</h2>

      <label>
        <input
          type="radio"
          checked={state.sourceType === "network"}
          onChange={() => update("sourceType", "network")}
        />
        Réseau de vide
      </label>

      <label>
        <input
          type="radio"
          checked={state.sourceType === "pump"}
          onChange={() => update("sourceType", "pump")}
        />
        Pompe locale
      </label>

      {state.sourceType === "network" && (
        <input
          placeholder="Pression réseau (mbar)"
          value={state.networkPressure}
          onChange={(e) => update("networkPressure", +e.target.value)}
        />
      )}

      {state.sourceType === "pump" && (
        <select
          value={state.pumpModel}
          onChange={(e) => update("pumpModel", e.target.value)}
        >
          {Object.keys(primaryPumpModels).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      )}

      {/* ───────── ROOTS ───────── */}
      <h2>Roots</h2>

      <select
        value={state.rootsModel}
        onChange={(e) => update("rootsModel", e.target.value)}
      >
        {Object.keys(rootsModels).map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>

      {/* ───────── RÉSEAU ───────── */}
      <h2>Réseau de vide</h2>

      <input
        placeholder="Longueur pompe → distributeur (m)"
        value={state.mainLength}
        onChange={(e) => update("mainLength", +e.target.value)}
      />

      {state.rootsModel !== "Aucune" && (
        <input
          placeholder="Longueur Roots → distributeur (m)"
          value={state.rootsLength}
          onChange={(e) => update("rootsLength", +e.target.value)}
        />
      )}

      <label>
        <input
          type="radio"
          checked={state.distributionType === "close"}
          onChange={() => update("distributionType", "close")}
        />
        Blocs proches outillage (+4 m)
      </label>

      <label>
        <input
          type="radio"
          checked={state.distributionType === "remote"}
          onChange={() => update("distributionType", "remote")}
        />
        Vannes déportées
      </label>

      {state.distributionType === "remote" && (
        <input
          placeholder="Longueur distribution (m)"
          value={state.distributionLength}
          onChange={(e) => update("distributionLength", +e.target.value)}
        />
      )}

      <select
        value={state.distributionDiameter}
        onChange={(e) => update("distributionDiameter", +e.target.value)}
      >
        <option value={22}>Ø22</option>
        <option value={32}>Ø32</option>
      </select>

      {/* ───────── OBJECTIF ───────── */}
      <h2>Objectif</h2>

      <input
        placeholder="Vide final (mbar abs)"
        value={state.finalPressure}
        onChange={(e) => update("finalPressure", +e.target.value)}
      />

      {/* ───────── RÉSULTAT ───────── */}
      <div className="result">
        {time !== null ? (
          <>
            Temps estimé : <strong>{time.toFixed(3)} s</strong>
          </>
        ) : (
          <>Renseigne l’outillage pour calculer le temps</>
        )}
      </div>
    </div>
  );
}
