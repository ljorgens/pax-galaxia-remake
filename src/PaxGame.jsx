import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Delaunay } from 'd3-delaunay';

import DEFAULT_MUSIC_URL from '../src/assets/audio/leonell-cassio-the-sapphire-city-10450.mp3';
import MenuScreen from "../src/screens/MenuScreen.jsx";
import VictoryScreen from "../src/screens/VictoryScreen.jsx";

import { WIDTH, HEIGHT, RADIUS, OWNER_COLORS, TYPE_COLORS, STAR_PRESET } from "./game/constants";
import { makeRNG } from "./game/utils/math";
import { generateMapWithTypes, makePlayers } from "./game/utils/map";
import { voronoiSegments } from "./game/utils/geom";
import { displayShips, getMirrorGroup, isMirrorPlanet } from "./game/utils/mirror";

import { useAudio } from "./game/hooks/useAudio";
import { usePackets } from "./game/hooks/usePackets";
import { useEconomyCombat } from "./game/hooks/useEconomyCombat";
import { useAIPlanner } from "./game/hooks/useAIPlanner";
import usePauseHotkey from "./game/hooks/usePauseHotkey"

import GameCanvas from "./game/components/GameCanvas";
import Controls from "./game/components/Controls";
import Legend from "./game/components/Legend";
import Scoreboard from "./game/components/Scoreboard";

const makeRandomSeed = () => 'PAX-' + Math.floor(Math.random() * 9999).toString().padStart(4, "0");

export default function PaxGame(){
    const [scene, setScene] = useState('menu');
    const [aiCount, setAiCount] = useState(2);
    const [totalStars, setTotalStars] = useState(18);
    const [preset, setPreset] = useState('balanced');
    const [seed, setSeed] = useState(() => makeRandomSeed());
    const [worldSpeed, setWorldSpeed] = useState(1);
    const [paused, setPaused] = useState(false);

    const STAR = STAR_PRESET; // could be memo if you expect changes

    const { musicOn, setMusicOn, musicVolume, setMusicVolume } = useAudio(DEFAULT_MUSIC_URL, { defaultOn:true, defaultVol:0.6 });

    const rngRef = useRef(makeRNG(seed));
    const [players, setPlayers] = useState(() => makePlayers(aiCount, OWNER_COLORS, rngRef.current));
    const [planets, setPlanets] = useState(() => generateMapWithTypes(players, totalStars, STAR, {rng:rngRef.current, weightsPreset:preset}));
    const [packets, setPackets] = useState([]);
    const packetsRef = useRef([]); useEffect(()=>{ packetsRef.current = packets; }, [packets]);
    const [selected, setSelected] = useState(null);
    const [winnerId, setWinnerId] = useState(null);
    const [finalElapsed, setFinalElapsed] = useState(0);
    const [countdown, setCountdown] = useState(0);
    const [finalPlayerStats, setFinalPlayerStats] = useState({});
    const metricsRef = useRef({});

    const aiStickMapRef = useRef(new Map());
    const aiTickRef = useRef(0);

    const startTime = useRef(Date.now());
    const pauseStartRef = useRef(0);
    const pausedMsRef = useRef(0);
    const [elapsed, setElapsed] = useState(0);

    const setPausedTimed = (next) => {
        setPaused(prev => {
            const target = typeof next === 'function' ? next(prev) : next;
            if (target && !prev) {
                // running -> paused
                pauseStartRef.current = Date.now();
            } else if (!target && prev) {
                // paused -> running
                pausedMsRef.current += Date.now() - (pauseStartRef.current || Date.now());
            }
            return target;
        });
    };
    const togglePause = () => setPausedTimed(p => !p);

    // derived geometry
    const delaunay = useMemo(() => Delaunay.from(planets.map(p=>[p.x,p.y])), [planets]);
    const vor = useMemo(() => delaunay.voronoi([0,0,WIDTH,HEIGHT]), [delaunay]);
    const edgeSegs = useMemo(() => voronoiSegments(delaunay), [delaunay]);
    const byId = useMemo(() => Object.fromEntries(planets.map(p=>[p.id,p])), [planets]);

    const battleStats = useMemo(() => {
        const stats = {};
        for (const planet of planets) {
            const invEntries = Object.entries(planet.invaders || {}).filter(
                ([owner, amount]) => owner !== planet.owner && amount > 0
            );
            if (!invEntries.length) continue;

            const totalInvaders = invEntries.reduce((sum, [, amount]) => sum + amount, 0);
            const totalEff = invEntries.reduce(
                (sum, [owner]) => sum + (planet.invadersEff?.[owner] || 0),
                0
            );
            const [primaryOwner] = invEntries.reduce(
                (best, entry) => (entry[1] > best[1] ? entry : best),
                invEntries[0]
            );
            const defenseMult = (STAR[planet.starType]?.defense || 1) * 1.2;
            stats[planet.id] = {
                defenderShips: planet.ships,
                defenderEff: planet.ships * defenseMult,
                attackerShips: totalInvaders,
                attackerEff: totalEff,
                primaryAttackerId: primaryOwner,
            };
        }
        return stats;
    }, [planets, STAR]);

    // packets helper
    const { queuePacket, queueRetreat } = usePackets({ scene, paused, worldSpeed, setPackets, byId });

    // economy/combat main loop
    useEconomyCombat({ scene, paused, worldSpeed, STAR, packets, packetsRef, setPackets, setPlanets, queuePacket, queueRetreat });

    // AI planner
    useAIPlanner({ scene, paused, players, worldSpeed, STAR, startTime, pausedMsRef, setPlanets, aiStickMapRef, aiTickRef });

    usePauseHotkey({ scene, onToggle: togglePause });

    // elapsed timer
    useEffect(() => {
        if (scene!=='playing') return;
        const t = setInterval(() => { if (!paused) setElapsed(Math.floor((Date.now()-startTime.current - pausedMsRef.current)/1000)); }, 200);
        return () => clearInterval(t);
    }, [paused, scene]);

    useEffect(() => {
        if (scene !== 'countdown') return;
        if (countdown <= 0) setCountdown(3);

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    startTime.current = Date.now();
                    pausedMsRef.current = 0;
                    pauseStartRef.current = 0;
                    setElapsed(0);
                    setScene('playing');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [scene, countdown]);

    useEffect(() => {
        if (scene !== 'playing') return;
        const { canonIdx } = getMirrorGroup(planets);
        const mirrorCanonId = canonIdx != null ? planets[canonIdx].id : null;

        const inflightTotals = new Map();
        for (const pkt of packets) {
            if (!pkt.owner) continue;
            inflightTotals.set(pkt.owner, (inflightTotals.get(pkt.owner) || 0) + pkt.amount);
        }

        const nextMetrics = { ...metricsRef.current };
        for (const player of players) {
            if (!player || !player.id) continue;
            let ownedPlanets = 0;
            let shipsTotal = 0;
            let prodTotal = 0;
            for (const planet of planets) {
                if (planet.owner !== player.id) continue;
                if (isMirrorPlanet(planet) && mirrorCanonId != null && planet.id !== mirrorCanonId) continue;
                ownedPlanets += 1;
                shipsTotal += planet.ships;
                const prodMul = STAR[planet.starType]?.prod || 1;
                prodTotal += planet.prod * prodMul;
            }
            const inflight = inflightTotals.get(player.id) || 0;
            const armies = shipsTotal + inflight;
            const current = nextMetrics[player.id] || { maxArmies: 0, maxPlanets: 0, maxProd: 0 };
            const updated = {
                maxArmies: Math.max(current.maxArmies, armies),
                maxPlanets: Math.max(current.maxPlanets, ownedPlanets),
                maxProd: Math.max(current.maxProd, prodTotal),
            };
            nextMetrics[player.id] = updated;
        }
        metricsRef.current = nextMetrics;
    }, [scene, planets, packets, players, STAR]);

    const bootGame = useCallback(({ ai, stars, preset: presetName, seed: seedValue }) => {
        const nextSeed = seedValue || makeRandomSeed();
        rngRef.current = makeRNG(nextSeed);
        const newPlayers = makePlayers(ai, OWNER_COLORS, rngRef.current);

        setAiCount(ai);
        setTotalStars(stars);
        setPreset(presetName);
        setSeed(nextSeed);
        setWinnerId(null);
        setFinalElapsed(0);
        setFinalPlayerStats({});
        metricsRef.current = {};

        setPlayers(newPlayers);
        setPlanets(generateMapWithTypes(newPlayers, stars, STAR, { rng: rngRef.current, weightsPreset: presetName }));
        setPackets([]);
        setSelected(null);
        setPaused(false);
        setWorldSpeed(1);

        startTime.current = 0;
        pausedMsRef.current = 0;
        pauseStartRef.current = 0;
        setElapsed(0);
        setCountdown(3);
        setScene('countdown');
    }, [STAR]);

    function startGameFromMenu({ ai, stars, preset:pp, seed:ss }){
        bootGame({ ai, stars, preset: pp, seed: ss });
    }

    function newMapSameSettings(){
        bootGame({ ai: aiCount, stars: totalStars, preset, seed: makeRandomSeed() });
    }

    const rematchSameSeed = () => bootGame({ ai: aiCount, stars: totalStars, preset, seed });

    function backToMenu(){
        setWinnerId(null);
        setFinalElapsed(0);
        setFinalPlayerStats({});
        setCountdown(0);
        setPackets([]);
        setSelected(null);
        setPaused(false);
        setWorldSpeed(1);
        metricsRef.current = {};
        setScene('menu');
    }

    function handlePlanetClick(p){
        if (scene !== 'playing') return;
        const me = players[0];
        if (!selected){ if (p.owner===me.id) setSelected(p); return; }
        if (p.id===selected.id){ setPlanets(ps=>ps.map(q=> q.id===selected.id? { ...q, routeTo:null } : q)); setSelected(null); return; }
        const isNeighbor = (a,b)=> a.neighbors.includes(b.id);
        if (!isNeighbor(selected, p)){ setSelected(null); return; }
        setPlanets(ps=>ps.map(q=> q.id===selected.id? { ...q, routeTo:p.id } : q)); setSelected(null);
    }

    useEffect(() => {
        if (scene !== 'playing') return;

        const owners = new Set(planets.map((planet) => planet.owner).filter(Boolean));
        if (owners.size !== 1) return;
        const [soleOwner] = owners;
        if (!soleOwner || soleOwner === 'neutral') return;

        const hostilePackets = packets.some((pkt) => pkt.owner !== soleOwner);
        const hostileInvaders = planets.some((planet) =>
            Object.entries(planet.invaders || {}).some(([owner, amount]) => owner !== soleOwner && amount > 0)
        );
        if (hostilePackets || hostileInvaders) return;

        setWinnerId(soleOwner);
        setFinalElapsed(elapsed);
        setFinalPlayerStats(() => {
            const snapshot = {};
            for (const player of players) {
                if (!player || !player.id) continue;
                const stats = metricsRef.current[player.id] || { maxArmies: 0, maxPlanets: 0, maxProd: 0 };
                snapshot[player.id] = { ...stats };
            }
            return snapshot;
        });
        setPaused(true);
        setScene('victory');
    }, [scene, planets, packets, elapsed, players]);

    if (scene==='menu') return (
        <MenuScreen musicOn={musicOn} musicVolume={musicVolume} onToggleMusic={()=>setMusicOn(v=>!v)} onVolumeChange={setMusicVolume} onStart={startGameFromMenu} />
    );

    if (scene==='victory') return (
        <VictoryScreen
            winnerId={winnerId}
            players={players}
            planets={planets}
            packets={packets}
            STAR={STAR}
            elapsedSeconds={finalElapsed}
            playerStats={finalPlayerStats}
            onRematch={rematchSameSeed}
            onNewSeed={newMapSameSettings}
            onBackToMenu={backToMenu}
        />
    );

    const isCountdown = scene === 'countdown';

    return (
        <div className="relative w-full flex flex-col items-center gap-3 select-none">
            <Controls {...{ paused, setPaused, worldSpeed, setWorldSpeed, musicOn, setMusicOn, musicVolume, setMusicVolume, backToMenu, newMapSameSettings }} />
            <Legend STAR={STAR} TYPE_COLORS={TYPE_COLORS} />
            <GameCanvas
                {...{
                    planets,
                    packets,
                    players,
                    selected,
                    onPlanetClick: handlePlanetClick,
                    STAR,
                    TYPE_COLORS,
                    WIDTH,
                    HEIGHT,
                    RADIUS,
                    vor,
                    edgeSegs,
                    byId,
                    displayShips,
                    elapsed,
                    battleStats,
                }}
            />
            <Scoreboard planets={planets} packets={packets} players={players} STAR={STAR} />

            {isCountdown && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm text-center">
                    <div className="text-4xl md:text-6xl font-semibold tracking-wide text-white">
                        Game starts in
                    </div>
                    <div className="mt-4 text-6xl md:text-8xl font-bold text-white">
                        {Math.max(0, countdown)}
                    </div>
                </div>
            )}
        </div>
    );
}
