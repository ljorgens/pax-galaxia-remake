// game/components/Controls.jsx
import React from "react";

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
                                 }) {
    return (
        <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">Pax Flow — Classic Look</h1>

            <button onClick={backToMenu} className="px-3 py-1 rounded-2xl shadow border text-sm">
                Back to Menu
            </button>

            <button onClick={newMapSameSettings} className="px-3 py-1 rounded-2xl shadow border text-sm">
                New Map
            </button>

            <button
                onClick={() => setPaused((p) => !p)}
                className="px-3 py-1 rounded-2xl shadow border text-sm"
            >
                {paused ? "Resume" : "Pause"}
            </button>

            <div className="flex items-center gap-1 text-sm">
                <span className="opacity-70">Speed</span>
                {[0.5, 1, 1.5, 2].map((s) => (
                    <button
                        key={s}
                        onClick={() => setWorldSpeed(s)}
                        className={`px-2 py-0.5 rounded-2xl border text-sm ${
                            worldSpeed === s ? "bg-black/10 font-semibold" : ""
                        }`}
                    >
                        {s}x
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-2 text-sm">
                <span className="opacity-70">Music</span>
                <button
                    onClick={() => setMusicOn((v) => !v)}
                    className={`px-2 py-0.5 rounded-2xl border text-sm ${
                        musicOn ? "bg-black/10 font-semibold" : ""
                    }`}
                    title="Toggle music (M)"
                >
                    {musicOn ? "On" : "Off"}
                </button>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                    style={{ width: 90 }}
                />
            </div>
        </div>
    );
}
