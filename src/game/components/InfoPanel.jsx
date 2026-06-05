// game/components/InfoPanel.jsx
import React from "react";

// Top-left selected-star readout, echoing the original Pax Galaxia info panel:
// system name, its bonus/type, and Active / Disabled ship counts.
export default function InfoPanel({ planet, ownerName, ownerColor, STAR, active, disabled }) {
    if (!planet) {
        return (
            <div className="w-44 p-3 rounded-xl bg-blue-700/80 border border-blue-300/40 text-white text-xs opacity-80 leading-5">
                Click one of your stars, then drag across neighbors to route ships.
            </div>
        );
    }
    const type = STAR[planet.starType];
    return (
        <div className="w-44 p-3 rounded-xl bg-blue-700/90 border border-blue-300/40 text-white">
            <div className="text-sm font-bold leading-tight">{planet.name}</div>
            <div className="text-xs mt-1 font-medium" style={{ color: type?.color }}>
                {type?.name || "No Bonus"}
            </div>
            <div className="text-xs mt-2 opacity-80">
                Owner: <span style={{ color: ownerColor }}>{ownerName}</span>
            </div>
            <div className="mt-2 pt-2 border-t border-blue-300/30 text-xs space-y-0.5">
                <div className="flex justify-between"><span className="opacity-80">Active</span><b>{active}</b></div>
                <div className="flex justify-between"><span className="opacity-80">Disabled</span><b>{disabled}</b></div>
            </div>
        </div>
    );
}
