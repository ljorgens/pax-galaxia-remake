// game/hooks/useEconomyCombat.js
import { useEffect, useRef } from "react";
import { chooseMirrorRouteAndAnchor, getMirrorGroup, isMirrorPlanet } from "../utils/mirror.js";
import { AI_SEND_BASE, AI_BURST } from "../constants";

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
            if (process.env.NODE_ENV !== "production") console.log("[econ tick]");
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

                const GAR_DEFAULT_MIRROR = 1;

                const minGarrison = (p) => {
                    const degree = p.neighbors?.length || 0;
                    const base = 6 + Math.min(10, degree * 1.5); // 8..36
                    const enemyAdj = p.neighbors.some((id) => byId[id] && byId[id].owner !== p.owner);
                    return enemyAdj ? base + 4 : base;
                };

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

                    // Mirror: only the active instance is allowed to send this tick
                    if (isMirrorPlanet(p)) {
                        if (i !== mirrorActiveIdx) continue;
                        if (!mirrorTo || !p.neighbors.includes(mirrorTo)) continue;

                        const moveFactor = STAR[p.starType]?.move || 1;
                        const rate = (p.aiBurstFlag ? AI_BURST : AI_SEND_BASE) * moveFactor;
                        const desired = p.ships * rate;
                        const available = Math.max(0, p.ships - GAR_DEFAULT_MIRROR);
                        const send = Math.min(desired, available);

                        if (send > 0.01) {
                            p.ships -= send;
                            const toNode = arr.find((q) => q.id === mirrorTo);
                            if (toNode) queuePacketRef.current(p.id, toNode.id, p.owner, send, p, toNode, STAR);
                        }
                        if (p.aiBurstFlag) p.aiBurstFlag = false;
                        arr[i] = { ...arr[i], routeTo: mirrorTo ?? null };
                        continue;
                    }

                    // Normal planets
                    if (!p.routeTo || !p.neighbors.includes(p.routeTo)) {
                        if (p.routeTo) arr[i] = { ...p, routeTo: null };
                        continue;
                    }

                    const moveFactor = STAR[p.starType]?.move || 1;
                    const rate = (p.aiBurstFlag ? AI_BURST : AI_SEND_BASE) * moveFactor;
                    const desired = p.ships * rate;
                    const GARmin = minGarrison(p);
                    const available = Math.max(0, p.ships - GARmin);
                    const send = Math.min(desired, available);

                    if (send > 0.01) {
                        p.ships -= send;
                        const to = arr.find((q) => q.id === p.routeTo);
                        if (to) queuePacketRef.current(p.id, to.id, p.owner, send, p, to, STAR);
                    }
                    if (p.aiBurstFlag) p.aiBurstFlag = false;
                }

                // 3) Combat tick
                for (const p of arr) {
                    const invKeys = Object.keys(p.invaders).filter((k) => p.invaders[k] > 0 && k !== p.owner);
                    const under = invKeys.length > 0;
                    if (under) p.underAttackTicks = Math.min(p.underAttackTicks + 1, 20);
                    else p.underAttackTicks = Math.max(0, p.underAttackTicks - 1);
                    if (!under) continue;

                    const atkEff = invKeys.reduce((s, k) => s + (p.invadersEff[k] || 0), 0);
                    let defEff = p.ships * (STAR[p.starType]?.defense || 1);
                    const BASE_DEF_BIAS = 1.2;
                    defEff *= BASE_DEF_BIAS;

                    const K_ATK = 0.22;
                    const K_DEF = 0.30;
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
                        const effFactor = (effBefore / (before + loss + 1e-6)) || 0;
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
                            const neighbors = p.neighbors
                                .map((id) => arr.find((q) => q.id === id))
                                .filter((q) => q && q.owner === oldOwner);
                            if (neighbors.length) {
                                const destroyed = defDam * 0.25;
                                const retreating = defDam - destroyed;
                                const per = retreating / neighbors.length;
                                for (const nb of neighbors) {
                                    queueRetreatRef.current(p.id, nb.id, oldOwner, per, p, nb);
                                }
                            } else {
                                const captured = defDam * 0.5;
                                p.ships += captured;
                            }
                            p.damaged[oldOwner] = 0;
                        }

                        p.owner = winner;
                        p.routeTo = null;
                        p.ships += remainingInv;
                        p.invaders = {};
                        p.invadersEff = {};
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

                // 5) Mirror sync (clone canon across other instances)
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
                                routeTo: src.routeTo ?? null,
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

// (Optional) export for testing / reuse
export function minGarrisonFactory(byId) {
    return function minGarrison(p) {
        const degree = p.neighbors?.length || 0;
        const base = 6 + Math.min(10, degree * 1.5);
        const enemyAdj = p.neighbors.some((id) => byId[id] && byId[id].owner !== p.owner);
        return enemyAdj ? base + 4 : base;
    };
}
