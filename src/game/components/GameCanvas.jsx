// game/components/GameCanvas.jsx
import React, { useMemo, useRef, useState } from "react";
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
// quantized point key so shared Voronoi vertices match exactly
function keyPt(x, y) {
    return `${Math.round(x * 100)}:${Math.round(y * 100)}`;
}
// Chaikin corner-cutting on a closed loop → smooth, slightly inset outline
function chaikin(pts, iters) {
    let p = pts;
    for (let k = 0; k < iters; k++) {
        const out = [];
        const n = p.length;
        for (let i = 0; i < n; i++) {
            const a = p[i],
                b = p[(i + 1) % n];
            out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
            out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        }
        p = out;
    }
    return p;
}
// Dissolve each owner's Voronoi cells into smooth boundary loops:
// keep only edges that belong to a single owned cell (territory boundary),
// stitch them into closed loops, then smooth. Neutral systems get no hull.
function ownerBoundaryLoops(planets, cellPolys, pad = 64) {
    const byOwner = new Map();
    const posById = new Map();
    for (const star of planets) {
        posById.set(star.id, { x: star.x, y: star.y });
        if (!star.owner || star.owner === "neutral") continue;
        if (!byOwner.has(star.owner)) byOwner.set(star.owner, []);
        byOwner.get(star.owner).push(star.id);
    }

    const result = new Map();
    for (const [owner, ids] of byOwner) {
        // owned star positions, to clamp the outer boundary to a constant padding
        const pts = ids.map((id) => posById.get(id)).filter(Boolean);
        const clampToPad = (v) => {
            let best = Infinity,
                bx = v.x,
                by = v.y;
            for (const s of pts) {
                const d = (v.x - s.x) ** 2 + (v.y - s.y) ** 2;
                if (d < best) {
                    best = d;
                    bx = s.x;
                    by = s.y;
                }
            }
            const dist = Math.sqrt(best);
            if (dist <= pad) return v;
            const t = pad / dist;
            return { x: bx + (v.x - bx) * t, y: by + (v.y - by) * t };
        };
        const edges = new Map(); // edgeKey -> { a, b, count }
        for (const id of ids) {
            const poly = cellPolys.get(id);
            if (!poly || poly.length < 2) continue;
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i],
                    b = poly[(i + 1) % poly.length];
                const ka = keyPt(a.x, a.y),
                    kb = keyPt(b.x, b.y);
                if (ka === kb) continue;
                const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
                const ex = edges.get(ek);
                if (ex) ex.count++;
                else edges.set(ek, { a, b, count: 1 });
            }
        }

        const boundary = [];
        for (const e of edges.values()) if (e.count === 1) boundary.push(e);
        if (!boundary.length) continue;

        const adj = new Map(); // ptKey -> [edgeIndex...]
        boundary.forEach((e, i) => {
            const ka = keyPt(e.a.x, e.a.y),
                kb = keyPt(e.b.x, e.b.y);
            if (!adj.has(ka)) adj.set(ka, []);
            if (!adj.has(kb)) adj.set(kb, []);
            adj.get(ka).push(i);
            adj.get(kb).push(i);
        });

        const used = new Array(boundary.length).fill(false);
        const loops = [];
        for (let start = 0; start < boundary.length; start++) {
            if (used[start]) continue;
            const loop = [];
            let curEdge = start;
            let curKey = keyPt(boundary[start].a.x, boundary[start].a.y);
            let guard = 0;
            while (curEdge != null && !used[curEdge] && guard++ < boundary.length + 5) {
                used[curEdge] = true;
                const e = boundary[curEdge];
                const ka = keyPt(e.a.x, e.a.y);
                const nextPt = ka === curKey ? e.b : e.a;
                const nextKey = keyPt(nextPt.x, nextPt.y);
                loop.push(nextPt);
                const cand = (adj.get(nextKey) || []).find((ei) => ei !== curEdge && !used[ei]);
                curEdge = cand != null ? cand : null;
                curKey = nextKey;
            }
            if (loop.length >= 3) loops.push(chaikin(loop.map(clampToPad), 2));
        }
        if (loops.length) result.set(owner, loops);
    }
    return result;
}

export default function GameCanvas({
                                       planets,
                                       packets,
                                       players,
                                       selected,
                                       onPlanetClick,
                                       onCommitRoute,
                                       onSelectStar,
                                       onClearSelection,
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
            ? "#ffffff" // original: neutral systems read as white
            : (players.find((pl) => pl.id === o)?.color ||
                (ownerColorsOverride ? ownerColorsOverride[o] : "#fff"));
    const ownerLabel = (o) => {
        if (o === "neutral") return "Neutral";
        const pl = players.find((player) => player.id === o);
        if (!pl) return o;
        return pl.kind === "human" ? `${pl.name} (You)` : pl.name;
    };

    const meId = useMemo(
        () => players.find((pl) => pl.kind === "human")?.id,
        [players]
    );

    // Drag-to-route: hold on one of your stars and drag across a path of stars
    // you control to chain supply orders (original Pax Galaxia gesture).
    const [dragPath, setDragPath] = useState([]);
    const draggingRef = useRef(false);
    const movedRef = useRef(false);

    const startDrag = (p) => {
        if (p.owner !== meId) return;
        draggingRef.current = true;
        movedRef.current = false;
        setDragPath([p.id]);
    };
    const extendDrag = (p) => {
        if (!draggingRef.current) return;
        setDragPath((prev) => {
            if (!prev.length) return prev;
            const last = prev[prev.length - 1];
            if (last === p.id || prev.includes(p.id)) return prev; // no loops
            const lastPlanet = byId[last];
            if (!lastPlanet || !lastPlanet.neighbors.includes(p.id)) return prev; // must be adjacent
            movedRef.current = true;
            return [...prev, p.id];
        });
    };
    const endDrag = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setDragPath((prev) => {
            if (prev.length >= 2) {
                const pairs = [];
                for (let i = 0; i < prev.length - 1; i++) pairs.push([prev[i], prev[i + 1]]);
                onCommitRoute && onCommitRoute(pairs);
            }
            return [];
        });
    };
    // Swallow the click that fires after a real drag so it doesn't re-trigger select/route.
    const handleClick = (p) => {
        if (movedRef.current) {
            movedRef.current = false;
            return;
        }
        onPlanetClick && onPlanetClick(p);
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

    // Smooth owner territory outlines (organic empire blobs, original-style)
    const ownerLoops = useMemo(() => ownerBoundaryLoops(planets, cellPolys), [planets, cellPolys]);

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
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onClick={() => onClearSelection && onClearSelection()}
            onContextMenu={(e) => { e.preventDefault(); onClearSelection && onClearSelection(); }}
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

            {/* smooth owner territory outlines — dissolved Voronoi hulls, rounded
                (organic empire blobs in the owner's color, original Pax Galaxia style) */}
            {[...ownerLoops.entries()].map(([owner, loops]) => {
                const col = ownerColor(owner);
                const d = loops
                    .map((loop) => `M${loop.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join("L")}Z`)
                    .join(" ");
                return (
                    <path
                        key={"hull-" + owner}
                        d={d}
                        fill={col}
                        fillOpacity={0.07}
                        fillRule="evenodd"
                        stroke={col}
                        strokeOpacity={0.85}
                        strokeWidth={2}
                        strokeLinejoin="round"
                    />
                );
            })}

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
                            stroke="#ffffff"
                            strokeOpacity={0.55}
                            strokeWidth={2}
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
                // flow labels
                const amt = flowTotals.get(`${p.id}-${b.id}-${p.owner}`);
                const midx = (sx + tx) / 2,
                    midy = (sy + ty) / 2;

                return (
                    <g key={`route-${p.id}-${b.id}`}>
                        <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={ownerCol} strokeOpacity="0.85" strokeWidth={2.6} />
                        {/* directional chevrons along the supply line (original style) */}
                        {(() => {
                            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                            const n = 2;
                            const chevs = [];
                            for (let i = 1; i <= n; i++) {
                                const t = i / (n + 1);
                                const cx = sx + (tx - sx) * t;
                                const cy = sy + (ty - sy) * t;
                                chevs.push(
                                    <polyline
                                        key={i}
                                        points="-3,-4 3,0 -3,4"
                                        fill="none"
                                        stroke={ownerCol}
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        opacity={0.95}
                                        transform={`translate(${cx},${cy}) rotate(${angle})`}
                                    />
                                );
                            }
                            return chevs;
                        })()}
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

            {/* in-progress drag route */}
            {dragPath.length >= 2 &&
                dragPath.slice(1).map((id, idx) => {
                    const a = byId[dragPath[idx]];
                    const b = byId[id];
                    if (!a || !b) return null;
                    return (
                        <line
                            key={`drag-${idx}`}
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={ownerColor(meId)}
                            strokeWidth={3.5}
                            strokeOpacity={0.95}
                            strokeDasharray="6 4"
                        />
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
                return (
                    <g
                        key={p.id}
                        onPointerDown={() => startDrag(p)}
                        onPointerEnter={() => extendDrag(p)}
                        onClick={(e) => { e.stopPropagation(); handleClick(p); }}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onSelectStar && onSelectStar(p); }}
                        style={{
                            cursor: p.owner === meId || (selected && neighborHighlight) ? "pointer" : "default",
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

                        {/* ship count beneath the star, colored by owner (original style):
                            total, or total/damaged when some ships are damaged */}
                        {(() => {
                            const total = Math.floor(displayShips(p, byId, planets));
                            const dmg = Math.floor((p.damaged && p.damaged[p.owner]) || 0);
                            const label = dmg > 0 ? `${fmt(total)}/${fmt(dmg)}` : fmt(total);
                            const fy = p.y + RADIUS + 16;
                            const fs = fontScale(p.ships);
                            return (
                                <>
                                    <text x={p.x} y={fy} textAnchor="middle" fontSize={fs} fill="#000" stroke="#000" strokeWidth="3" opacity={0.55}>
                                        {label}
                                    </text>
                                    <text x={p.x} y={fy} textAnchor="middle" fontSize={fs} fontWeight="600" fill={ownerColor(p.owner)}>
                                        {label}
                                    </text>
                                </>
                            );
                        })()}
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
