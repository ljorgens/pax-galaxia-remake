// game/components/Scoreboard.jsx
import React, { useMemo } from "react";
import { getMirrorGroup, isMirrorPlanet } from "../utils/mirror";

function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n | 0);
}

export default function Scoreboard({ planets, packets, players, STAR }) {
    const scoreboard = useMemo(() => {
        const { canonIdx } = getMirrorGroup(planets);
        const mirrorCanonId = canonIdx != null ? planets[canonIdx].id : null;

        return players
            .map((pl) => {
                let ships = 0,
                    prodRate = 0,
                    inflight = 0;
                for (const p of planets)
                    if (p.owner === pl.id) {
                        if (isMirrorPlanet(p) && p.id !== mirrorCanonId) continue; // shared pool, count once
                        ships += p.ships;
                        prodRate += p.prod * ((STAR[p.starType]?.prod) || 1);
                    }
                for (const f of packets) if (f.owner === pl.id) inflight += f.amount;
                const effectiveProd = prodRate;
                return {
                    id: pl.id,
                    name: pl.name,
                    kind: pl.kind,
                    color: pl.color,
                    armies: Math.floor(ships + inflight),
                    prod: Math.floor(effectiveProd),
                };
            })
            .sort((a, b) => b.armies - a.armies);
    }, [players, planets, packets, STAR]);

    return (
        <div className="w-full max-w-[980px]">
            <div className="mt-2 rounded-xl border border-slate-700/60 bg-slate-900/40">
                <div className="grid grid-cols-4 px-3 py-2 text-xs opacity-70">
                    <div>Name</div>
                    <div>Type</div>
                    <div>Armies</div>
                    <div>Production</div>
                </div>

                {scoreboard.map((row) => (
                    <div
                        key={row.id}
                        className="grid grid-cols-4 px-3 py-1 items-center text-sm border-t border-slate-700/40"
                    >
                        <div className="flex items-center gap-2">
              <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: row.color }}
              />
                            <span>{row.name}</span>
                        </div>
                        <div>{row.kind === "human" ? "Human" : "Computer"}</div>
                        <div className="font-semibold">{fmt(row.armies)}</div>
                        <div>{fmt(row.prod)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
