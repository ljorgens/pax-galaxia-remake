import React, { useEffect, useMemo, useRef, useState } from "react";
import { Delaunay } from 'd3-delaunay';

import DEFAULT_MUSIC_URL from '../src/assets/audio/leonell-cassio-the-sapphire-city-10450.mp3';
import MenuScreen from "../src/screens/MenuScreen.jsx";

import { WIDTH, HEIGHT, RADIUS, OWNER_COLORS, TYPE_COLORS, STAR_PRESET } from "./game/constants";
import { makeRNG, randRange } from "./game/utils/math";
import { generateMapWithTypes, makePlayers } from "./game/utils/map";
import { voronoiSegments } from "./game/utils/geom";
import { displayShips } from "./game/utils/mirror";

import { useAudio } from "./game/hooks/useAudio";
import { usePackets } from "./game/hooks/usePackets";
import { useEconomyCombat } from "./game/hooks/useEconomyCombat";
import { useAIPlanner } from "./game/hooks/useAIPlanner";
import usePauseHotkey from "./game/hooks/usePauseHotkey"

import GameCanvas from "./game/components/GameCanvas";
import Controls from "./game/components/Controls";
import Legend from "./game/components/Legend";
import Scoreboard from "./game/components/Scoreboard";

export default function PaxGame(){
    const [scene, setScene] = useState('menu');
    const [aiCount, setAiCount] = useState(2);
    const [totalStars, setTotalStars] = useState(18);
    const [preset, setPreset] = useState('balanced');
    const [seed, setSeed] = useState(() => 'PAX-' + Math.floor(Math.random() * 9999));
    const [worldSpeed, setWorldSpeed] = useState(1);
    const [paused, setPaused] = useState(false);

    const players = useMemo(() => makePlayers(aiCount, OWNER_COLORS), [aiCount]);
    const STAR = STAR_PRESET; // could be memo if you expect changes

    const { musicOn, setMusicOn, musicVolume, setMusicVolume } = useAudio(DEFAULT_MUSIC_URL, { defaultOn:true, defaultVol:0.6 });

    const rngRef = useRef(makeRNG(seed));
    const [planets, setPlanets] = useState(() => generateMapWithTypes(players, totalStars, STAR, {rng:rngRef.current, weightsPreset:preset}));
    const [packets, setPackets] = useState([]);
    const packetsRef = useRef([]); useEffect(()=>{ packetsRef.current = packets; }, [packets]);
    const [selected, setSelected] = useState(null);

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

    function startGameFromMenu({ ai, stars, preset:pp, seed:ss }){
        setAiCount(ai); setTotalStars(stars); setPreset(pp); setSeed(ss);
        rngRef.current = makeRNG(ss);
        const newPlayers = makePlayers(ai, OWNER_COLORS);
        setPlanets(generateMapWithTypes(newPlayers, stars, STAR, { rng: rngRef.current, weightsPreset: pp }));
        setPackets([]); setSelected(null); setPaused(false); setWorldSpeed(1);
        startTime.current = Date.now(); pausedMsRef.current = 0; pauseStartRef.current = 0; setElapsed(0); setScene('playing');
    }

    function newMapSameSettings(){
        rngRef.current = makeRNG(Math.random().toString(36));
        const newPlayers = makePlayers(aiCount, OWNER_COLORS);
        setPlanets(generateMapWithTypes(newPlayers, totalStars, STAR, { rng: rngRef.current, weightsPreset: preset }));
        setPackets([]); setSelected(null);
        startTime.current = Date.now(); pausedMsRef.current=0; pauseStartRef.current=0; setElapsed(0);
    }

    function backToMenu(){ setScene('menu'); }

    function handlePlanetClick(p){
        const me = players[0];
        if (!selected){ if (p.owner===me.id) setSelected(p); return; }
        if (p.id===selected.id){ setPlanets(ps=>ps.map(q=> q.id===selected.id? { ...q, routeTo:null } : q)); setSelected(null); return; }
        const isNeighbor = (a,b)=> a.neighbors.includes(b.id);
        if (!isNeighbor(selected, p)){ setSelected(null); return; }
        setPlanets(ps=>ps.map(q=> q.id===selected.id? { ...q, routeTo:p.id } : q)); setSelected(null);
    }

    if (scene==='menu') return (
        <MenuScreen musicOn={musicOn} musicVolume={musicVolume} onToggleMusic={()=>setMusicOn(v=>!v)} onVolumeChange={setMusicVolume} onStart={startGameFromMenu} />
    );

    return (
        <div className="w-full flex flex-col items-center gap-3 select-none">
            <Controls {...{ paused, setPaused, worldSpeed, setWorldSpeed, musicOn, setMusicOn, musicVolume, setMusicVolume, backToMenu, newMapSameSettings }} />
            <Legend STAR={STAR} TYPE_COLORS={TYPE_COLORS} />
            <GameCanvas {...{ planets, packets, players, selected, onPlanetClick:handlePlanetClick, STAR, TYPE_COLORS, WIDTH, HEIGHT, RADIUS, vor, edgeSegs, byId, displayShips, elapsed }} />
            <Scoreboard planets={planets} packets={packets} players={players} STAR={STAR} />
        </div>
    );
}
