// game/hooks/useEconomyCombat.js
import { useEffect, useRef } from "react";
import { chooseMirrorRouteAndAnchor, getMirrorGroup, isMirrorPlanet } from "../utils/mirror.js";
import { buildPacket, buildRetreat } from "./usePackets.js";

// ---------------------------------------------------------------------------
// Tunable constants — all hoisted so unit tests can read/reason about them.
//
// Combat is asymmetric: defenders absorb attacker pressure more slowly than
// they themselves take damage. This reproduces the manual's required ratios
// at single-source attacks:
//   ordinary star: 1.5:1 grinds (manual: "needed"), 2:1 wins comfortably
//   Red star (×2): 4:1 cracks it (manual: "4:1 preferable for defense stars")
//   Green vs Red: defenseMult collapses back to 1 → Red bonus is voided
//
// Tuning intuition: `K_ATK * atkEff` defender loss/sec, `K_DEF * defEff`
// attacker loss/sec. K_DEF much smaller than K_ATK lets the invader pool
// build up over a few seconds; combined with the siege-time `destroyFrac`
// ramp, sustained pressure eventually breaks the defender.
// ---------------------------------------------------------------------------
export const BASE_DEF_BIAS = 1.5;
export const K_ATK = 0.25;
export const K_DEF = 0.10;
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
// Send rule, adapted from the manual to a 1Hz tick.
//
// The manual says "1-9 ships -> 1 moves; 10-19 -> 2; 20-29 -> 3; and so on"
// PER TICK. The original ran sub-second ticks (~200ms), so that rule worked
// out to roughly 25-50% of a planet's force per real second — which is what
// made attacks actually crack defended worlds at 1.5:1+ ratios.
//
// At our 1Hz econ tick, the literal integer rule under-shoots ~5x and combat
// stalemates (defender production out-paces attacker attrition). We preserve
// the feel by sending SEND_FRACTION_PER_SECOND of the source per tick, with
// floor + integer minimum so the "1 ship always tries to move" property of
// the original is intact. Blue stars (moveFactor = 2) double it.
// ---------------------------------------------------------------------------
export const SEND_FRACTION_PER_SECOND = 0.25;
export function shipsToSend(p, STAR) {
    if (p.ships < 1) return 0;
    const moveFactor = STAR[p.starType]?.move || 1;
    const fractional = Math.floor(p.ships * SEND_FRACTION_PER_SECOND);
    const base = Math.max(1, fractional);
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
// Architectural note: we run the tick OUTSIDE the setPlanets updater. The
// updater pattern would have made the side-effect (queueing packets) impure
// AND, more importantly, async — by the time control returned from
// setPlanets(updater), the updater had not yet run, so any "after-dispatch"
// setPackets call would see an empty outgoing buffer and silently drop every
// packet. The fix: read the latest planets via a ref, run the pure helpers
// synchronously to build the next planets array + outgoing packets list,
// then dispatch both setPlanets(value) and setPackets(updater) as a pair.
//
// Race with the arrival effect (which fires on packet RAF updates): both
// pathways dispatch in FIFO order via React's update queue, so a tick that
// observed stale `planetsRef` would still see its setPlanets(value) layered
// before any pending arrival updater. In practice the planetsRef effect
// commits between renders, so the staleness window is single-frame.
// ---------------------------------------------------------------------------
export function useEconomyCombat({
                                     scene,
                                     paused,
                                     worldSpeed,
                                     STAR,
                                     planets,
                                     packets,
                                     packetsRef,
                                     setPackets,
                                     setPlanets,
                                 }) {
    const mirrorRouteLockRef = useRef({ activeIdx: null, to: null, owner: null });
    const lastAppliedPacketsRef = useRef(null);

    // Mirror of the latest planets state so the 1s tick can compute the next
    // state synchronously instead of inside a setPlanets updater.
    const planetsRef = useRef(planets);
    useEffect(() => { planetsRef.current = planets; }, [planets]);

    useEffect(() => {
        if (scene !== "playing") return;
        const timer = setInterval(() => {
            if (paused) return;
            const source = planetsRef.current;
            if (!source) return;

            const arr = clonePlanetsForTick(source);
            const byId = Object.fromEntries(arr.map((p) => [p.id, p]));
            const outgoing = [];
            const queue = (fromId, toId, owner, amount, a, b, S) =>
                outgoing.push(buildPacket(fromId, toId, owner, amount, a, b, S));
            const queueR = (fromId, toId, owner, amount, a, b) =>
                outgoing.push(buildRetreat(fromId, toId, owner, amount, a, b));

            tickProduction(arr, STAR, worldSpeed);
            const { activeIdx, to } = chooseMirrorRouteAndAnchor(
                arr, packetsRef, mirrorRouteLockRef
            );
            tickSending(arr, byId, STAR, activeIdx, to, queue);
            tickCombat(arr, byId, STAR, queueR);
            tickRepairs(arr, worldSpeed);
            syncMirrors(arr, mirrorRouteLockRef);

            setPlanets(arr);
            if (outgoing.length) setPackets((pk) => [...pk, ...outgoing]);
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
