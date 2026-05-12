// game/hooks/usePackets.js
import { useEffect, useRef } from "react";
import { distance } from "../utils/math";

function newId() {
    return (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
}

// Pure packet builders — call these to construct a packet object without
// side-effects, then dispatch the resulting array via setPackets in one go.
// Keeping construction pure is what lets the 1s economy tick stay
// StrictMode-safe (the setPlanets updater can build outgoing packets in a
// local buffer and the orchestrator dispatches setPackets afterwards).
export function buildPacket(fromId, toId, owner, amount, a, b, STAR) {
    const dist = distance(a, b);
    return {
        id: newId(),
        from: fromId,
        to: toId,
        owner,
        amount,
        t: 0,
        speed: 0.55 / Math.max(0.2, dist / 420),
        atkMult: STAR[a.starType]?.attack || 1,
        srcType: a.starType,
    };
}

export function buildRetreat(fromId, toId, owner, amount, a, b) {
    const dist = distance(a, b);
    return {
        id: newId(),
        from: fromId,
        to: toId,
        owner,
        amount,
        t: 0,
        speed: 0.55 / Math.max(0.2, dist / 420),
        atkMult: 1,
        srcType: a.starType,
        retreat: true,
    };
}

/**
 * RAF-based packet progression. Advances each packet's `t` per frame.
 * Arrivals (t >= 1) are picked up by useEconomyCombat's arrival effect.
 */
export function usePackets({ scene, paused, worldSpeed, setPackets }) {
    const rafRef = useRef(0);

    useEffect(() => {
        if (scene !== "playing") return;

        let last = performance.now();
        function step(now) {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            if (!paused) {
                setPackets((pk) =>
                    pk.map((pkt) => ({
                        ...pkt,
                        t: pkt.t + pkt.speed * worldSpeed * dt,
                    }))
                );
            }
            rafRef.current = requestAnimationFrame(step);
        }

        rafRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafRef.current);
    }, [scene, paused, worldSpeed, setPackets]);
}
