// BoomerangVideo.jsx
import React, { useEffect, useRef } from "react";
import MENU_BG_VIDEO from "../assets/video/6961824-uhd_3840_2160_30fps.mp4";

export default function BoomerangVideo({
                                           className = "",
                                           rewindRate = 1.25,     // 1 = normal-speed reverse; lower for smoother on sparse keyframes
                                           src = MENU_BG_VIDEO,
                                       }) {
    const videoRef = useRef(null);
    const rewindTimerRef = useRef(null);
    const lastNowRef = useRef(0);

    const stopRewind = () => {
        if (rewindTimerRef.current) {
            clearInterval(rewindTimerRef.current);
            rewindTimerRef.current = null;
        }
        lastNowRef.current = 0;
    };

    const startRewind = () => {
        const v = videoRef.current;
        if (!v) return;

        // Stop any previous rewind loop, pause playback, and nudge off the very end.
        stopRewind();
        v.pause();
        if (isFinite(v.duration)) {
            // Nudge to just-before-end so the browser exits the "ended" paint state.
            v.currentTime = Math.max(0, v.duration - 0.05);
        }

        // Interval-based stepping tends to repaint more consistently across browsers.
        rewindTimerRef.current = setInterval(() => {
            if (!videoRef.current) return;
            const now = performance.now();
            const last = lastNowRef.current || now;
            const dt = (now - last) / 1000; // seconds
            lastNowRef.current = now;

            const step = dt * rewindRate;            // seconds to move back this tick
            const next = Math.max(0, videoRef.current.currentTime - step);

            try {
                videoRef.current.currentTime = next;
            } catch {
                // Some browsers can throw during heavy seeks; just try again next tick.
            }

            if (next <= 0.03) {
                stopRewind();
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => {});
            }
        }, 16); // ~60Hz
    };

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;

        // Respect reduced motion: simple loop.
        const prefersReduced =
            typeof window !== "undefined" &&
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReduced) v.loop = true;

        const onEnded = () => {
            if (!prefersReduced) startRewind();
        };
        const onPlay = () => {
            // Ensure we don't try to rewind while playing forward.
            stopRewind();
        };
        const onVisibility = () => {
            if (document.hidden) stopRewind();
        };

        v.addEventListener("ended", onEnded);
        v.addEventListener("play", onPlay);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            v.removeEventListener("ended", onEnded);
            v.removeEventListener("play", onPlay);
            document.removeEventListener("visibilitychange", onVisibility);
            stopRewind();
        };
    }, [rewindRate]);

    return (
        <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            preload="auto"
            className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${className}`}
            src={src}
            // Note: no loop; we implement ping-pong ourselves.
        />
    );
}
