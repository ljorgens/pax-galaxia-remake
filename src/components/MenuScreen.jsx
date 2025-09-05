import React, { useState } from "react";
import MENU_BG_VIDEO from '../assets/video/breathing_galaxy.mp4';

export default function MenuScreen({musicOn, musicVolume, onToggleMusic, onVolumeChange, onStart }) {
    const initial = { ai: 2, stars: 18, preset: "balanced", seed: "" }
    const [menuAi, setMenuAi] = useState(initial.ai);
    const [menuStars, setMenuStars] = useState(initial.stars);
    const [menuPreset, setMenuPreset] = useState(initial.preset);
    const [menuSeed, setMenuSeed] = useState(
        initial.seed || "PAX-" + Math.floor(Math.random() * 9999)
    );

    return (
        <div className="relative min-h-screen w-full flex items-start justify-center p-6 overflow-hidden">
            <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                src={MENU_BG_VIDEO}
            />
            <div className="absolute inset-0 bg-black/45" />

            <div className="relative z-10 w-full max-w-[980px] text-slate-100 rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm p-6">
                <h1 className="text-2xl font-semibold mb-4">Pax Flow — Galaxy Setup</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm">
                        <label className="block text-sm mb-1">AI Players</label>
                        <input
                            type="range"
                            min="1"
                            max="12"
                            value={menuAi}
                            onChange={(e) => setMenuAi(parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="text-xs opacity-80 mt-1">{menuAi} AI</div>

                        <label className="block text-sm mt-4 mb-1">Total Stars</label>
                        <input
                            type="range"
                            min="12"
                            max="120"
                            value={menuStars}
                            onChange={(e) => setMenuStars(parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="text-xs opacity-80 mt-1">
                            {menuStars} stars (includes players)
                        </div>

                        <label className="block text-sm mt-4 mb-1">Star Distribution</label>
                        <select
                            className="w-full bg-slate-900/60 border border-slate-700 rounded p-2"
                            value={menuPreset}
                            onChange={(e) => setMenuPreset(e.target.value)}
                        >
                            <option value="balanced">Balanced</option>
                            <option value="econ">Economy-Heavy (Y/B)</option>
                            <option value="combat">Combat-Heavy (R/G)</option>
                            <option value="tele">Mirror-Rich</option>
                        </select>

                        <label className="block text-sm mt-4 mb-1">
                            Seed (reproducible maps)
                        </label>
                        <input
                            className="w-full bg-slate-900/60 border border-slate-700 rounded p-2"
                            value={menuSeed}
                            onChange={(e) => setMenuSeed(e.target.value)}
                        />
                    </div>

                    <div className="p-4 rounded-xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm">
                        <div className="text-sm opacity-80 mb-2">How it works</div>
                        <ul className="list-disc ml-5 text-sm opacity-80 space-y-1">
                            <li>Owner boundaries (Voronoi) with per-star cap</li>
                            <li>Hyperlanes restrict movement</li>
                            <li>
                                Mirrors (<b>M</b>): one shared planet shown in multiple places
                                (white)
                            </li>
                            <li>Stockpile unless routed; ~10% moves/tick (Blue ~20%)</li>
                            <li>Combat + retreats + repairs</li>
                            <li>Spacebar pauses during play</li>
                        </ul>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <label className="block text-sm mb-1">Music</label>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onToggleMusic}
                            className={`px-3 py-1 rounded-2xl border ${
                                musicOn ? "bg-slate-800/70" : "bg-slate-900/60"
                            } backdrop-blur-sm`}
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
                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                        Press <b>M</b> to toggle
                    </div>
                </div>

                <div className="mt-6 flex gap-3">
                    <button
                        onClick={() =>
                            onStart({
                                ai: menuAi,
                                stars: menuStars,
                                preset: menuPreset,
                                seed: menuSeed
                            })
                        }
                        className="px-4 py-2 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 backdrop-blur-sm"
                    >
                        Generate Galaxy
                    </button>
                    <button
                        onClick={() => setMenuSeed("PAX-" + Math.floor(Math.random() * 9999))}
                        className="px-4 py-2 rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-sm"
                    >
                        Randomize Seed
                    </button>
                </div>
                <div style={{fontSize: 10, textAlign: 'end'}}>
                    Music: <a href="https://pixabay.com/music/future-bass-leonell-cassio-the-sapphire-city-10450/">Leonell Cassio - The Sapphire City</a>
                    <br/>
                    Background Video: <a href="https://www.pexels.com/video/illustration-of-a-galaxy-6961824/">Samphan Korwong - Illustration of a Galaxy</a>
                    <br/>
                    <p style={{fontSize: 8}}>Both listed as free to use, if not please contact and we will take down as soon as possible</p>
                </div>
            </div>
        </div>
    );
}
