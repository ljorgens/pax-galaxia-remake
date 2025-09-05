// PingPongVideo.jsx
import React, { useEffect, useRef, useState } from "react";

export default function PingPongVideo({
                                          forwardSrc,
                                          reverseSrc,
                                          className = "",
                                          fadeMs = 200,              // crossfade duration
                                          startDirection = "forward" // "forward" | "reverse"
                                      }) {
    const aRef = useRef(null); // forward
    const bRef = useRef(null); // reverse
    const [active, setActive] = useState(startDirection === "reverse" ? 1 : 0);
    const [crossfade, setCrossfade] = useState(false);
    const switchingRef = useRef(false);

    // seconds before the end to start the crossfade
    const leadSec = Math.max(0.12, fadeMs / 1000 + 0.05);

    const currentRef = () => (active === 0 ? aRef : bRef);
    const nextRef    = () => (active === 0 ? bRef : aRef);

    const startVideo = (v) => v?.play()?.catch(() => {});
    const pauseVideo = (v) => v?.pause?.();

    const beginCrossfade = () => {
        if (switchingRef.current) return;
        const cur = currentRef().current;
        const nxt = nextRef().current;
        if (!cur || !nxt) return;

        switchingRef.current = true;

        // Prep next clip
        try { nxt.currentTime = 0; } catch {}
        startVideo(nxt);

        // Trigger crossfade
        setCrossfade(true);

        // After fade completes, swap
        setTimeout(() => {
            pauseVideo(cur);
            setActive((prev) => (prev === 0 ? 1 : 0));
            setCrossfade(false);
            switchingRef.current = false;
        }, fadeMs);
    };

    useEffect(() => {
        const cur = currentRef().current;
        if (!cur) return;

        // Autoplay current, pause the other
        startVideo(cur);
        pauseVideo(nextRef().current);

        const prefersReduced =
            typeof window !== "undefined" &&
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        // If reduced motion, just loop the forward clip
        if (prefersReduced) {
            cur.loop = true;
            return;
        }

        const onTimeUpdate = () => {
            if (!cur.duration) return;
            const remaining = cur.duration - cur.currentTime;
            if (remaining <= leadSec) beginCrossfade();
        };

        const onEnded = () => {
            // Fallback in case we miss the lead window
            beginCrossfade();
        };

        cur.addEventListener("timeupdate", onTimeUpdate);
        cur.addEventListener("ended", onEnded);
        return () => {
            cur.removeEventListener("timeupdate", onTimeUpdate);
            cur.removeEventListener("ended", onEnded);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, fadeMs]);

    return (
        <div className={`absolute inset-0 overflow-hidden ${className}`}>
            {/* Forward clip */}
            <video
                ref={aRef}
                src={forwardSrc}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{
                    opacity: active === 0 ? (crossfade ? 0 : 1) : (crossfade ? 0 : 0),
                    // transition: `opacity ${fadeMs}ms linear`
                }}
            />
            {/* Reverse clip */}
            <video
                ref={bRef}
                src={reverseSrc}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{
                    opacity: active === 1 ? (crossfade ? 1 : 1) : (crossfade ? 1 : 0),
                    // transition: `opacity ${fadeMs}ms linear`
                }}
            />
        </div>
    );
}
