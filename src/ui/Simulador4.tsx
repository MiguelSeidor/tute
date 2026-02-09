// src/ui/Simulador4.tsx
import React from "react";
import ReactDOM from "react-dom";
import type { Card, Palo, Seat, Numero, GameEvent } from "../engine/tuteTypes";

// Si tienes StartPreset tipado en tuteTypes, puedes importarlo.
// Para evitar dependencia dura, lo tipeamos inline aquí:
type StartPreset = {
  dealer?: Seat;
  triunfo: Card;
  manos: Partial<Record<Seat, Card[]>>;
  ordenar?: boolean;
  validar?: boolean;
};

const PALOS: Palo[] = ["oros", "copas", "espadas", "bastos"];
const CARTAS: Numero[] = [1, 3, 6, 7, 10, 11, 12];

// ===== Parser flexible (idéntico en espíritu al antiguo) =====
const ABBR: Record<string, Palo> = { o: "oros", c: "copas", e: "espadas", b: "bastos" };
const keyC = (c: Card) => `${c.palo}-${c.num}`;
const ALL_CARDS: Card[] = PALOS.flatMap(p => CARTAS.map(n => ({ palo: p, num: n } as Card)));

function parseTokenToCard(tok: string): Card | null {
  const t = tok.trim().toLowerCase().replace(/[:,]/g, "-").replace(/\s+/g, "-");
  if (!t) return null;
  const parts = t.split("-").filter(Boolean);
  if (parts.length < 2) return null;
  let palo = parts[0];
  if (ABBR[palo]) palo = ABBR[palo];
  const num = Number(parts[1]);
  if (!PALOS.includes(palo as Palo)) return null;
  if (!CARTAS.includes(num as Numero)) return null;
  return { palo: palo as Palo, num: num as Numero };
}

function parseCardsList(s: string): { ok: boolean; cards: Card[]; error?: string } {
const tokens = s
    .split(/[,\n;]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
  const cards: Card[] = [];
  for (const raw of tokens) {
    const card = parseTokenToCard(raw);
    if (!card) {
      const shown = raw.trim() || "(vacío)";
      return { ok: false, cards: [], error: `No reconozco la carta: "${shown}"` };
    }
    cards.push(card);
  }
  return { ok: true, cards };
}

function uniqueCards(arr: Card[]) {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const c of arr) {
    const k = keyC(c);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

function sameCard(a: Card, b: Card) {
  return a.palo === b.palo && a.num === b.num;
}

function ensure28(cards: Card[], triunfo: Card): string | null {
  const usedKeys = new Set(cards.map(keyC).concat(keyC(triunfo)));
  const rest = ALL_CARDS.filter(c => !usedKeys.has(keyC(c)));
  if (rest.length !== 0) {
    return `Con la muestra indicada deben quedar 0 cartas libres; sobran ${rest.length}.`;
  }
  return null;
}

// ===== Componente =====
export function Simulador4({
  visible,
  onClose,
  send,
  defaultDealer,
}: {
  visible: boolean;
  onClose: () => void;
  send: (ev: GameEvent) => void;
  defaultDealer?: Seat;
}) {
  const [simJ0, setSimJ0] = React.useState<string>("");
  const [simJ1, setSimJ1] = React.useState<string>("");
  const [simJ2, setSimJ2] = React.useState<string>("");
  const [simJ3, setSimJ3] = React.useState<string>(""); // dealer (debe ir vacío)
  const [simDealer, setSimDealer] = React.useState<Seat>(defaultDealer ?? (0 as Seat));
  const [simTriModeAuto, setSimTriModeAuto] = React.useState<boolean>(true);
  const [simTriPalo, setSimTriPalo] = React.useState<Palo>("oros");
  const [simTriNum, setSimTriNum] = React.useState<Numero>(7);
  const [simError, setSimError] = React.useState<string>("");

  // Relleno de ejemplo (igual que el antiguo) la primera vez que se abre
  React.useEffect(() => {
    if (!visible) return;
    if (!simJ0 && !simJ1 && !simJ2 && !simJ3) {
      setSimJ0("oros-1, oros-3, oros-12, oros-11, oros-10, oros-7, oros-6, copas-1, copas-3");
      setSimJ1("copas-12, copas-11, copas-10, copas-7, copas-6, espadas-1, espadas-3, espadas-12, espadas-11");
      setSimJ2("espadas-10, espadas-7, espadas-6, bastos-1, bastos-3, bastos-12, bastos-11, bastos-10, bastos-7");
      setSimJ3(""); // dealer vacío por defecto
      setSimDealer(defaultDealer ?? (0 as Seat));
      setSimTriModeAuto(true);
      setSimTriPalo("oros");
      setSimTriNum(7);
    }
  }, [visible, defaultDealer, simJ0, simJ1, simJ2, simJ3]);

  if (!visible) return null;

  function arrancarSimulacion() {
    setSimError("");
    // parsear
    const p0 = parseCardsList(simJ0 || "");
    const p1 = parseCardsList(simJ1 || "");
    const p2 = parseCardsList(simJ2 || "");
    const p3 = parseCardsList(simJ3 || ""); // dealer

    if (!p0.ok) return setSimError(p0.error!);
    if (!p1.ok) return setSimError(p1.error!);
    if (!p2.ok) return setSimError(p2.error!);
    if (!p3.ok) return setSimError(p3.error!);

    const j0 = uniqueCards(p0.cards);
    const j1 = uniqueCards(p1.cards);
    const j2 = uniqueCards(p2.cards);
    const j3 = uniqueCards(p3.cards);

    // dealer sin cartas, el resto 9
    const bySeat = { 0: j0, 1: j1, 2: j2, 3: j3 } as Record<Seat, Card[]>;
    ([0,1,2,3] as Seat[]).forEach(s => {
      const len = bySeat[s].length;
      if (s === simDealer && len !== 0) {
        return setSimError(`El dealer (J${simDealer + 1}) debe tener 0 cartas (tiene ${len}).`);
      } else if (s !== simDealer && len !== 9) {
        return setSimError(`J${s + 1} debe tener 9 cartas (tiene ${len}).`);
      }
    });

    // cartas válidas
    const invalid = [...j0, ...j1, ...j2, ...j3].filter(
      c => !PALOS.includes(c.palo) || !CARTAS.includes(c.num)
    );
    if (invalid.length > 0) {
      return setSimError(`Cartas inválidas: ${invalid.map(keyC).join(", ")}`);
    }

    // duplicados
    const used = [...j0, ...j1, ...j2, ...j3];
    const dupSet = new Set<string>();
    const dups: string[] = [];
    for (const c of used) {
      const k = keyC(c);
      if (dupSet.has(k)) dups.push(k);
      dupSet.add(k);
    }
    if (dups.length > 0) return setSimError(`Cartas duplicadas: ${dups.join(", ")}`);

    // triunfo
    let triunfo: Card | null = null;
    if (simTriModeAuto) {
      const left = ALL_CARDS.filter(c => !used.some(u => sameCard(u, c)));
      if (left.length !== 1) {
        return setSimError(
          `Modo AUTO de muestra requiere que quede exactamente 1 carta libre (quedan ${left.length}).`
        );
      }
      triunfo = left[0];
    } else {
      triunfo = { palo: simTriPalo, num: simTriNum };
      if (used.some(u => sameCard(u, triunfo!))) {
        return setSimError(`La muestra (${keyC(triunfo)}) no puede estar en una mano.`);
      }
      const e = ensure28(used, triunfo);
      if (e) return setSimError(e);
    }

    // construir preset
    const preset: StartPreset = {
      dealer: simDealer,
      triunfo: triunfo!,
      manos: {
        0: bySeat[0],
        1: bySeat[1],
        2: bySeat[2],
        3: bySeat[3], // dealer debe ir []
      },
      ordenar: true,
      validar: true,
    };

    // lanzar
    send({ type: "startRound", preset } as GameEvent);
    onClose();
  }

  // ===== UI idéntica a la antigua (layout/estilos) =====
  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100000,
      }}
    >
      <div
        style={{
          width: "min(960px, 95vw)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#1f4024",
          color: "#fff",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,.25)",
          boxShadow: "0 15px 60px rgba(0,0,0,.6)",
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Simular REO</h2>
        <p style={{ opacity: 0.9, marginTop: 4 }}>
          Introduce <strong>9 cartas por jugador activo</strong> usando formato:
          <code> oros-1, o-3, espadas-10, b-7 </code>.
          Palos admitidos: <code>oros\copas\espadas\bastos</code> o <code>o\c\e\b</code>.
          Números: {CARTAS.join(", ")}.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
          <div>
            <label><strong>J1 (Tú)</strong></label>
            <textarea
              value={simJ0}
              onChange={e => setSimJ0(e.target.value)}
              rows={3}
              style={{ width: "100%", borderRadius: 8, padding: 8 }}
              placeholder="oros-1, oros-3, ..."
            />
          </div>

          <div>
            <label><strong>J2</strong></label>
            <textarea
              value={simJ1}
              onChange={e => setSimJ1(e.target.value)}
              rows={3}
              style={{ width: "100%", borderRadius: 8, padding: 8 }}
              placeholder="copas-12, e-1, ..."
            />
          </div>

          <div>
            <label><strong>J3</strong></label>
            <textarea
              value={simJ2}
              onChange={e => setSimJ2(e.target.value)}
              rows={3}
              style={{ width: "100%", borderRadius: 8, padding: 8 }}
              placeholder="bastos-1, b-3, ..."
            />
          </div>

          <div>
            <label><strong>J4 (Dealer)</strong></label>
            <textarea
              value={simJ3}
              onChange={e => setSimJ3(e.target.value)}
              rows={3}
              style={{ width: "100%", borderRadius: 8, padding: 8 }}
              placeholder="(debe ir vacío: 0 cartas)"
            />
          </div>

          <div>
            <label><strong>Dealer</strong></label>
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              {[0,1,2,3].map(j => (
                <label key={j} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="radio"
                    name="simDealer"
                    checked={simDealer === (j as Seat)}
                    onChange={() => setSimDealer(j as Seat)}
                  />
                  {j === 0 ? "J1 (Tú)" : `J${j + 1}`}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label><strong>Muestra (Triunfo)</strong></label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="radio"
                  name="simTriModo"
                  checked={simTriModeAuto}
                  onChange={() => setSimTriModeAuto(true)}
                />
                Auto (carta restante)
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input
                  type="radio"
                  name="simTriModo"
                  checked={!simTriModeAuto}
                  onChange={() => setSimTriModeAuto(false)}
                />
                Manual:&nbsp;
                <select
                  value={simTriPalo}
                  onChange={e => setSimTriPalo(e.target.value as Palo)}
                  disabled={simTriModeAuto}
                >
                  {PALOS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select
                  value={simTriNum}
                  onChange={e => setSimTriNum(parseInt(e.target.value, 10) as Numero)}
                  disabled={simTriModeAuto}
                >
                  {CARTAS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          </div>
        </div>

        {simError && (
          <p
            style={{
              background: "rgba(255,0,0,.2)",
              border: "1px solid rgba(255,0,0,.4)",
              padding: "8px 10px",
              borderRadius: 8,
              marginTop: 12,
            }}
          >
            ⚠️ {simError}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8 }}>
            Cancelar
          </button>
          <button onClick={arrancarSimulacion} style={{ padding: "8px 14px", borderRadius: 8 }}>
            Comenzar REO simulado
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default Simulador4;