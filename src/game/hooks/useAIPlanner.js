// game/hooks/useAIPlanner.js
import { useEffect } from "react";
import { PLAN_INTERVAL, AI_SEND_BASE, AI_BURST } from "../constants";

// === CHANGE: treat neutral as opponent for most purposes
function isEnemyOwner(owner, me) {
    // neutral counts as "opponent" now
    return owner && owner !== me;
}
function isNeutral(owner) { return owner === "neutral"; }

function idMap(planets) {
    return Object.fromEntries(planets.map((p) => [p.id, p]));
}

function minGarrison(p, byId) {
    const deg = (p.neighbors?.length || 0);
    const base = 6 + Math.min(10, deg * 1.2);
    const enemyAdj = p.neighbors?.some((id) => {
        const n = byId[id];
        return n && isEnemyOwner(n.owner, p.owner);
    });
    return base + (enemyAdj ? 6 : 0);
}

function borderSet(planets, owner) {
    const byId = idMap(planets);
    const out = new Set();
    for (const p of planets) {
        if (p.owner !== owner) continue;
        if (p.neighbors?.some((id) => {
            const n = byId[id];
            return n && isEnemyOwner(n.owner, owner); // includes neutrals
        })) out.add(p.id);
    }
    return out;
}

function distanceToNearestBorder(planets, owner) {
    const byId = idMap(planets);
    const border = borderSet(planets, owner);
    const dist = new Map();
    const q = [];
    for (const bid of border) { dist.set(bid, 0); q.push(bid); }
    while (q.length) {
        const pid = q.shift();
        const d = dist.get(pid);
        const p = byId[pid];
        if (!p || p.owner !== owner) continue;
        for (const nid of p.neighbors || []) {
            const n = byId[nid];
            if (!n || n.owner !== owner) continue;
            if (!dist.has(nid)) { dist.set(nid, d + 1); q.push(nid); }
        }
    }
    return dist;
}

function enemyNeighborsOf(p, owner, byId) {
    return (p.neighbors || [])
        .map((id) => byId[id])
        .filter((n) => n && isEnemyOwner(n.owner, owner)); // includes neutrals
}
function friendlyNeighborsOf(p, owner, byId) {
    return (p.neighbors || [])
        .map((id) => byId[id])
        .filter((n) => n && n.owner === owner);
}

// === NEW: hostiles that can fight back = EXCLUDES neutrals
function totalHostileAdjShips(p, owner, byId) {
    return (p.neighbors || [])
        .map((id) => byId[id])
        .filter((n) => n && n.owner !== owner && !isNeutral(n.owner))
        .reduce((s, n) => s + (n.ships || 0), 0);
}

function combinedSendable(nodes, byId) {
    let sum = 0;
    for (const n of nodes) {
        const g = minGarrison(n, byId);
        sum += Math.max(0, (n.ships || 0) - g);
    }
    return sum;
}

function preferLowShipsThenId(a, b) {
    if ((a.ships || 0) !== (b.ships || 0)) return (a.ships || 0) - (b.ships || 0);
    return ("" + a.id).localeCompare("" + b.id);
}

function neighborTowardBorder(p, distMap, byId) {
    let best = null;
    let bestD = Infinity;
    for (const nid of p.neighbors || []) {
        const n = byId[nid];
        if (!n || n.owner !== p.owner) continue;
        const d = distMap.get(nid);
        if (d == null) continue;
        if (d < bestD) { best = n; bestD = d; }
        else if (d === bestD && best) {
            if (preferLowShipsThenId(n, best) < 0) best = n;
        }
    }
    return best;
}

export function useAIPlanner({
                                 scene,
                                 paused,
                                 players,
                                 STAR,
                                 setPlanets,
                             }) {
    useEffect(() => {
        if (scene !== "playing") return;

        const timer = setInterval(() => {
            if (paused) return;

            setPlanets((prev) => {
                const arr = prev.map((p) => ({ ...p }));
                const byId = idMap(arr);

                const ownerToBorderDist = new Map();
                const ownerIds = [...new Set(players.filter(p => p.kind === "ai").map(p => p.id))];
                for (const oid of ownerIds) {
                    ownerToBorderDist.set(oid, distanceToNearestBorder(arr, oid));
                }

                // Multi-planet coordination (2.5×) against ANY non-friendly (includes neutrals)
                for (const enemy of arr) {
                    if (!enemy.owner) continue;
                    for (const ai of players.filter(p => p.kind === "ai")) {
                        if (enemy.owner === ai.id) continue;
                        const touchingFriendlies = (enemy.neighbors || [])
                            .map((id) => byId[id])
                            .filter((n) => n && n.owner === ai.id);
                        if (!touchingFriendlies.length) continue;

                        const sendable = combinedSendable(touchingFriendlies, byId);
                        const ratio = sendable / Math.max(1, enemy.ships || 0);
                        if (ratio >= 2.5) {
                            for (const f of touchingFriendlies) {
                                const g = minGarrison(f, byId);
                                if ((f.ships || 0) - g <= 0) continue;
                                const i = arr.findIndex((z) => z.id === f.id);
                                if (i >= 0) arr[i] = { ...arr[i], routeTo: enemy.id, aiBurstFlag: true };
                            }
                        }
                    }
                }

                for (const ai of players) {
                    if (ai.kind !== "ai") continue;
                    const distMap = ownerToBorderDist.get(ai.id) || new Map();

                    for (let i = 0; i < arr.length; i++) {
                        const p = arr[i];
                        if (p.owner !== ai.id) continue;

                        const friends = friendlyNeighborsOf(p, ai.id, byId);
                        const enemies = enemyNeighborsOf(p, ai.id, byId); // includes neutrals

                        // If currently attacking, keep only if ≥1.5× vs that target
                        if (p.routeTo && isEnemyOwner(byId[p.routeTo]?.owner, ai.id)) {
                            const t = byId[p.routeTo];
                            if (t) {
                                const g = minGarrison(p, byId);
                                const mySendable = Math.max(0, (p.ships || 0) - g);
                                const ratioNow = mySendable / Math.max(1, t.ships || 0);
                                if (ratioNow < 1.5) arr[i] = { ...p, routeTo: null, aiBurstFlag: false };
                                else               arr[i] = { ...p, aiBurstFlag: true };
                                continue;
                            }
                        }

                        // Chokepoint: exactly 1 enemy neighbor, no friendly neighbors
                        if (enemies.length === 1 && friends.length === 0) {
                            const e = enemies[0]; // could be neutral or enemy — both count
                            const g = minGarrison(p, byId);
                            const mySendable = Math.max(0, (p.ships || 0) - g);
                            if (mySendable >= 2 * Math.max(1, e.ships || 0)) {
                                arr[i] = { ...p, routeTo: e.id, aiBurstFlag: true };
                            } else if (p.routeTo === e.id) {
                                const ratioNow = mySendable / Math.max(1, e.ships || 0);
                                if (ratioNow < 1.5) arr[i] = { ...p, routeTo: null, aiBurstFlag: false };
                                else                arr[i] = { ...p, aiBurstFlag: true };
                            } else {
                                arr[i] = { ...p, routeTo: null, aiBurstFlag: false };
                            }
                            continue;
                        }

                        // Border planet: stockpile until 2× TOTAL hostiles that can fight back (EXCLUDES neutrals)
                        if (enemies.length > 0) {
                            const totalHostile = totalHostileAdjShips(p, ai.id, byId); // no neutrals here
                            const g = minGarrison(p, byId);
                            const mySendable = Math.max(0, (p.ships || 0) - g);

                            if (mySendable >= 2 * Math.max(1, totalHostile)) {
                                // choose weakest adjacent non-friendly (neutral included as valid target)
                                const target = [...enemies].sort(preferLowShipsThenId)[0];
                                const ratioNow = mySendable / Math.max(1, target.ships || 0);
                                if (ratioNow >= 1.5) arr[i] = { ...p, routeTo: target.id, aiBurstFlag: true };
                                else                 arr[i] = { ...p, routeTo: null, aiBurstFlag: false };
                            } else {
                                arr[i] = { ...p, routeTo: null, aiBurstFlag: false };
                            }
                            continue;
                        }

                        // Rear planet: push toward nearest border (where border includes neutrals as "opponents")
                        const dHere = distMap.get(p.id);
                        if (dHere == null) {
                            arr[i] = { ...p, routeTo: null, aiBurstFlag: false };
                            continue;
                        }
                        const step = neighborTowardBorder(p, distMap, byId);
                        arr[i] = step
                            ? { ...p, routeTo: step.id, aiBurstFlag: false }
                            : { ...p, routeTo: null, aiBurstFlag: false };
                    }
                }

                return arr;
            });
        }, PLAN_INTERVAL);

        return () => clearInterval(timer);
    }, [scene, paused, players, STAR, setPlanets]);
}
