// game/hooks/useEconomyCombat.js
import { useEffect, useRef } from "react";
import { chooseMirrorRouteAndAnchor, getMirrorGroup, isMirrorPlanet } from "../utils/mirror.js";
import { buildPacket, buildRetreat } from "./usePackets.js";

// ---------------------------------------------------------------------------
// Tunable constants — all hoisted so unit tests can read/reason about them.
// Combat constants reproduce the manual's required ratios:
//   ordinary star: defEff = ships * 1.5  → 1.5:1 = grinding parity, 2:1 wins
//   Red star:     defEff = ships * 3.0   → ~4:1 cracks it
//   Green vs Red: defenseMult collapses back to 1 → Red bonus is voided
// ---------------------------------------------------------------------------
export const BASE_DEF_BIAS = 1.5;
export const K_ATK = 0.25;
export const K_DEF = 0.25;
export const SIEGE_TICK_CAP = 20;
export const DESTROY_FRAC_MIN = 0.30;
export const DESTROY_FRAC_RAMP = 0.04;   // per siege tick
export const DESTROY_FRAC_MAX = 0.80;
export const REPAIR_BASE = 0.05;          // 5% of damaged stock per second
export const REPAIR_UNDER_ATTACK_MULT = 0.2;  // non-Violet, under attack
export const VIOLET_REPAIR_MULT = 2.0;    // Violet, peace
export const RETREAT_DESTROY_FRAC = 0.25; // fraction destroyed when defenders retreat
export const WINNER_STAY_FRAC = 0.5;      // half stays, half returns to friendlies

// ---------------------------------------------------------------------------
// Original Pax Galaxia send rule (manual, Dio Games):
//   "1-9 ships -> 1 moves; 10-19 -> 2; 20-29 -> 3; and so on" per tick.
// = floor(ships / 10) + 1, then scaled by moveFactor (Blue = 2x).
// No automatic garrison floor: a planet can drain to 0 if production can't keep up.
// ---------------------------------------------------------------------------
export function shipsToSend(p, STAR) {
    if (p.ships < 1) return 0;
    const moveFactor = STAR[p.starType]?.move || 1;
    const base = Math.floor(p.ships / 10) + 1;
    return Math.min(p.ships, base * moveFactor);
}

// ---------------------------------------------------------------------------
// Pure tick helpers. Each receives the cloned planets array (and an id->planet
// lookup where useful) and mutates it in place. Pure inputs → deterministic
// outputs; safe to unit-test by passing in a hand-built array.
// ---------------------------------------------------------------------------

export function tickProduction(arr, STAR, worldSpeed) {
    for (const p of arr) {
        if (p.owner === "neutral") continue;
        const prodMul = STAR[p.starType]?.prod || 1;
        p.ships += p.prod * prodMul * worldSpeed;
    }
}

export function tickSending(arr, byId, STAR, mirrorActiveIdx, mirrorTo, queuePacket) {
    for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (p.owner === "neutral") continue;

        let dest = null;
        if (isMirrorPlanet(p)) {
            // Mirror: only the active instance may send this tick.
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
            if (to) queuePacket(p.id, to.id, p.owner, send, p, to, STAR);
        }
        if (isMirrorPlanet(p)) arr[i] = { ...arr[i], routeTo: mirrorTo ?? null };
    }
}

export function tickCombat(arr, byId, STAR, queueRetreat) {
    for (const p of arr) {
        const invKeys = Object.keys(p.invaders).filter((k) => p.invaders[k] > 0 && k !== p.owner);
        const under = invKeys.length > 0;
        if (under) p.underAttackTicks = Math.min(p.underAttackTicks + 1, SIEGE_TICK_CAP);
        else p.underAttackTicks = Math.max(0, p.underAttackTicks - 1);
        if (!under) continue;

        const atkEff = invKeys.reduce((s, k) => s + (p.invadersEff[k] || 0), 0);

        // Green cancels Red: if any attacker's eff > raw ships, they came from a Green
        // star and the defender's Red bonus is voided.
        const hasGreenAttacker = invKeys.some(
            (k) => (p.invadersEff[k] || 0) > (p.invaders[k] || 0) * 1.01
        );
        const defenseMultiplier = hasGreenAttacker ? 1 : (STAR[p.starType]?.defense || 1);
        const defEff = p.ships * defenseMultiplier * BASE_DEF_BIAS;

        const defLoss = Math.min(p.ships, K_ATK * atkEff);
        const atkLossTotal = Math.min(
            invKeys.reduce((s, k) => s + p.invaders[k], 0),
            K_DEF * defEff
        );

        const destroyFrac = Math.min(
            DESTROY_FRAC_MIN + DESTROY_FRAC_RAMP * p.underAttackTicks,
            DESTROY_FRAC_MAX
        );
        const damageFrac = 1 - destroyFrac;

        // Defender losses
        p.ships -= defLoss;
        p.damaged[p.owner] = (p.damaged[p.owner] || 0) + defLoss * damageFrac;

        // Attacker losses, allocated by effective-pressure share
        const totalEff = Math.max(1e-6, atkEff);
        for (const k of invKeys) {
            const share = (p.invadersEff[k] || 0) / totalEff;
            const loss = atkLossTotal * share;

            const before = p.invaders[k] || 0;
            p.invaders[k] = Math.max(0, before - loss);

            const effBefore = p.invadersEff[k] || 0;
            const effFactor = before > 0 ? effBefore / before : 1;
            p.invadersEff[k] = Math.max(0, effBefore - loss * effFactor);

            p.damaged[k] = (p.damaged[k] || 0) + loss * damageFrac;
        }

        const remainingInv = invKeys.reduce((s, k) => s + (p.invaders[k] || 0), 0);

        if (p.ships <= 0 && remainingInv > 0) {
            resolveCapture(byId, p, invKeys, queueRetreat);
        } else if (remainingInv <= 0) {
            // Siege broken; prune stale attacker damage entries.
            for (const k of Object.keys(p.damaged)) {
                if (k !== p.owner) delete p.damaged[k];
            }
        }
    }
}

function resolveCapture(byId, p, invKeys, queueRetreat) {
    // Winner = attacker with the largest remaining invader pool.
    let winner = invKeys[0];
    let best = p.invaders[winner];
    for (const k of invKeys) {
        if (p.invaders[k] > best) {
            winner = k;
            best = p.invaders[k];
        }
    }

    const oldOwner = p.owner;
    const defDam = p.damaged[oldOwner] || 0;

    // Defender damaged stock aftermath (per manual)
    if (defDam > 0) {
        const canRetreat = oldOwner !== "neutral";
        const neighbors = canRetreat
            ? p.neighbors
                  .map((id) => byId[id])
                  .filter((q) => q && q.owner === oldOwner)
            : [];
        if (canRetreat && neighbors.length) {
            const destroyed = defDam * RETREAT_DESTROY_FRAC;
            const retreating = defDam - destroyed;
            const per = retreating / neighbors.length;
            for (const nb of neighbors) {
                queueRetreat(p.id, nb.id, oldOwner, per, p, nb);
            }
        } else {
            // Manual: no friendly neighbors → attacker takes control of damaged ships.
            p.damaged[winner] = (p.damaged[winner] || 0) + defDam;
        }
        p.damaged[oldOwner] = 0;
    }

    p.owner = winner;
    p.routeTo = null;

    // Surviving invaders: winner half-stays half-returns; losers retreat home.
    const survivingInvaders = invKeys.map((ownerId) => ({
        ownerId,
        amount: Math.max(0, p.invaders[ownerId] || 0),
        eff: Math.max(0, p.invadersEff[ownerId] || 0),
    }));
    const remainingHostileInvaders = [];

    const friendlyNeighborsByOwner = new Map();
    for (const ownerId of new Set(invKeys)) {
        const friendlyNeighbors = p.neighbors
            .map((id) => byId[id])
            .filter((q) => q && q.owner === ownerId);
        friendlyNeighborsByOwner.set(ownerId, friendlyNeighbors);
    }

    for (const { ownerId, amount, eff } of survivingInvaders) {
        if (amount <= 0) continue;
        if (ownerId === winner) {
            // Manual: "half of the attacking force immediately moves into the captured
            // system. The other half remains in the system from where they launched."
            // [REMAKE] We approximate "origin" as "any friendly neighbor."
            const winnerNeighbors = friendlyNeighborsByOwner.get(winner) || [];
            const stayAmount = winnerNeighbors.length > 0 ? amount * WINNER_STAY_FRAC : amount;
            const returnAmount = amount - stayAmount;
            p.ships += stayAmount;
            if (returnAmount > 0 && winnerNeighbors.length > 0) {
                const per = returnAmount / winnerNeighbors.length;
                for (const nb of winnerNeighbors) {
                    queueRetreat(p.id, nb.id, winner, per, p, nb);
                }
            }
            continue;
        }
        const friendlyNeighbors = friendlyNeighborsByOwner.get(ownerId) || [];
        if (friendlyNeighbors.length > 0) {
            const per = amount / friendlyNeighbors.length;
            for (const nb of friendlyNeighbors) {
                queueRetreat(p.id, nb.id, ownerId, per, p, nb);
            }
        } else {
            // Nowhere to retreat — sit on the planet as residual hostiles.
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
}

export function tickRepairs(arr, worldSpeed) {
    for (const p of arr) {
        const under = Object.keys(p.invaders).some((k) => k !== p.owner && p.invaders[k] > 0);
        for (const [owner, dmgVal] of Object.entries(p.damaged)) {
            if (owner === p.owner) {
                const base = REPAIR_BASE * worldSpeed;
                let mult = 1.0;
                if (p.starType === "V") mult = under ? 1.0 : VIOLET_REPAIR_MULT;
                else if (under) mult = REPAIR_UNDER_ATTACK_MULT;
                const repair = Math.min(dmgVal, dmgVal * base * mult);
                p.damaged[owner] -= repair;
                p.ships += repair;
            } else if (!under) {
                // Attacker damage entries get cleaned up once the siege ends.
                delete p.damaged[owner];
            }
        }
    }
}

export function syncMirrors(arr, mirrorRouteLockRef) {
    const { idxs: mirrorIdxs, canonIdx } = getMirrorGroup(arr);
    const srcIdx = mirrorRouteLockRef.current.activeIdx ?? canonIdx;
    if (srcIdx == null || mirrorIdxs.length <= 1) return;
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
            // routeTo intentionally NOT synced — each copy keeps its own route
            // so the player can switch the active mirror by clicking a route on it.
        };
    }
}

export function applyArrivals(arr, arriving) {
    const { canonIdx: mirrorCanonIdx } = getMirrorGroup(arr);
    for (const f of arriving) {
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
}

// Deep-clones the per-tick mutable state so helpers can mutate freely.
export function clonePlanetsForTick(ps) {
    return ps.map((p) => ({
        ...p,
        damaged: { ...p.damaged },
        invaders: { ...p.invaders },
        invadersEff: { ...p.invadersEff },
    }));
}

// ---------------------------------------------------------------------------
// Hook — orchestrates the helpers on a 1s interval and handles packet arrivals
// on a separate effect keyed to the packets array.
//
// StrictMode notes:
//  - The setPlanets updater is double-invoked in dev to surface impurities.
//    We keep it pure by collecting outgoing packets into a local buffer
//    (reassigned to a fresh array at the start of each invocation), and
//    dispatching setPackets afterwards. Both invocations end with the
//    "outgoing" variable pointing at the LAST run's array; React keeps the
//    last updater result, so packets and planets stay in sync.
//  - The arrival effect would otherwise double-apply arrivals on the
//    initial mount/unmount/mount cycle, since its setPlanets updater is not
//    idempotent. We guard with a ref that records the packets reference we
//    last consumed; a re-fire with the same reference is a no-op.
// ---------------------------------------------------------------------------
export function useEconomyCombat({
                                     scene,
                                     paused,
                                     worldSpeed,
                                     STAR,
                                     packets,
                                     packetsRef,
                                     setPackets,
                                     setPlanets,
                                 }) {
    const mirrorRouteLockRef = useRef({ activeIdx: null, to: null, owner: null });
    const lastAppliedPacketsRef = useRef(null);

    useEffect(() => {
        if (scene !== "playing") return;
        const timer = setInterval(() => {
            if (paused) return;

            // Buffer reassigned-to-empty at the start of every updater run so
            // that the LAST invocation's array is the one we dispatch.
            let outgoing = [];

            setPlanets((ps) => {
                outgoing = [];
                const arr = clonePlanetsForTick(ps);
                const byId = Object.fromEntries(arr.map((p) => [p.id, p]));

                tickProduction(arr, STAR, worldSpeed);

                const { activeIdx, to } = chooseMirrorRouteAndAnchor(
                    arr, packetsRef, mirrorRouteLockRef
                );
                const queue = (fromId, toId, owner, amount, a, b, S) =>
                    outgoing.push(buildPacket(fromId, toId, owner, amount, a, b, S));
                const queueR = (fromId, toId, owner, amount, a, b) =>
                    outgoing.push(buildRetreat(fromId, toId, owner, amount, a, b));

                tickSending(arr, byId, STAR, activeIdx, to, queue);
                tickCombat(arr, byId, STAR, queueR);
                tickRepairs(arr, worldSpeed);
                syncMirrors(arr, mirrorRouteLockRef);

                return arr;
            });

            if (outgoing.length) {
                setPackets((pk) => [...pk, ...outgoing]);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [scene, paused, worldSpeed, STAR, setPlanets, setPackets, packetsRef]);

    useEffect(() => {
        if (scene !== "playing") return;
        if (!packets || packets.length === 0) return;
        if (lastAppliedPacketsRef.current === packets) return;

        const arriving = packets.filter((p) => p.t >= 1);
        if (!arriving.length) return;

        lastAppliedPacketsRef.current = packets;

        setPackets((pkts) => pkts.filter((p) => p.t < 1));
        setPlanets((ps) => {
            const arr = clonePlanetsForTick(ps);
            applyArrivals(arr, arriving);
            return arr;
        });
    }, [scene, packets, setPackets, setPlanets]);
}
