// game/hooks/useEconomyCombat.js
import { useEffect, useRef } from "react";
import { chooseMirrorRouteAndAnchor, getMirrorGroup, isMirrorPlanet } from "../utils/mirror.js";

// Original Pax Galaxia send rule (manual, Dio Games):
//   "1-9 ships -> 1 moves; 10-19 -> 2; 20-29 -> 3; and so on" per tick.
// = floor(ships / 10) + 1, then scaled by moveFactor (Blue = 2x).
// No automatic garrison floor: a planet can drain to 0 if production can't keep up.
function shipsToSend(p, STAR) {
    if (p.ships < 1) return 0;
    const moveFactor = STAR[p.starType]?.move || 1;
    const base = Math.floor(p.ships / 10) + 1;
    return Math.min(p.ships, base * moveFactor);
}

/**
 * Centralizes economy + combat:
 *  - 1s economy tick: production → sending → combat → repairs → mirror sync
 *  - packet arrivals: apply to planets when t>=1 (separate effect keyed to packets)
 *
 * Props:
 *  scene, paused, worldSpeed, STAR
 *  packets, packetsRef
 *  setPackets, setPlanets
 *  queuePacket, queueRetreat
 */
export function useEconomyCombat({
                                     scene,
                                     paused,
                                     worldSpeed,
                                     STAR,
                                     packets,
                                     packetsRef,
                                     setPackets,
                                     setPlanets,
                                     queuePacket,
                                     queueRetreat,
                                 }) {
    const mirrorRouteLockRef = useRef({ activeIdx: null, to: null, owner: null });

    // keep stable refs to functions that may change identity across renders
    const queuePacketRef = useRef(queuePacket);
    const queueRetreatRef = useRef(queueRetreat);
    useEffect(() => { queuePacketRef.current = queuePacket; }, [queuePacket]);
    useEffect(() => { queueRetreatRef.current = queueRetreat; }, [queueRetreat]);

    // ====== ECONOMY/COMBAT TICK (1s) ======
    useEffect(() => {
        if (scene !== "playing") return;

        const timer = setInterval(() => {
            if (paused) return;

            setPlanets((ps) => {
                // clone + make nested maps safe to mutate
                const arr = ps.map((p) => ({
                    ...p,
                    damaged: { ...p.damaged },
                    invaders: { ...p.invaders },
                    invadersEff: { ...p.invadersEff },
                }));
                const byId = Object.fromEntries(arr.map((p) => [p.id, p]));

                // 1) Production
                for (const p of arr) {
                    if (p.owner === "neutral") continue;
                    const prodMul = STAR[p.starType]?.prod || 1;
                    p.ships += p.prod * prodMul * worldSpeed;
                }

                // 2) Sending (mirror-aware; burst vs. base)
                const { activeIdx: mirrorActiveIdx, to: mirrorTo } = chooseMirrorRouteAndAnchor(
                    arr,
                    packetsRef,
                    mirrorRouteLockRef
                );

                for (let i = 0; i < arr.length; i++) {
                    const p = arr[i];
                    if (p.owner === "neutral") continue;

                    let dest = null;
                    if (isMirrorPlanet(p)) {
                        // Mirror: only the active instance may send this tick
                        if (i !== mirrorActiveIdx) continue;
                        if (!mirrorTo || !p.neighbors.includes(mirrorTo)) continue;
                        dest = mirrorTo;
                    } else {
                        if (!p.routeTo || !p.neighbors.includes(p.routeTo)) {
                            if (p.routeTo) arr[i] = { ...p, routeTo: null };
                            continue;
                        }
                        dest = p.routeTo;
                    }

                    const send = shipsToSend(p, STAR);
                    if (send > 0) {
                        p.ships -= send;
                        const to = byId[dest];
                        if (to) queuePacketRef.current(p.id, to.id, p.owner, send, p, to, STAR);
                    }
                    if (isMirrorPlanet(p)) arr[i] = { ...arr[i], routeTo: mirrorTo ?? null };
                }

                // 3) Combat tick
                for (const p of arr) {
                    const invKeys = Object.keys(p.invaders).filter((k) => p.invaders[k] > 0 && k !== p.owner);
                    const under = invKeys.length > 0;
                    if (under) p.underAttackTicks = Math.min(p.underAttackTicks + 1, 20);
                    else p.underAttackTicks = Math.max(0, p.underAttackTicks - 1);
                    if (!under) continue;

                    const atkEff = invKeys.reduce((s, k) => s + (p.invadersEff[k] || 0), 0);

                    // Green attackers cancel Red's defense bonus
                    // If invadersEff > invaders for any attacker, they came from a green star
                    const hasGreenAttacker = invKeys.some(k => (p.invadersEff[k] || 0) > (p.invaders[k] || 0) * 1.01);
                    const defenseMultiplier = hasGreenAttacker ? 1 : (STAR[p.starType]?.defense || 1);

                    let defEff = p.ships * defenseMultiplier;
                    const BASE_DEF_BIAS = 1.5; // Original: need 1.5:1 to win on normal stars
                    defEff *= BASE_DEF_BIAS;

                    const K_ATK = 0.25;
                    const K_DEF = 0.25;
                    const defLoss = Math.min(p.ships, K_ATK * atkEff);
                    const atkLossTotal = Math.min(
                        invKeys.reduce((s, k) => s + p.invaders[k], 0),
                        K_DEF * defEff
                    );

                    const destroyFrac = Math.min(0.30 + 0.04 * p.underAttackTicks, 0.80);
                    const damageFrac = 1 - destroyFrac;

                    // defender losses
                    p.ships -= defLoss;
                    p.damaged[p.owner] = (p.damaged[p.owner] || 0) + defLoss * damageFrac;

                    // attacker losses
                    const totalEff = Math.max(1e-6, atkEff);
                    for (const k of invKeys) {
                        const share = (p.invadersEff[k] || 0) / totalEff;
                        const loss = atkLossTotal * share;

                        const before = p.invaders[k] || 0;
                        p.invaders[k] = Math.max(0, before - loss);

                        const effBefore = p.invadersEff[k] || 0;
                        const effFactor = before > 0 ? (effBefore / before) : 1;
                        p.invadersEff[k] = Math.max(0, effBefore - loss * effFactor);

                        p.damaged[k] = (p.damaged[k] || 0) + loss * damageFrac;
                    }

                    const remainingInv = invKeys.reduce((s, k) => s + (p.invaders[k] || 0), 0);

                    if (p.ships <= 0 && remainingInv > 0) {
                        let winner = invKeys[0];
                        let best = p.invaders[winner];
                        for (const k of invKeys) if (p.invaders[k] > best) { winner = k; best = p.invaders[k]; }

                        const oldOwner = p.owner;
                        const defDam = p.damaged[oldOwner] || 0;

                        if (defDam > 0) {
                            const canRetreat = oldOwner !== "neutral";
                            const neighbors = canRetreat
                                ? p.neighbors
                                      .map((id) => arr.find((q) => q.id === id))
                                      .filter((q) => q && q.owner === oldOwner)
                                : [];
                            if (canRetreat && neighbors.length) {
                                const destroyed = defDam * 0.25;
                                const retreating = defDam - destroyed;
                                const per = retreating / neighbors.length;
                                for (const nb of neighbors) {
                                    queueRetreatRef.current(p.id, nb.id, oldOwner, per, p, nb);
                                }
                            } else {
                                // Manual: if defender has no friendly neighbors,
                                // the attacker takes control of the remaining damaged ships.
                                p.damaged[winner] = (p.damaged[winner] || 0) + defDam;
                            }
                            p.damaged[oldOwner] = 0;
                        }

                        p.owner = winner;
                        p.routeTo = null;
                        const survivingInvaders = invKeys.map((ownerId) => ({
                            ownerId,
                            amount: Math.max(0, p.invaders[ownerId] || 0),
                            eff: Math.max(0, p.invadersEff[ownerId] || 0),
                        }));
                        const remainingHostileInvaders = [];

                        const friendlyNeighborsByOwner = new Map();
                        for (const ownerId of new Set(invKeys)) {
                            const friendlyNeighbors = p.neighbors
                                .map((id) => arr.find((q) => q.id === id))
                                .filter((q) => q && q.owner === ownerId);
                            friendlyNeighborsByOwner.set(ownerId, friendlyNeighbors);
                        }

                        for (const { ownerId, amount, eff } of survivingInvaders) {
                            if (amount <= 0) continue;
                            if (ownerId === winner) {
                                // Original Pax Galaxia: half stay, half return to origin
                                // We send half back to friendly neighbors as approximation
                                const winnerNeighbors = p.neighbors
                                    .map((id) => arr.find((q) => q.id === id))
                                    .filter((q) => q && q.owner === winner);
                                const stayAmount = winnerNeighbors.length > 0 ? amount * 0.5 : amount;
                                const returnAmount = amount - stayAmount;
                                p.ships += stayAmount;
                                if (returnAmount > 0 && winnerNeighbors.length > 0) {
                                    const per = returnAmount / winnerNeighbors.length;
                                    for (const nb of winnerNeighbors) {
                                        queueRetreatRef.current(p.id, nb.id, winner, per, p, nb);
                                    }
                                }
                                continue;
                            }
                            const friendlyNeighbors = friendlyNeighborsByOwner.get(ownerId) || [];
                            if (friendlyNeighbors.length > 0) {
                                const per = amount / friendlyNeighbors.length;
                                for (const nb of friendlyNeighbors) {
                                    queueRetreatRef.current(p.id, nb.id, ownerId, per, p, nb);
                                }
                            } else {
                                remainingHostileInvaders.push({ ownerId, amount, eff });
                            }
                        }

                        p.ships = Math.max(0, p.ships);
                        p.invaders = {};
                        p.invadersEff = {};
                        for (const hostile of remainingHostileInvaders) {
                            p.invaders[hostile.ownerId] = (p.invaders[hostile.ownerId] || 0) + hostile.amount;
                            p.invadersEff[hostile.ownerId] = (p.invadersEff[hostile.ownerId] || 0) + hostile.eff;
                        }
                        p.underAttackTicks = 0;
                    } else if (remainingInv <= 0) {
                        for (const k of Object.keys(p.damaged)) if (k !== p.owner) delete p.damaged[k];
                    }
                }

                // 4) Repairs
                for (const p of arr) {
                    const under = Object.keys(p.invaders).some((k) => k !== p.owner && p.invaders[k] > 0);
                    for (const [owner, dmgVal] of Object.entries(p.damaged)) {
                        if (owner === p.owner) {
                            const base = 0.05 * worldSpeed;
                            let mult = 1.0;
                            if (p.starType === "V") mult = under ? 1.0 : 2.0;
                            else if (under) mult = 0.2;
                            const repair = Math.min(dmgVal, dmgVal * base * mult);
                            p.damaged[owner] -= repair;
                            p.ships += repair;
                        } else {
                            if (!under) delete p.damaged[owner];
                        }
                    }
                }

                // 5) Mirror sync (clone game state across other instances)
                // Note: routeTo is NOT synced - each mirror keeps its own route
                // so players can switch which mirror is active by setting a route on it
                {
                    const { idxs: mirrorIdxs, canonIdx } = getMirrorGroup(arr);
                    const srcIdx = mirrorRouteLockRef.current.activeIdx ?? canonIdx;
                    if (srcIdx != null && mirrorIdxs.length > 1) {
                        const src = arr[srcIdx];
                        for (const i of mirrorIdxs) {
                            if (i === srcIdx) continue;
                            arr[i] = {
                                ...arr[i],
                                owner: src.owner,
                                ships: src.ships,
                                damaged: { ...src.damaged },
                                invaders: { ...src.invaders },
                                invadersEff: { ...src.invadersEff },
                                underAttackTicks: src.underAttackTicks,
                                // routeTo intentionally NOT synced
                            };
                        }
                    }
                }

                return arr;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [scene, paused, worldSpeed, STAR, packetsRef, setPlanets]);
    // ^ no dependency on queuePacket / queueRetreat (we use refs for those)

    // ====== PACKET ARRIVALS ======
    useEffect(() => {
        if (scene !== "playing") return;
        if (!packets || packets.length === 0) return;

        setPackets((pkts) => {
            const arriving = pkts.filter((p) => p.t >= 1);
            if (!arriving.length) return pkts;
            const inflight = pkts.filter((p) => p.t < 1);

            setPlanets((ps) => {
                const arr = ps.map((p) => ({
                    ...p,
                    damaged: { ...p.damaged },
                    invaders: { ...p.invaders },
                    invadersEff: { ...p.invadersEff },
                }));

                const { canonIdx: mirrorCanonIdx } = getMirrorGroup(arr);

                for (const f of arriving) {
                    // redirect mirror targets to canon
                    let idx = arr.findIndex((p) => p.id === f.to);
                    if (idx < 0) continue;
                    if (mirrorCanonIdx != null && isMirrorPlanet(arr[idx])) idx = mirrorCanonIdx;

                    const target = arr[idx];
                    if (target.owner === f.owner) {
                        if (f.retreat) {
                            const repaired = f.amount * 0.5;
                            const stillDam = f.amount - repaired;
                            target.ships += repaired;
                            target.damaged[f.owner] = (target.damaged[f.owner] || 0) + stillDam;
                        } else {
                            target.ships += f.amount;
                        }
                    } else {
                        target.invaders[f.owner] = (target.invaders[f.owner] || 0) + f.amount;
                        target.invadersEff[f.owner] =
                            (target.invadersEff[f.owner] || 0) + f.amount * (f.atkMult || 1);
                    }
                }

                return arr;
            });

            return inflight;
        });
    }, [scene, packets, setPackets, setPlanets]);
}
