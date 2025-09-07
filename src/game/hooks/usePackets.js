// game/hooks/usePackets.js
import { useEffect, useRef, useCallback } from "react";
import { distance } from "../utils/math";

/**
 * Handles RAF-based packet progression and exposes queue helpers.
 * Props: { scene, paused, worldSpeed, setPackets, byId }
 */
export function usePackets({ scene, paused, worldSpeed, setPackets, byId }) {
    const rafRef = useRef(0);

    // RAF progress loop
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

    const queuePacket = useCallback((fromId, toId, owner, amount, a, b, STAR) => {
        const dist = distance(a, b);
        const edgeSpeed = 0.55 / Math.max(0.2, dist / 420);
        const atkMult = (STAR[a.starType]?.attack || 1);
        setPackets((pk) => [
            ...pk,
            {
                id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random(),
                from: fromId,
                to: toId,
                owner,
                amount,
                t: 0,
                speed: edgeSpeed,
                atkMult,
                srcType: a.starType,
            },
        ]);
    }, [setPackets]);

    const queueRetreat = useCallback((fromId, toId, owner, amount, a, b) => {
        const dist = distance(a, b);
        const edgeSpeed = 0.55 / Math.max(0.2, dist / 420);
        setPackets((pk) => [
            ...pk,
            {
                id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random(),
                from: fromId,
                to: toId,
                owner,
                amount,
                t: 0,
                speed: edgeSpeed,
                atkMult: 1,
                srcType: a.starType,
                retreat: true,
            },
        ]);
    }, [setPackets]);

    return { queuePacket, queueRetreat };
}
