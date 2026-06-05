// game/components/Controls.jsx
import React from "react";

// Vertical left-edge toolbar in royal-blue chrome with red action buttons,
// echoing the original Pax Galaxia HUD (Back / Pause / Give up, clock, etc.).
export default function Controls({
                                     paused,
                                     setPaused,
                                     worldSpeed,
                                     setWorldSpeed,
                                     musicOn,
                                     setMusicOn,
                                     musicVolume,
                                     setMusicVolume,
                                     backToMenu,
                                     newMapSameSettings,
                                     onGiveUp,
                                 }) {
    const actionBtn =
        "w-full px-3 py-2 rounded-md text-sm font-semibold text-white bg-red-600 hover:bg-red-500 active:bg-red-700 border border-red-900/40 shadow transition-colors";

    return (
        <div className="flex flex-col gap-2 w-44 p-3 rounded-xl bg-blue-700/90 border border-blue-300/40 shadow-lg text-white">
            <h1 className="text-base font-bold tracking-wide text-center mb-1">Pax Galaxia</h1>

            <button onClick={backToMenu} className={actionBtn}>Back</button>
            <button onClick={newMapSameSettings} className={actionBtn}>New Map</button>
            <button onClick={() => setPaused((p) => !p)} className={actionBtn}>
                {paused ? "Resume" : "Pause"}
            </button>
            <button onClick={onGiveUp} className={actionBtn}>Give up</button>

            <div className="mt-2 pt-2 border-t border-blue-300/30">
                <div className="text-xs opacity-80 mb-1">Speed</div>
                <div className="grid grid-cols-4 gap-1">
                    {[0.5, 1, 1.5, 2].map((s) => (
                        <button
                            key={s}
                            onClick={() => setWorldSpeed(s)}
                            className={`px-1 py-1 rounded text-xs border border-blue-300/40 transition-colors ${
                                worldSpeed === s ? "bg-white text-blue-800 font-bold" : "bg-blue-600/60 hover:bg-blue-500/70"
                            }`}
                        >
                            {s}x
                        </button>
                    ))}
                </div>
            </div>

            <div className="mt-2 pt-2 border-t border-blue-300/30">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs opacity-80">Music</span>
                    <button
                        onClick={() => setMusicOn((v) => !v)}
                        className={`px-2 py-0.5 rounded text-xs border border-blue-300/40 transition-colors ${
                            musicOn ? "bg-white text-blue-800 font-bold" : "bg-blue-600/60 hover:bg-blue-500/70"
                        }`}
                        title="Toggle music (M)"
                    >
                        {musicOn ? "On" : "Off"}
                    </button>
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                    className="w-full"
                />
            </div>
        </div>
    );
}
