// game/components/GameCanvas.jsx
import React, { useMemo } from "react";
import { Delaunay } from "d3-delaunay"; // only if you want to compute here; we receive vor/edgeSegs via props
// We accept vor/edgeSegs precomputed to avoid rework.

function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n | 0);
}
function fontScale(v) {
    const val = Math.max(1, v || 0);
    const s = 12 + 4 * Math.log10(val);
    return Math.max(12, Math.min(28, s));
}
function fontScaleLane(v) {
    const val = Math.max(1, v || 0);
    const s = 11 + 2.5 * Math.log10(val);
    return Math.max(11, Math.min(20, s));
}
function lerp(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function isNeighbor(a, b) {
    return a.neighbors.includes(b.id);
}

export default function GameCanvas({
                                       planets,
                                       packets,
                                       players,
                                       selected,
                                       onPlanetClick,
                                       STAR,
                                       TYPE_COLORS,
                                       WIDTH,
                                       HEIGHT,
                                       RADIUS,
                                       vor,
                                       edgeSegs,
                                       byId,
                                       displayShips,
                                       elapsed,
                                       ownerColorsOverride, // optional
                                       starfield, // optional precomputed array of {x,y,r,o}
                                       battleStats = {},
                                   }) {
    const ownerColor = (o) =>
        o === "neutral"
            ? "#9aa1ac"
            : (players.find((pl) => pl.id === o)?.color ||
                (ownerColorsOverride ? ownerColorsOverride[o] : "#fff"));
    const ownerLabel = (o) => {
        if (o === "neutral") return "Neutral";
        const pl = players.find((player) => player.id === o);
        if (!pl) return o;
        return pl.kind === "human" ? `${pl.name} (You)` : pl.name;
    };

    // Build cell polygons map from passed vor
    const cellPolys = useMemo(() => {
        const polys = new Map();
        for (let i = 0; i < planets.length; i++) {
            const path = vor.cellPolygon(i);
            if (!path || !path.length) continue;
            polys.set(
                planets[i].id,
                path.map(([x, y]) => ({ x, y }))
            );
        }
        return polys;
    }, [vor, planets]);

    // Flow totals along lanes (for the mid-lane numbers)
    const flowTotals = useMemo(() => {
        const m = new Map();
        for (const f of packets) {
            const key = `${f.from}-${f.to}-${f.owner}`;
            m.set(key, (m.get(key) || 0) + f.amount);
        }
        return m;
    }, [packets]);

    // Simple fallback starfield if not provided (deterministic-ish)
    const fallbackStars = useMemo(() => {
        if (starfield) return starfield;
        const N = 160;
        const out = [];
        let seed = planets.length * 1337 + 17;
        const rng = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 2 ** 32;
        };
        for (let i = 0; i < N; i++) {
            out.push({
                x: rng() * WIDTH,
                y: rng() * HEIGHT,
                r: 0.4 + rng() * 1.0,
                o: 0.25 + rng() * 0.65,
            });
        }
        return out;
    }, [starfield, planets.length, WIDTH, HEIGHT]);

    return (
        <svg
            width={WIDTH}
            height={HEIGHT}
            className="rounded-xl shadow border"
            style={{
                background:
                    "radial-gradient(ellipse at 40% 50%, #0b1b38 0%, #091426 55%, #07101f 100%)",
            }}
        >
            <defs>
                <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <filter id="arrowGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.8" result="g" />
                    <feMerge>
                        <feMergeNode in="g" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                {Object.entries(TYPE_COLORS).map(([k, c]) => (
                    <radialGradient id={`core-${k}`} key={k} cx="50%" cy="50%" r="60%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                        <stop offset="45%" stopColor={c} stopOpacity="0.95" />
                        <stop offset="100%" stopColor={c} stopOpacity="1" />
                    </radialGradient>
                ))}

                <filter id="laneGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="lg" />
                    <feMerge>
                        <feMergeNode in="lg" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* background stars */}
            <g style={{ pointerEvents: "none" }}>
                {(fallbackStars || []).map((s, i) => (
                    <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cbd5e1" opacity={s.o} />
                ))}
            </g>

            {/* ownership fills (clipped to per-cell polygons) */}
            {players.map((pl) => {
                // group contiguous components per owner (simple fill by cells is fine visually)
                return (
                    <g key={"fills-" + pl.id} opacity={0.14} fill={ownerColor(pl.id)}>
                        {planets.map((star) => {
                            if (star.owner !== pl.id) return null;
                            const poly = cellPolys.get(star.id);
                            if (!poly || !poly.length) return null;
                            const d = `M${poly.map((p) => `${p.x},${p.y}`).join("L")}Z`;
                            return <path key={star.id} d={d} />;
                        })}
                    </g>
                );
            })}

            {/* black gap along inter-owner Voronoi edges */}
            <g stroke="#07101f" strokeWidth={8} strokeOpacity={1}>
                {edgeSegs.map((s, idx) => {
                    const A = planets[s.i],
                        B = planets[s.j];
                    if (!A || !B || A.owner === B.owner) return null;
                    return <line key={"gap-" + idx} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />;
                })}
            </g>

            {/* colored borders offset to each side */}
            <g>
                {edgeSegs.map((s, idx) => {
                    const A = planets[s.i],
                        B = planets[s.j];
                    if (!A || !B || A.owner === B.owner) return null;
                    const dx = s.x2 - s.x1,
                        dy = s.y2 - s.y1;
                    const L = Math.hypot(dx, dy) || 1;
                    const nx = -dy / L,
                        ny = dx / L; // unit normal
                    const push = 2.2,
                        w = 3.5;
                    return (
                        <g key={"edge-" + idx} strokeWidth={w} strokeOpacity={0.98}>
                            <line
                                x1={s.x1 + nx * push}
                                y1={s.y1 + ny * push}
                                x2={s.x2 + nx * push}
                                y2={s.y2 + ny * push}
                                stroke={ownerColor(A.owner)}
                            />
                            <line
                                x1={s.x1 - nx * push}
                                y1={s.y1 - ny * push}
                                x2={s.x2 - nx * push}
                                y2={s.y2 - ny * push}
                                stroke={ownerColor(B.owner)}
                            />
                        </g>
                    );
                })}
            </g>

            {/* hyperlanes */}
            {planets.map((a) =>
                a.neighbors.map((id) => {
                    const b = byId[id];
                    if (!b || a.id > b.id) return null;
                    const dx = b.x - a.x,
                        dy = b.y - a.y;
                    const L = Math.hypot(dx, dy) || 1;
                    const ux = dx / L,
                        uy = dy / L;
                    const sx = a.x + ux * (RADIUS + 2),
                        sy = a.y + uy * (RADIUS + 2);
                    const tx = b.x - ux * (RADIUS + 2),
                        ty = b.y - uy * (RADIUS + 2);
                    return (
                        <line
                            key={`lane-${a.id}-${b.id}`}
                            x1={sx}
                            y1={sy}
                            x2={tx}
                            y2={ty}
                            stroke="#9fb8ff"
                            strokeOpacity={0.75}
                            strokeWidth={2.2}
                            strokeDasharray="2 7"
                            filter="url(#laneGlow)"
                        />
                    );
                })
            )}

            {/* route indicators + flow amounts */}
            {planets.map((p) => {
                if (!p.routeTo || !p.neighbors.includes(p.routeTo)) return null;
                const a = p,
                    b = byId[p.routeTo];
                if (!b) return null;
                const ownerCol = ownerColor(p.owner);
                const dx = b.x - a.x,
                    dy = b.y - a.y;
                const L = Math.hypot(dx, dy) || 1;
                const ux = dx / L,
                    uy = dy / L;
                const sx = a.x + ux * (RADIUS + 2),
                    sy = a.y + uy * (RADIUS + 2);
                const tx = b.x - ux * (RADIUS + 2),
                    ty = b.y - uy * (RADIUS + 2);
                const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                const isCombat = (b.invaders && (b.invaders[p.owner] || 0) > 0) || b.owner !== p.owner;
                const arrowCol = isCombat ? "#ff4d4d" : "#ffffff";
                const reps = [];
                for (let i = 1; i <= 3; i++) {
                    const t = i / (3 + 1);
                    const pos = lerp(a, b, t);
                    reps.push(
                        <polygon
                            key={i}
                            points="0,0 12,6 0,12"
                            transform={`translate(${pos.x - 6},${pos.y - 6}) rotate(${angle},6,6)`}
                            fill={arrowCol}
                            opacity={0.95}
                            filter="url(#arrowGlow)"
                        />
                    );
                }
                // flow labels
                const amt = flowTotals.get(`${p.id}-${b.id}-${p.owner}`);
                const midx = (sx + tx) / 2,
                    midy = (sy + ty) / 2;

                return (
                    <g key={`route-${p.id}-${b.id}`}>
                        <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={ownerCol} strokeOpacity="0.85" strokeWidth={2.6} />
                        {reps}
                        {amt ? (
                            <>
                                <text
                                    x={midx}
                                    y={midy - 8}
                                    textAnchor="middle"
                                    fontSize={fontScaleLane(amt)}
                                    fill="#000"
                                    stroke="#000"
                                    strokeWidth="3"
                                    opacity={0.5}
                                >
                                    {Math.floor(amt)}
                                </text>
                                <text x={midx} y={midy - 8} textAnchor="middle" fontSize={fontScaleLane(amt)} fill="#fff">
                                    {Math.floor(amt)}
                                </text>
                            </>
                        ) : null}
                    </g>
                );
            })}

            {/* moving packets */}
            {packets.map((f) => {
                const a = byId[f.from];
                const b = byId[f.to];
                if (!a || !b) return null;
                const pos = lerp(a, b, Math.min(1, f.t));
                const color = ownerColor(f.owner);
                return <circle key={f.id} cx={pos.x} cy={pos.y} r={4.0} fill={color} filter="url(#softGlow)" />;
            })}

            {/* stars */}
            {planets.map((p) => {
                const neighborHighlight = selected && isNeighbor(selected, p);
                const under = Object.keys(p.invaders).some((k) => k !== p.owner && p.invaders[k] > 0);
                const battle = battleStats?.[p.id];
                return (
                    <g
                        key={p.id}
                        onClick={() => onPlanetClick && onPlanetClick(p)}
                        style={{
                            cursor: selected && (neighborHighlight || (selected && selected.id === p.id)) ? "pointer" : "default",
                        }}
                    >
                        <circle
                            cx={p.x}
                            cy={p.y}
                            r={RADIUS}
                            fill={`url(#core-${p.starType})`}
                            stroke={selected?.id === p.id ? "#fff" : "#0a0e1a"}
                            strokeWidth={selected?.id === p.id ? 3 : 2}
                        />
                        {selected && isNeighbor(selected, p) && (
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={RADIUS + 16}
                                fill="none"
                                stroke="#9ac1ff"
                                strokeOpacity={0.9}
                                strokeWidth={2}
                                strokeDasharray="2 6"
                            />
                        )}
                        {under && (
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={RADIUS + 18}
                                fill="none"
                                stroke="#ffffff"
                                strokeOpacity={0.9}
                                strokeWidth={2}
                                strokeDasharray="1 5"
                            />
                        )}

                        {/* ship count */}
                        <text x={p.x} y={p.y - 28} textAnchor="middle" fontSize={fontScale(p.ships)} fill="#e6edf7">
                            {fmt(Math.floor(displayShips(p, byId, planets)))}
                        </text>

                        {/* damaged/production */}
                        <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize={11} fill="#e6edf7">
                            {`${fmt(Math.floor((p.damaged && p.damaged[p.owner]) || 0))}/${Math.max(
                                1,
                                Math.round(p.prod * (p.starType === "Y" ? 2 : 1) * 10) / 10
                            )}`}
                        </text>

                        {battle?.attackers?.length
                            ? battle.attackers
                                  .slice()
                                  .sort((a, b) => b.ships - a.ships)
                                  .map((attacker, idx) => (
                                      <text
                                          key={`${p.id}-atk-${attacker.ownerId}`}
                                          x={p.x}
                                          y={p.y + RADIUS + 18 + idx * 12}
                                          textAnchor="middle"
                                          fontSize={11}
                                          fill={ownerColor(attacker.ownerId)}
                                      >
                                          {`Atk ${fmt(Math.floor(attacker.ships))} – ${ownerLabel(attacker.ownerId)}`}
                                      </text>
                                  ))
                            : null}
                    </g>
                );
            })}

            {/* elapsed time */}
            <text x={40} y={26} textAnchor="start" fontSize="14" fill="#e6edf7">
                {formatTime(elapsed)}
            </text>
        </svg>
    );
}

function formatTime(sec) {
    const m = Math.floor(sec / 60),
        s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}
