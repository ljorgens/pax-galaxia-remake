// game/components/Scoreboard.jsx
import React, { useMemo } from "react";
import { getMirrorGroup, isMirrorPlanet } from "../utils/mirror";

function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n | 0);
}

// Horizontal per-player status strip (original Pax Galaxia style):
// each empire shown in its color as "Ply active/disabled" (human) or "AI active/disabled".
export default function Scoreboard({ planets, packets, players }) {
    const scoreboard = useMemo(() => {
        const { canonIdx } = getMirrorGroup(planets);
        const mirrorCanonId = canonIdx != null ? planets[canonIdx].id : null;

        return players
            .map((pl) => {
                let ships = 0,
                    disabled = 0,
                    inflight = 0;
                for (const p of planets)
                    if (p.owner === pl.id) {
                        if (isMirrorPlanet(p) && p.id !== mirrorCanonId) continue; // shared pool, count once
                        ships += p.ships;
                        disabled += (p.damaged && p.damaged[pl.id]) || 0;
                    }
                for (const f of packets) if (f.owner === pl.id) inflight += f.amount;
                return {
                    id: pl.id,
                    name: pl.name,
                    kind: pl.kind,
                    color: pl.color,
                    active: Math.floor(ships + inflight),
                    disabled: Math.floor(disabled),
                };
            })
            .sort((a, b) => b.active - a.active);
    }, [players, planets, packets]);

    return (
        <div className="w-full max-w-[980px] mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 rounded-xl border border-slate-700/60 bg-slate-900/40 text-sm">
            {scoreboard.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: row.color }} />
                    <span className="font-semibold" style={{ color: row.color }}>
                        {row.kind === "human" ? "Ply" : "AI"}
                    </span>
                    <span className="opacity-80">
                        {row.name}
                        {row.kind === "human" ? " (You)" : ""}
                    </span>
                    <span className="tabular-nums font-semibold">{fmt(row.active)}</span>
                    <span className="tabular-nums text-xs opacity-50">/{fmt(row.disabled)}</span>
                </div>
            ))}
        </div>
    );
}
