
// src/ui/Primitives.tsx
import React from "react";

export function Carta({
  carta, onClick, tapada = false, legal = true, style = {}, animFrom = null, mini = false,
}: any) {
  const src = tapada ? "/cartas/dorso.png" : `/cartas/${carta.palo}_${carta.num}.png`;
  const animationName =
    animFrom === 0 ? "from-bottom" :
    animFrom === 1 ? "from-left"   :
    animFrom === 2 ? "from-right"  : null;

  return (
    <img
      src={src}
      alt="carta"
      onClick={legal ? onClick : undefined}
      style={{
        width: mini ? "calc(var(--card-w) * .5)" : "var(--card-w)",
        margin: mini ? 3 : 6,
        cursor: legal ? "pointer" : "not-allowed",
        opacity: legal ? 1 : 0.4,
        borderRadius: 6,
        boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
        animation: animationName ? `${animationName} 260ms ease-out both` : undefined,
        ...style,
      }}
    />
  );
}

export function MesaVisual({ mesa }: any) {
  // Separación suave por asiento para que no se monten
  const posiciones: any = {
    0: { bottom: 8, left: "50%", transform: "translateX(-50%)" },   // J1 abajo, un pelín arriba
    1: { left: 8, top: "50%", transform: "translateY(-50%)" },      // J2 izquierda, un pelín a la derecha
    2: { top: 8, left: "50%", transform: "translateX(-50%)" },      // J3 arriba, un pelín abajo
    3: { right: 8, top: "50%", transform: "translateY(-50%)" },     // J4 derecha, un pelín a la izquierda
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        padding: 10,
        boxSizing: "border-box",
        borderRadius: 12,
        background: "rgba(0,0,0,0.2)",
      }}
    >
      {mesa.map((c: any, i: number) => {
        const animName =
          c.seat === 0 ? "from-bottom" :
          c.seat === 1 ? "from-left"   :
          c.seat === 2 ? "from-top"    :
          c.seat === 3 ? "from-right"  : undefined;
        return (
          <div key={i} style={{ position: "absolute", ...posiciones[c.seat] }}>
            <img
              src={`/cartas/${c.card.palo}_${c.card.num}.png`}
              alt="carta mesa"
              style={{
                width: "var(--mesa-card-w)",
                height: "var(--mesa-card-h)",
                borderRadius: 6,
                boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
                animation: animName ? `${animName} 260ms ease-out both` : undefined,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function PanelTriunfo({ triunfo }: any) {
  const key = triunfo ? `${triunfo.palo}-${triunfo.num}` : "sin-triunfo";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 12px" }}>
      <div
        key={key}
        style={{
          width: 76, height: 106, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.15)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)",
          animation: "pop-in 200ms ease-out both",
        }}
      >
        {triunfo ? <Carta carta={triunfo} legal={false} style={{ width: "var(--npc-card-w)", margin: 0 }} /> : <span style={{ opacity: 0.7 }}>—</span>}
      </div>
      <div>
        <div style={{ fontSize: 14, opacity: 0.9 }}>Muestra (Triunfo)</div>
        <div style={{ fontWeight: "bold" }}>{triunfo ? `${triunfo.num} de ${triunfo.palo}` : "—"}</div>
      </div>
    </div>
  );
}

