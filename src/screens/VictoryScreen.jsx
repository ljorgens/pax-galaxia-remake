import React, { useMemo } from "react";
import Scoreboard from "../game/components/Scoreboard.jsx";

function formatDuration(seconds = 0) {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(Math.round(n));
}

export default function VictoryScreen({
    winnerId,
    players,
    planets,
    packets,
    STAR,
    elapsedSeconds,
    playerStats = {},
    onRematch,
    onNewSeed,
    onBackToMenu,
}) {
    const winner = useMemo(() => players.find((p) => p.id === winnerId) || null, [players, winnerId]);
    const label = winner
        ? `${winner.name}${winner.kind === "human" ? " (You)" : ""} wins!`
        : "Victory!";
    const statsRows = useMemo(
        () =>
            players.map((pl) => {
                const stats = playerStats[pl.id] || { maxArmies: 0, maxPlanets: 0, maxProd: 0 };
                return {
                    id: pl.id,
                    name: pl.kind === "human" ? `${pl.name} (You)` : pl.name,
                    color: pl.color,
                    kind: pl.kind,
                    maxArmies: stats.maxArmies || 0,
                    maxPlanets: stats.maxPlanets || 0,
                    maxProd: stats.maxProd || 0,
                };
            }),
        [players, playerStats]
    );

    return (
        <div className="relative min-h-screen w-full flex items-start justify-center p-6 bg-black text-slate-100">
            <div className="relative z-10 w-full max-w-[980px] text-slate-100 rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-900/70 backdrop-blur-sm p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold">{label}</h1>
                        <p className="text-sm opacity-75 mt-1">
                            Galaxy secured in {formatDuration(elapsedSeconds)}.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={onRematch}
                            className="px-4 py-2 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80"
                        >
                            Play Again (Same Settings)
                        </button>
                        <button
                            onClick={onNewSeed}
                            className="px-4 py-2 rounded-2xl border border-slate-700/80 bg-slate-900/60 hover:bg-slate-800/70"
                        >
                            New Map, Same Settings
                        </button>
                        <button
                            onClick={onBackToMenu}
                            className="px-4 py-2 rounded-2xl border border-slate-700/60 bg-slate-900/50 hover:bg-slate-800/60"
                        >
                            Return to Menu
                        </button>
                    </div>
                </div>

                <div>
                    <h2 className="text-lg font-semibold mb-2">Final Standings</h2>
                    <Scoreboard planets={planets} packets={packets} players={players} STAR={STAR} />
                </div>

                <div>
                    <h2 className="text-lg font-semibold mb-2">Peak Performance</h2>
                    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50">
                        <div className="grid grid-cols-4 px-3 py-2 text-xs uppercase tracking-wide opacity-70">
                            <div>Name</div>
                            <div>Peak Armies</div>
                            <div>Peak Planets</div>
                            <div>Peak Production</div>
                        </div>
                        {statsRows.map((row) => (
                            <div
                                key={row.id}
                                className="grid grid-cols-4 px-3 py-2 items-center text-sm border-t border-slate-700/40"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: row.color }} />
                                    <span>{row.name}</span>
                                </div>
                                <div>{fmt(row.maxArmies)}</div>
                                <div>{row.maxPlanets}</div>
                                <div>{fmt(row.maxProd)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
