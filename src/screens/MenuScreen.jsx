// screens/MenuScreen.jsx
import React, { useEffect, useRef, useState } from "react";
import MENU_BG_VIDEO from "../assets/video/breathing_galaxy.mp4";

export default function MenuScreen({ musicOn, musicVolume, onToggleMusic, onVolumeChange, onStart }) {
    const initial = { ai: 2, stars: 18, preset: "balanced", seed: "" };
    const [menuAi, setMenuAi] = useState(initial.ai);
    const [menuStars, setMenuStars] = useState(initial.stars);
    const [menuPreset, setMenuPreset] = useState(initial.preset);
    const [menuSeed, setMenuSeed] = useState(initial.seed || "PAX-" + Math.floor(Math.random() * 9999));

    const [showHelp, setShowHelp] = useState(false);
    const closeBtnRef = useRef(null);

    // Hotkeys: Enter = Start, H = Help, Esc closes Help
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Enter" && !showHelp) {
                handleStart();
            } else if ((e.key === "h" || e.key === "H") && !showHelp) {
                setShowHelp(true);
            } else if (e.key === "Escape" && showHelp) {
                setShowHelp(false);
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [showHelp, menuAi, menuStars, menuPreset, menuSeed]);

    // Focus management + prevent background scroll when modal opens
    useEffect(() => {
        if (!showHelp) return;
        closeBtnRef.current?.focus();
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [showHelp]);

    const clamp = (val, min, max) => Math.min(max, Math.max(min, val|0));

    const handleStart = () => {
        const ai = clamp(menuAi, 1, 12);
        const stars = clamp(menuStars, Math.max(4, ai + 2), 120); // ensure enough stars for players
        onStart({ ai, stars, preset: menuPreset, seed: menuSeed || ("PAX-" + Math.floor(Math.random() * 9999)) });
    };

    const randomizeSeed = () => setMenuSeed("PAX-" + Math.floor(Math.random() * 9999));

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
                <div className="flex items-start justify-between gap-4">
                    <h1 className="text-2xl font-semibold mb-4">Pax Flow — Galaxy Setup</h1>
                    <button
                        type="button"
                        onClick={() => setShowHelp(true)}
                        className="mt-1 px-3 py-1 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80"
                        title="How to Play (H)"
                    >
                        How to Play
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left column: sliders + preset + seed */}
                    <div className="p-4 rounded-xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm">
                        <label className="block text-sm mb-1" htmlFor="aiRange">AI Players</label>
                        <input
                            id="aiRange"
                            type="range"
                            min="1"
                            max="12"
                            value={menuAi}
                            onChange={(e) => setMenuAi(parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex items-center justify-between">
                            <div className="text-xs opacity-80 mt-1">{menuAi} AI</div>
                            <input
                                type="number"
                                min={1}
                                max={12}
                                value={menuAi}
                                onChange={(e) => setMenuAi(clamp(e.target.value, 1, 12))}
                                className="w-16 text-right bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-xs"
                            />
                        </div>

                        <label className="block text-sm mt-4 mb-1" htmlFor="starsRange">Total Stars</label>
                        <input
                            id="starsRange"
                            type="range"
                            min="12"
                            max="120"
                            value={menuStars}
                            onChange={(e) => setMenuStars(parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex items-center justify-between">
                            <div className="text-xs opacity-80 mt-1">{menuStars} stars (includes starting homeworlds)</div>
                            <input
                                type="number"
                                min={12}
                                max={120}
                                value={menuStars}
                                onChange={(e) => setMenuStars(clamp(e.target.value, 12, 120))}
                                className="w-20 text-right bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-xs"
                            />
                        </div>

                        <label className="block text-sm mt-4 mb-1" htmlFor="presetSelect">Star Distribution</label>
                        <select
                            id="presetSelect"
                            className="w-full bg-slate-900/60 border border-slate-700 rounded p-2"
                            value={menuPreset}
                            onChange={(e) => setMenuPreset(e.target.value)}
                        >
                            <option value="balanced">Balanced</option>
                            <option value="econ">Economy-Heavy (Y/B)</option>
                            <option value="combat">Combat-Heavy (R/G)</option>
                            <option value="tele">Mirror-Rich</option>
                        </select>

                        <label className="block text-sm mt-4 mb-1" htmlFor="seedInput">Seed (reproducible maps)</label>
                        <div className="flex gap-2">
                            <input
                                id="seedInput"
                                className="flex-1 bg-slate-900/60 border border-slate-700 rounded p-2"
                                value={menuSeed}
                                onChange={(e) => setMenuSeed(e.target.value)}
                                placeholder="PAX-1234"
                            />
                            <button
                                type="button"
                                onClick={randomizeSeed}
                                className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/70 hover:bg-slate-700/70 text-sm"
                                title="Randomize seed"
                            >
                                🎲
                            </button>
                        </div>
                    </div>

                    {/* Right column: quick notes + help link + music */}
                    <div className="p-4 rounded-xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm">
                        <div className="text-sm opacity-80 mb-2">Quick notes</div>
                        <ul className="list-disc ml-5 text-sm opacity-80 space-y-1">
                            <li>Click one of your stars, then click a neighbor to set a route.</li>
                            <li>Ships move only along hyperlanes; unrouted ships stockpile.</li>
                            <li>Blue ≈ 2× transfer; Yellow ≈ 2× production; Red/Green buff defense/attack.</li>
                            <li>Violet repairs faster when idle. Mirrors (white) are a shared pool with one active lane.</li>
                            <li>Spacebar pauses during play. M toggles music.</li>
                        </ul>

                        <div className="mt-4 pt-4 border-t border-slate-700/50">
                            <label className="block text-sm mb-1">Music</label>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onToggleMusic}
                                    className={`px-3 py-1 rounded-2xl border ${musicOn ? "bg-slate-800/70" : "bg-slate-900/60"} backdrop-blur-sm`}
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
                    </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                    <button
                        onClick={handleStart}
                        className="px-4 py-2 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 backdrop-blur-sm"
                        aria-label="Generate Galaxy (Enter)"
                    >
                        Generate Galaxy
                    </button>
                    <button
                        onClick={() => setShowHelp(true)}
                        className="px-4 py-2 rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-sm"
                        title="How to Play (H)"
                    >
                        How to Play
                    </button>
                </div>

                <div className="mt-2 text-[10px] text-right opacity-75">
                    Need details? Open <button onClick={() => setShowHelp(true)} className="underline">How to Play</button> for rules & credits.
                </div>
            </div>

            {/* Modal */}
            {showHelp && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="howto-title"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setShowHelp(false);
                    }}
                >
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                    <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900/95 text-slate-100 shadow-xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                            <h2 id="howto-title" className="text-lg font-semibold">How to Play</h2>
                            <button
                                ref={closeBtnRef}
                                onClick={() => setShowHelp(false)}
                                className="px-2 py-1 text-sm rounded-lg border border-slate-700 hover:bg-slate-800"
                                aria-label="Close How to Play"
                            >
                                Close
                            </button>
                        </div>

                        <div className="px-5 py-4 space-y-4 text-sm leading-6 max-h-[70vh] overflow-auto">
                            <section>
                                <h3 className="font-semibold mb-1">Objective</h3>
                                <p>Expand your empire by capturing stars and defeating opponents. Win by controlling the galaxy (or surviving as the last player).</p>
                            </section>

                            <section>
                                <h3 className="font-semibold mb-1">Controls & Hotkeys</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li><b>Click</b> one of your stars, then click a neighboring star to set a route.</li>
                                    <li><b>Spacebar</b> pauses/resumes.</li>
                                    <li><b>M</b> toggles music; volume slider on the menu.</li>
                                </ul>
                            </section>

                            <section>
                                <h3 className="font-semibold mb-1">Movement</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>Ships travel only along visible hyperlanes.</li>
                                    <li>Unrouted ships <i>stockpile</i> at their star.</li>
                                    <li>Each tick, ~10% of a routed stockpile moves; Blue-type stars move ~20%/tick.</li>
                                </ul>
                            </section>

                            <section>
                                <h3 className="font-semibold mb-1">Mirrors (Teleport Stars)</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>Marked with <b>M</b> and shown in white. All mirror instances represent the same shared planet.</li>
                                    <li>Only one outbound route is active at a time across the mirror network.</li>
                                </ul>
                            </section>

                            <section>
                                <h3 className="font-semibold mb-1">Production & Repairs</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>Stars generate ships each tick. Damaged ships at an owned star slowly repair (Violet repairs faster when idle).</li>
                                    <li>Economy-heavy presets bias more Yellow/Blue (income/transfer). Combat-heavy favors Red/Green (defense/attack).</li>
                                </ul>
                            </section>

                            <section>
                                <h3 className="font-semibold mb-1">Combat</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li>Incoming enemy fleets add to <i>invaders</i> on arrival and fight over time against defenders.</li>
                                    <li>If defenders are wiped, the star flips owner and gains a fresh garrison from surviving attackers.</li>
                                </ul>
                            </section>

                            <section>
                                <h3 className="font-semibold mb-1">Credits</h3>
                                <p className="text-xs opacity-90">
                                    Music:{" "}
                                    <a
                                        className="underline"
                                        href="https://pixabay.com/music/future-bass-leonell-cassio-the-sapphire-city-10450/"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Leonell Cassio — “The Sapphire City”
                                    </a>
                                    <br />
                                    Background Video:{" "}
                                    <a
                                        className="underline"
                                        href="https://www.pexels.com/video/illustration-of-a-galaxy-6961824/"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Samphan Korwong — “Illustration of a Galaxy”
                                    </a>
                                    <br />
                                    <span className="opacity-75">
                    Both listed as free to use. If there is any issue, contact us and we will remove them as soon as possible.
                  </span>
                                </p>
                            </section>
                        </div>

                        <div className="px-5 py-4 border-t border-slate-700 flex justify-end">
                            <button
                                onClick={() => setShowHelp(false)}
                                className="px-4 py-2 rounded-2xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
