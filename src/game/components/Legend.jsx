// game/components/Legend.jsx
import React from "react";

export default function Legend({ STAR, TYPE_COLORS }) {
    return (
        <>
            <div className="flex flex-wrap items-center gap-3 text-xs opacity-90">
                <div className="font-medium">Legend:</div>
                <div className="flex items-center gap-1">Owner boundaries</div>
                <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-full bg-yellow-400" />
                    Star type = core
                </div>
                <div className="ml-4 italic">Spacebar pauses</div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs opacity-90">
                {Object.entries(STAR).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1">
            <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: TYPE_COLORS[k] }}
            />
                        <span>
              {v.label}: {v.name}
            </span>
                    </div>
                ))}
            </div>
        </>
    );
}
