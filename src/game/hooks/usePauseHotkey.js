// game/hooks/usePauseHotkey.js
import { useEffect, useRef } from "react";

export default function usePauseHotkey({ scene, onToggle }) {
    const onToggleRef = useRef(onToggle);
    onToggleRef.current = onToggle;

    useEffect(() => {
        const handler = (e) => {
            // Ignore when typing in inputs/textareas/contenteditable
            const tag = (e.target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;

            // Only when playing
            if (scene !== "playing") return;

            // Space or "P" toggles pause
            const isSpace = e.code === "Space" || e.key === " " || e.key === "Spacebar";
            const isP = e.code === "KeyP" || e.key?.toLowerCase?.() === "p";
            if (isSpace || isP) {
                if (e.repeat) return;          // no key-repeat spamming
                e.preventDefault();            // stop page scroll on Space
                onToggleRef.current?.();
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [scene]);
}
