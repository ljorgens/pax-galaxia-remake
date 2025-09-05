import React, { useEffect, useMemo, useRef, useState } from "react";
import { Delaunay } from 'd3-delaunay';
import DEFAULT_MUSIC_URL from '../assets/audio/leonell-cassio-the-sapphire-city-10450.mp3';
import MenuScreen from "./MenuScreen";

const WIDTH = 980;
const HEIGHT = 600;
const RADIUS = 10;
const OWNER_COLORS = ["#63a6ff","#ff6b6b","#35d072","#ffd166","#b892ff","#ff8c42","#22d3ee","#f472b6","#a3e635","#f59e0b","#8b5cf6","#14b8a6","#ef4444","#10b981","#eab308","#3b82f6"];

function xmur3(str){ let h=1779033703^str.length; for(let i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19; } return function(){ h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909); h^=h>>>16; return h>>>0; } }
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; } }
function makeRNG(seed){ const seedFn=xmur3(String(seed||Math.random())); return mulberry32(seedFn()); }
function randRange(rng, min, max){ return rng()*(max-min)+min; }
function distance(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy); }
function lerp(a, b, t) { return { x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t }; }

function makePlayers(aiCount) { const ps = [{ id: "p0", name: "You", color: OWNER_COLORS[0], kind: "human" }]; for (let i=0;i<aiCount;i++) ps.push({ id: `p${i+1}`, name: `AI ${i+1}` , color: OWNER_COLORS[(i+1)%OWNER_COLORS.length], kind: "ai" }); return ps; }

function generateGraphFlexible(planets, rng=makeRNG()) {
    const N = planets.length;
    const adj = planets.map(()=>[]);
    function addEdge(i,j){ if (i===j) return; if (!adj[i].includes(j)) adj[i].push(j); if (!adj[j].includes(i)) adj[j].push(i); }
    function edges(){ const list=[]; for(let i=0;i<N;i++){ for(const j of adj[i]) if (i<j) list.push([i,j]); } return list; }
    function orient(a,b,c){ return (planets[b].x-planets[a].x)*(planets[c].y-planets[a].y) - (planets[b].y-planets[a].y)*(planets[c].x-planets[a].x); }
    function onSeg(a,b,c){ const pa=planets[a], pb=planets[b], pc=planets[c]; return Math.min(pa.x,pb.x)<=pc.x && pc.x<=Math.max(pa.x,pb.x) && Math.min(pa.y,pb.y)<=pc.y && pc.y<=Math.max(pa.y,pb.y); }
    function segmentsCross(a,b,c,d){ if (a===c||a===d||b===c||b===d) return false; const o1=orient(a,b,c), o2=orient(a,b,d), o3=orient(c,d,a), o4=orient(c,d,b); if (o1===0 && onSeg(a,b,c)) return false; if (o2===0 && onSeg(a,b,d)) return false; if (o3===0 && onSeg(c,d,a)) return false; if (o4===0 && onSeg(c,d,b)) return false; return (o1>0)!==(o2>0) && (o3>0)!==(o4>0); }
    for (let i=0;i<N;i++) { let bestJ=-1, bestD=Infinity; for (let j=0;j<N;j++){ if (j===i) continue; const d=distance(planets[i], planets[j]); if (d<bestD){bestD=d; bestJ=j;} } if (bestJ>=0) addEdge(i,bestJ); }
    const minDeg=1, maxDeg=4;
    const targets = Array.from({length:N}, () => Math.floor(randRange(rng, minDeg, maxDeg+1)));
    for (let i=0;i<N;i++) { const here = planets[i]; const order = planets.map((p,j)=>({j, d: j===i?Infinity:distance(here,p)})).sort((a,b)=>a.d-b.d); let idx=0; while (adj[i].length < targets[i] && idx < order.length){ const j = order[idx++].j; addEdge(i,j); } }
    let changed=true, guard=0; while(changed && guard<100){ changed=false; guard++; const es=edges(); for (let a=0;a<es.length;a++){ for (let b=a+1;b<es.length;b++){ const [i,j]=es[a], [u,v]=es[b]; if (segmentsCross(i,j,u,v)) { const dij=distance(planets[i],planets[j]); const duv=distance(planets[u],planets[v]); const rem = dij>duv ? [i,j] : [u,v]; const ix=rem[0], jx=rem[1]; adj[ix]=adj[ix].filter(n=>n!==jx); adj[jx]=adj[jx].filter(n=>n!==ix); changed=true; } } } }
    return adj.map(ns => ns.map(j => planets[j].id));
}

function ensureGlobalConnectivity(planets, neighborIds){
    const n = planets.length;
    const idToIdx = Object.fromEntries(planets.map((p,i)=>[p.id,i]));
    const adj = Array.from({length:n}, ()=>[]);
    for (let i=0;i<n;i++){
        const row = neighborIds[i]||[];
        for (const id of row){ const j = idToIdx[id]; if (j==null) continue; if (!adj[i].includes(j)) adj[i].push(j); if (!adj[j].includes(i)) adj[j].push(i); }
    }
    function orient(a,b,c){ return (planets[b].x-planets[a].x)*(planets[c].y-planets[a].y) - (planets[b].y-planets[a].y)*(planets[c].x-planets[a].x); }
    function onSeg(a,b,c){ const pa=planets[a], pb=planets[b], pc=planets[c]; return Math.min(pa.x,pb.x)<=pc.x && pc.x<=Math.max(pa.x,pb.x) && Math.min(pa.y,pb.y)<=pc.y && pc.y<=Math.max(pa.y,pb.y); }
    function segmentsCross(a,b,c,d){ if (a===c||a===d||b===c||b===d) return false; const o1=orient(a,b,c), o2=orient(a,b,d), o3=orient(c,d,a), o4=orient(c,d,b); if (o1===0 && onSeg(a,b,c)) return false; if (o2===0 && onSeg(a,b,d)) return false; if (o3===0 && onSeg(c,d,a)) return false; if (o4===0 && onSeg(c,d,b)) return false; return (o1>0)!==(o2>0) && (o3>0)!==(o4>0); }
    function edges(){ const list=[]; for(let i=0;i<n;i++){ for(const j of adj[i]) if (i<j) list.push([i,j]); } return list; }
    const parent = Array.from({length:n}, (_,i)=>i);
    function find(x){ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; }
    function unite(a,b){ a=find(a); b=find(b); if (a!==b) parent[b]=a; }
    for (const [i,j] of edges()) unite(i,j);
    function compRoots(){ const s=new Set(); for(let i=0;i<n;i++) s.add(find(i)); return Array.from(s); }
    let comps = compRoots();
    let guard = 0;
    while(comps.length>1 && guard<500){ guard++;
        const compMap = new Map(); for(let i=0;i<n;i++){ const r=find(i); if(!compMap.has(r)) compMap.set(r,[]); compMap.get(r).push(i); }
        let best = null;
        const compArr = Array.from(compMap.values());
        for (let a=0;a<compArr.length;a++){
            for (let b=a+1;b<compArr.length;b++){
                for (const i of compArr[a]){
                    for (const j of compArr[b]){
                        const d = distance(planets[i], planets[j]);
                        let crosses = false; for (const [u,v] of edges()){ if (segmentsCross(i,j,u,v)){ crosses = true; break; } }
                        if (!crosses && (!best || d<best.d)) best = {i,j,d};
                    }
                }
            }
        }
        if (!best) break;
        if (!adj[best.i].includes(best.j)) adj[best.i].push(best.j);
        if (!adj[best.j].includes(best.i)) adj[best.j].push(best.i);
        unite(best.i,best.j);
        comps = compRoots();
    }
    return adj.map((nbrs,i)=> nbrs.map(j=> planets[j].id));
}

function generateMap(players, totalStars, rng) {
    const planets = [];
    const MIN_DIST = Math.max(60, RADIUS*3.2);
    for (let i=0; i<players.length; i++) {
        let px, py, attempts = 0;
        do { px = randRange(rng, 90, WIDTH-90); py = randRange(rng, 80, HEIGHT-80); attempts++; }
        while (attempts < 8000 && planets.some(p => Math.hypot(p.x - px, p.y - py) < MIN_DIST));
        planets.push({ id: planets.length+1, x: px, y: py, owner: players[i].id, ships: 36, prod: 1.1, routeTo: null, neighbors: [], starType: 'O', damaged:{}, invaders:{}, invadersEff:{}, underAttackTicks:0 });
    }
    let tries=0; let guard=0;
    while (planets.length < totalStars && tries<12000) {
        tries++; guard++;
        let x = randRange(rng, 90, WIDTH-90), y = randRange(rng, 80, HEIGHT-80);
        let ok = planets.every(p => Math.hypot(p.x-x, p.y-y) >= MIN_DIST);
        if (!ok && guard % 4000 === 0) {
            const relax = MIN_DIST*0.9; ok = planets.every(p => Math.hypot(p.x-x, p.y-y) >= relax);
        }
        if (!ok) continue;
        planets.push({ id: planets.length+1, x, y, owner: "neutral", ships: Math.floor(randRange(rng, 8, 24)), prod: 1.0, routeTo: null, neighbors: [], starType: 'O', damaged:{}, invaders:{}, invadersEff:{}, underAttackTicks:0 });
    }
    let neighborIds = generateGraphFlexible(planets, rng);
    neighborIds = ensureGlobalConnectivity(planets, neighborIds);
    for (let i=0;i<planets.length;i++) planets[i].neighbors = neighborIds[i];
    return planets;
}

function weightedPick(rng, w) { const total = Object.values(w).reduce((a,b)=>a+b,0); let r = rng()*total; for (const [k,v] of Object.entries(w)) { if ((r-=v) <= 0) return k; } return 'O'; }

function generateMapWithTypes(players, totalStars, STAR, opts) {
    const { rng=makeRNG(), weightsPreset='balanced' } = opts || {};
    const planets = generateMap(players, totalStars, rng);
    let weights;
    if (weightsPreset==='econ') {
        weights = { O:20, Y:26, B:20, V:8, R:8, G:12, M:1 };
    } else if (weightsPreset==='combat') {
        weights = { O:20, Y:12, B:12, V:8, R:20, G:20, M:1 };
    } else if (weightsPreset==='tele') { // mirror-rich
        weights = { O:22, Y:14, B:12, V:8, R:10, G:12, M:15 };
    } else {
        weights = { O:28, Y:18, B:14, V:10, R:10, G:12, M:1 };
    }
    for (let i=0;i<planets.length;i++){
        if (planets[i].owner === 'neutral') {
            planets[i].starType = weightedPick(rng, weights);
        } else {
            planets[i].starType = 'O'; planets[i].prod = 1.1;
        }
    }
    ensureAtLeastTwoMirrors(planets);
    return planets;
}

// --- geometry helpers ---
function circumcenter(ax, ay, bx, by, cx, cy) {
    const d = 2 * (ax*(by-cy) + bx*(cy-ay) + cx*(ay-by)) || 1e-9;
    const ux = ((ax*ax + ay*ay)*(by-cy) + (bx*bx + by*by)*(cy-ay) + (cx*cx + cy*cy)*(ay-by)) / d;
    const uy = ((ax*ax + ay*ay)*(cx-bx) + (bx*bx + by*by)*(ax-cx) + (cx*cx + cy*cy)*(bx-ax)) / d;
    return [ux, uy];
}

/** Return finite Voronoi edge segments for each interior halfedge. */
function voronoiSegments(delaunay) {
    const segs = [];
    const {points, triangles, halfedges} = delaunay;
    const triOf = (e) => Math.floor(e/3)*3;
    for (let e = 0; e < halfedges.length; e++) {
        const h = halfedges[e];
        if (h < 0) continue; // hull ray: skip
        if (e < h) {
            const t  = triOf(e);
            const t2 = triOf(h);
            const a = triangles[t], b = triangles[t+1], c = triangles[t+2];
            const a2 = triangles[t2], b2 = triangles[t2+1], c2 = triangles[t2+2];
            const [ux,uy]  = circumcenter(points[2*a],  points[2*a+1],  points[2*b],  points[2*b+1],  points[2*c],  points[2*c+1]);
            const [vx,vy]  = circumcenter(points[2*a2], points[2*a2+1], points[2*b2], points[2*b2+1], points[2*c2], points[2*c2+1]);
            const si = triangles[e];
            const sj = triangles[e % 3 === 2 ? e-2 : e+1];
            segs.push({ x1: ux, y1: uy, x2: vx, y2: vy, i: si, j: sj });
        }
    }
    return segs;
}

function estimateTravelSeconds(a, b, worldSpeed) {
    const dist = distance(a, b);
    let edgeSpeed = 0.55 / Math.max(0.2, dist / 420);
    return 1 / (edgeSpeed * Math.max(0.25, worldSpeed));
}

function winOdds(attacker, defenderShips, defenderType, STAR, underAttackTicks = 0) {
    const defBias = 1.2;
    const defMult = (STAR[defenderType]?.defense) || 1;
    const defEff = defenderShips * defMult * defBias;
    const odds = attacker / (defEff + 1e-6);
    const under = Math.min(underAttackTicks, 20);
    const soft = 1 - 0.01 * under; // up to ~20% softer
    return odds * (1 / Math.max(0.6, soft));
}

function isMirrorPlanet(p) { return p.starType === 'M'; }

function getMirrorGroup(planets) {
    const idxs = [];
    planets.forEach((p, i) => { if (isMirrorPlanet(p)) idxs.push(i); });
    if (idxs.length === 0) return { idxs: [], canonIdx: null };
    const canonIdx = idxs.reduce((best, i) => planets[i].id < planets[best].id ? i : best, idxs[0]);
    return { idxs, canonIdx };
}

function isBorderPlanet(p, byId) {
    return p.neighbors.some(id => byId[id] && byId[id].owner !== p.owner);
}

function planetValue(p, STAR) {
    const prodVal = (p.prod || 1);
    const typeBonus =
        (STAR[p.starType]?.prod ? 0.8 : 0) +
        (STAR[p.starType]?.move ? 0.5 : 0) +
        (STAR[p.starType]?.defense ? 0.6 : 0) +
        (STAR[p.starType]?.attack ? 0.6 : 0);
    return prodVal + typeBonus + 0.15 * (p.neighbors?.length || 0);
}

function componentTotals(planets, playerId) {
    let ships = 0, prod = 0;
    for (const p of planets) if (p.owner === playerId) { ships += p.ships; prod += p.prod; }
    return { ships, prod };
}

function computeFrontlineDistances(planets, ownerId) {
    const id2i = Object.fromEntries(planets.map((p,i)=>[p.id,i]));
    const dist = new Map(); // planetId -> hops
    const q = [];
    for (const p of planets) {
        if (p.owner !== ownerId) { dist.set(p.id, 0); q.push(p.id); }
    }
    while (q.length) {
        const pid = q.shift();
        const d = dist.get(pid);
        const i = id2i[pid];
        if (i == null) continue;
        for (const nid of planets[i].neighbors) {
            if (!dist.has(nid)) { dist.set(nid, d + 1); q.push(nid); }
        }
    }
    return dist;
}

function inboundPlanCounts(planets) {
    const m = new Map(); // targetId -> count
    for (const p of planets) { if (p.routeTo) m.set(p.routeTo, (m.get(p.routeTo) || 0) + 1); }
    return m;
}

function ensureAtLeastTwoMirrors(planets) {
    const mIdxs = [];
    for (let i = 0; i < planets.length; i++) if (planets[i].starType === 'M') mIdxs.push(i);
    if (mIdxs.length === 0) return;
    if (mIdxs.length >= 2) return;
    const existing = mIdxs.map(i => planets[i]);
    const candidatesNeutral = [];
    const candidatesAny = [];
    for (let i = 0; i < planets.length; i++) {
        const p = planets[i];
        if (p.starType === 'M') continue;
        const minDistToM = Math.min(...existing.map(m => distance(p, m)));
        const entry = { i, score: minDistToM, isNeutral: p.owner === 'neutral' };
        if (entry.isNeutral) candidatesNeutral.push(entry);
        candidatesAny.push(entry);
    }
    const pickFrom = candidatesNeutral.length ? candidatesNeutral : candidatesAny;
    if (!pickFrom.length) return;
    pickFrom.sort((a, b) => b.score - a.score);
    const chosen = pickFrom[0].i;
    planets[chosen].starType = 'M';
}

const displayShips = (p, byId, planets) => {
    if (!isMirrorPlanet(p)) return p.ships;
    const { canonIdx } = getMirrorGroup(planets);
    if (canonIdx == null) return p.ships;
    const canonId = planets[canonIdx].id;
    return byId[canonId]?.ships ?? p.ships;
};

// Mirror single-lane lock: choose one active M anchor+route and keep it while packets are in-flight
function chooseMirrorRouteAndAnchor(arr, packetsRef, lockRef) {
    const { idxs, canonIdx } = getMirrorGroup(arr);
    if (!idxs.length) return { activeIdx: null, to: null };
    const owner = arr[canonIdx]?.owner ?? null;
    const mirrorIds = idxs.map(i => arr[i].id);
    const hasInflight = packetsRef.current.some(f => mirrorIds.includes(f.from) && !f.retreat && f.t < 1);

    const candidates = [];
    for (const i of idxs) {
        const to = arr[i].routeTo;
        if (to && arr[i].neighbors.includes(to)) candidates.push({ i, to });
    }

    if (lockRef.current.owner !== owner) {
        lockRef.current = { activeIdx: null, to: null, owner };
    }

    if (lockRef.current.activeIdx == null) {
        const canonCand = candidates.find(c => c.i === canonIdx);
        const pick = canonCand ?? candidates[0] ?? null;
        lockRef.current.activeIdx = pick?.i ?? null;
        lockRef.current.to = pick?.to ?? null;
        lockRef.current.owner = owner;
    } else {
        if (!hasInflight) {
            const stillValid = candidates.find(c => c.i === lockRef.current.activeIdx && c.to === lockRef.current.to);
            if (!stillValid) {
                const canonCand = candidates.find(c => c.i === canonIdx);
                const pick = canonCand ?? candidates[0] ?? null;
                lockRef.current.activeIdx = pick?.i ?? null;
                lockRef.current.to = pick?.to ?? null;
                lockRef.current.owner = owner;
            }
        }
    }
    return { activeIdx: lockRef.current.activeIdx, to: lockRef.current.to };
}

export default function PaxFlowClassicLook() {
    const [scene, setScene] = useState('menu');
    const [aiCount, setAiCount] = useState(2);
    const [totalStars, setTotalStars] = useState(18);
    const [preset, setPreset] = useState('balanced');
    const [seed, setSeed] = useState(() => 'PAX-' + Math.floor(Math.random() * 9999));
    const [worldSpeed, setWorldSpeed] = useState(1);
    const [paused, setPaused] = useState(false);
    const players = useMemo(() => makePlayers(aiCount), [aiCount]);
    const [musicOn, setMusicOn] = useState(() => {
        if (typeof window === 'undefined') return true;
        const saved = localStorage.getItem('pax_music_on');
        return saved ? saved === 'true' : true;
    });
    const [musicVolume, setMusicVolume] = useState(() => {
        const saved = localStorage.getItem('pax_music_vol');
        return saved ? Math.min(1, Math.max(0, parseFloat(saved))) : 0.6;
    });
    const audioRef = useRef(null);


    const STAR = useMemo(()=>({
        Y:{name:"Yellow – Production×2",color:"#ffd34a",prod:2,label:"Y"},
        B:{name:"Blue – Move×2 per tick",color:"#45b3ff",move:2,label:"B"},
        V:{name:"Violet – Repair×2 (idle)",color:"#c084fc",repair:2,label:"V"},
        R:{name:"Red – Defense×2",color:"#ff6b6b",defense:2,label:"R"},
        G:{name:"Green – Attack×2 on launch",color:"#35d072",attack:2,label:"G"},
        O:{name:"Orange – No bonus",color:"#ff9c42",label:"O"},
        M:{name:"Mirror (shared pool)",color:"#ffffff",label:"M"},
    }), []);

    const rngRef = useRef(makeRNG(seed));
    const [planets, setPlanets] = useState(() => generateMapWithTypes(players, totalStars, STAR, {rng:rngRef.current, weightsPreset:preset}));
    const [packets, setPackets] = useState([]);
    const packetsRef = useRef([]); useEffect(() => { packetsRef.current = packets; }, [packets]);
    const [selected, setSelected] = useState(null);
    const [status, setStatus] = useState("");
    const [elapsed, setElapsed] = useState(0);
    const rafRef = useRef(0); const nextPacketId = useRef(1); const startTime = useRef(Date.now());
    const pauseStartRef = useRef(0);
    const pausedMsRef = useRef(0);
    const [playerLabels, setPlayerLabels] = useState({});
    const TYPE_COLORS = useMemo(()=>({
        Y:'#ffd34a', B:'#45b3ff', V:'#c084fc', R:'#ff6b6b', G:'#35d072', O:'#ff9c42', M:'#ffffff'
    }),[]);
    const starfield = useMemo(() => { const r = makeRNG(seed+"-stars"); return Array.from({length: 160}, () => ({ x: randRange(r, 0, WIDTH), y: randRange(r, 0, HEIGHT), r: randRange(r, 0.4, 1.4), o: randRange(r, 0.25, 0.9) })); }, [seed]);
    const delaunay = useMemo(() => {
        const pts = planets.map(p => [p.x, p.y]);
        return Delaunay.from(pts);
    }, [planets]);
    const vor = useMemo(() => delaunay.voronoi([0,0,WIDTH,HEIGHT]), [delaunay]);
    const edgeSegs = useMemo(() => voronoiSegments(delaunay), [delaunay]);

    // AI sticky state
    const aiStickMapRef = useRef(new Map()); // key: planetId, value: {to, untilTick}
    const aiTickRef = useRef(0);

    // Mirror single-lane lock
    const mirrorRouteLockRef = useRef({ activeIdx: null, to: null, owner: null });

    function componentsByOwner(planets, owner) {
        const id2i = Object.fromEntries(planets.map((p,i)=>[p.id,i]));
        const seen = new Set();
        const comps = [];
        for (const p of planets) {
            if (p.owner !== owner || seen.has(p.id)) continue;
            const q=[p.id], comp=[];
            seen.add(p.id);
            while(q.length){
                const id=q.pop();
                const cur=planets[id2i[id]];
                comp.push(cur);
                for (const nid of cur.neighbors){
                    const nb=planets[id2i[nid]];
                    if (nb && nb.owner===owner && !seen.has(nb.id)){
                        seen.add(nb.id);
                        q.push(nb.id);
                    }
                }
            }
            comps.push(comp);
        }
        return comps;
    }

    const cellPolys = useMemo(() => {
        const polys = new Map();
        for (let i=0;i<planets.length;i++) {
            const path = vor.cellPolygon(i);
            if (!path || !path.length) continue;
            polys.set(planets[i].id, path.map(([x,y]) => ({x,y})));
        }
        return polys;
    }, [vor, planets]);

    function startGameFromMenu(settings) {
        const { ai, stars, preset, seed } = settings;

        setAiCount(ai);
        setTotalStars(stars);
        setPreset(preset);
        setSeed(seed);

        rngRef.current = makeRNG(seed);

        const newPlayers = makePlayers(ai);
        const namePool = ["Orion","Lyra","Vega","Draco","Andromeda","Phoenix","Hydra","Cygnus","Sirius","Altair","Deneb","Antares","Rigel","Polaris","Aquila","Carina","Cassiopeia"];
        const r = makeRNG(seed + "-names");
        const used = new Set();
        const labels = { p0: "You" };
        for (let i=1;i<newPlayers.length;i++){
            let pick; let tries=0;
            do { pick = namePool[Math.floor(randRange(r,0,namePool.length))]; tries++; } while(used.has(pick) && tries<50);
            used.add(pick);
            labels[`p${i}`] = pick;
        }
        setPlayerLabels(labels);

        setPlanets(generateMapWithTypes(newPlayers, stars, STAR, { rng: rngRef.current, weightsPreset: preset }));
        setPackets([]);
        setSelected(null);
        setStatus("");
        setPaused(false);
        setWorldSpeed(1);
        startTime.current = Date.now();
        pausedMsRef.current = 0;
        pauseStartRef.current = 0;
        setElapsed(0);
        setScene('playing');
    }

    const handleToggleMusic = () => setMusicOn(v => !v);
    const handleVolumeChange = (val) => setMusicVolume(val);

    function backToMenu() { setScene('menu'); }

    useEffect(() => {
        const onKey = (e) => {
            if (scene!=='playing') return;
            if (e.key==='r' || e.key==='R') newMapSameSettings();
            if (e.code==='Space') { e.preventDefault(); setPaused(p=>!p); }
            if ((e.key==='x' || e.key==='X') && selected) {
                setPlanets(ps => ps.map(q => q.id===selected.id ? { ...q, routeTo: null } : q));
                setSelected(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [scene, selected]);

    useEffect(() => {
        if (scene!=='playing') return;
        const t = setInterval(() => {
            if (!paused) setElapsed(Math.floor((Date.now()-startTime.current - pausedMsRef.current)/1000));
        }, 200);
        return () => clearInterval(t);
    }, [paused, scene]);

    function newMapSameSettings() {
        rngRef.current = makeRNG(Math.random().toString(36));
        const newPlayers = makePlayers(aiCount);
        setPlanets(generateMapWithTypes(newPlayers, totalStars, STAR, {rng: rngRef.current, weightsPreset: preset}));
        setPackets([]);
        setSelected(null);
        setStatus("");
        startTime.current = Date.now();
        pausedMsRef.current = 0;
        pauseStartRef.current = 0;
        setElapsed(0);
    }

    useEffect(() => {
        if (scene!=='playing') return;
        if (paused) { pauseStartRef.current = Date.now(); }
        else { if (pauseStartRef.current) { pausedMsRef.current += Date.now() - pauseStartRef.current; pauseStartRef.current = 0; } }
        const timer = setInterval(() => {
            if (paused) return;
            setPlanets(ps => {
                const arr = ps.map(p => ({...p, damaged:{...p.damaged}, invaders:{...p.invaders}, invadersEff:{...p.invadersEff}}));

                // Production
                for (const p of arr) if (p.owner !== 'neutral') {
                    const prodMul = STAR[p.starType]?.prod || 1;
                    p.ships += p.prod * prodMul * worldSpeed;
                }

                // --- Sending (centralized for mirrors) ---
                const GAR = 1;
                const { activeIdx: mirrorActiveIdx, to: mirrorTo } =
                    chooseMirrorRouteAndAnchor(arr, packetsRef, mirrorRouteLockRef);

                for (let i = 0; i < arr.length; i++) {
                    const p = arr[i];
                    if (p.owner === 'neutral') continue;

                    if (isMirrorPlanet(p)) {
                        if (i !== mirrorActiveIdx) continue;
                        if (!mirrorTo || !p.neighbors.includes(mirrorTo)) continue;

                        const moveFactor = (STAR[p.starType]?.move || 1);
                        const desired = p.ships * 0.10 * moveFactor;
                        const available = Math.max(0, p.ships - GAR);
                        const send = Math.min(desired, available);
                        if (send > 0.01) {
                            p.ships -= send;
                            const toNode = arr.find(q => q.id === mirrorTo);
                            if (toNode) queuePacket(p.id, toNode.id, p.owner, send, p, toNode, STAR);
                        }
                        arr[i] = { ...arr[i], routeTo: mirrorTo ?? null };
                        continue;
                    }

                    if (!p.routeTo || !p.neighbors.includes(p.routeTo)) {
                        if (p.routeTo) arr[i] = { ...p, routeTo: null };
                        continue;
                    }
                    const moveFactor = (STAR[p.starType]?.move || 1);
                    const desired = p.ships * 0.10 * moveFactor;
                    const available = Math.max(0, p.ships - GAR);
                    const send = Math.min(desired, available);
                    if (send > 0.01) {
                        p.ships -= send;
                        const to = arr.find(q => q.id === p.routeTo);
                        if (to) queuePacket(p.id, to.id, p.owner, send, p, to, STAR);
                    }
                }

                // Combat tick
                for (const p of arr) {
                    const invKeys = Object.keys(p.invaders).filter(k => p.invaders[k] > 0 && k !== p.owner);
                    const under = invKeys.length > 0;
                    if (under) p.underAttackTicks = Math.min(p.underAttackTicks + 1, 20); else p.underAttackTicks = Math.max(0, p.underAttackTicks - 1);
                    if (!under) continue;

                    const atkEff = invKeys.reduce((s,k)=> s + (p.invadersEff[k]||0), 0);
                    let defEff = p.ships * ((STAR[p.starType]?.defense) || 1);
                    const BASE_DEF_BIAS = 1.2;
                    defEff *= BASE_DEF_BIAS;

                    const K_ATK = 0.22;
                    const K_DEF = 0.30;
                    const defLoss = Math.min(p.ships, K_ATK * atkEff);
                    const atkLossTotal = Math.min(invKeys.reduce((s,k)=> s + p.invaders[k], 0), K_DEF * defEff);

                    const destroyFrac = Math.min(0.30 + 0.04 * p.underAttackTicks, 0.80);
                    const damageFrac = 1 - destroyFrac;

                    p.ships -= defLoss;
                    p.damaged[p.owner] = (p.damaged[p.owner] || 0) + defLoss * damageFrac;

                    const totalEff = Math.max(1e-6, atkEff);
                    for (const k of invKeys) {
                        const share = (p.invadersEff[k] || 0) / totalEff;
                        const loss = atkLossTotal * share;
                        p.invaders[k] = Math.max(0, (p.invaders[k]||0) - loss);
                        p.invadersEff[k] = Math.max(0, (p.invadersEff[k]||0) - loss * ((p.invadersEff[k]||0)/(p.invaders[k]+loss+1e-6)));
                        p.damaged[k] = (p.damaged[k] || 0) + loss * damageFrac;
                    }

                    const remainingInv = invKeys.reduce((s,k)=> s + (p.invaders[k]||0), 0);
                    if (p.ships <= 0 && remainingInv > 0) {
                        let winner = invKeys[0]; let best = p.invaders[winner];
                        for (const k of invKeys) if (p.invaders[k] > best) { winner = k; best = p.invaders[k]; }
                        const oldOwner = p.owner;
                        const defDam = p.damaged[oldOwner] || 0;
                        if (defDam > 0) {
                            const neighbors = p.neighbors.map(id => arr.find(q=>q.id===id)).filter(q => q && q.owner===oldOwner);
                            if (neighbors.length) {
                                const destroyed = defDam * 0.25;
                                const retreating = defDam - destroyed;
                                const per = retreating / neighbors.length;
                                for (const nb of neighbors) { if (!nb) continue; queueRetreat(p.id, nb.id, oldOwner, per, p, nb); }
                            } else {
                                const captured = defDam * 0.5;
                                p.ships += captured;
                            }
                            p.damaged[oldOwner] = 0;
                        }
                        p.owner = winner;
                        p.routeTo = null;
                        const gain = remainingInv;
                        p.ships += gain;
                        p.invaders = {};
                        p.invadersEff = {};
                        p.underAttackTicks = 0;
                    } else if (remainingInv <= 0) {
                        for (const k of Object.keys(p.damaged)) if (k !== p.owner) delete p.damaged[k];
                    }
                }

                // Repairs
                for (const p of arr) {
                    const under = Object.keys(p.invaders).some(k => k!==p.owner && p.invaders[k]>0);
                    for (const [owner, dmgVal] of Object.entries(p.damaged)) {
                        if (owner === p.owner) {
                            const base = 0.05 * worldSpeed; let mult = 1.0;
                            if (p.starType === 'V') mult = under ? 1.0 : 2.0; else if (under) mult = 0.2;
                            const repair = Math.min(dmgVal, dmgVal * base * mult);
                            p.damaged[owner] -= repair; p.ships += repair;
                        } else {
                            if (!under) delete p.damaged[owner];
                        }
                    }
                }

                // Mirror sync: copy active anchor (or canon) state to other M copies
                {
                    const { idxs: mirrorIdxs, canonIdx } = getMirrorGroup(arr);
                    const srcIdx = mirrorRouteLockRef.current.activeIdx ?? canonIdx;
                    if (srcIdx != null && mirrorIdxs.length > 1) {
                        const src = arr[srcIdx];
                        for (const i of mirrorIdxs) {
                            if (i === srcIdx) continue;
                            arr[i] = {
                                ...arr[i],
                                owner: src.owner,
                                ships: src.ships,
                                damaged: { ...src.damaged },
                                invaders: { ...src.invaders },
                                invadersEff: { ...src.invadersEff },
                                underAttackTicks: src.underAttackTicks,
                                routeTo: src.routeTo ?? null,
                            };
                        }
                    }
                }

                return arr;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [worldSpeed, paused, scene]);

    useEffect(() => {
        if (scene!=='playing') return;
        let last = performance.now();
        function step(now) {
            const dt = Math.min(0.05, (now - last)/1000);
            last = now;
            if (!paused) setPackets(pk => pk.map(pkt => ({ ...pkt, t: pkt.t + pkt.speed * worldSpeed * dt })));
            rafRef.current = requestAnimationFrame(step);
        }
        rafRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafRef.current);
    }, [worldSpeed, paused, scene]);

    useEffect(() => {
        if (scene!=='playing') return;
        setPackets(pkts => {
            const arriving = pkts.filter(p => p.t >= 1);
            if (!arriving.length) return pkts;
            const inflight = pkts.filter(p => p.t < 1);
            setPlanets(ps => {
                const arr = ps.map(p => ({...p, damaged:{...p.damaged}, invaders:{...p.invaders}, invadersEff:{...p.invadersEff}}));
                const { idxs: mirrorIdxs, canonIdx: mirrorCanonIdx } = getMirrorGroup(arr);
                for (const f of arriving) {
                    let idx = arr.findIndex(p => p.id === f.to);
                    if (idx < 0) continue;
                    if (mirrorCanonIdx != null && isMirrorPlanet(arr[idx])) {
                        idx = mirrorCanonIdx; // redirect arrivals to the single mirror pool
                    }
                    let target = arr[idx];
                    if (target.owner === f.owner) {
                        if (f.retreat) {
                            const repaired = f.amount * 0.5;
                            const stillDam = f.amount - repaired;
                            target.ships += repaired;
                            target.damaged[f.owner] = (target.damaged[f.owner]||0) + stillDam;
                        } else {
                            target.ships += f.amount;
                        }
                    } else {
                        target.invaders[f.owner] = (target.invaders[f.owner]||0) + f.amount;
                        target.invadersEff[f.owner] = (target.invadersEff[f.owner]||0) + f.amount * f.atkMult;
                    }
                }
                return arr;
            });
            return inflight;
        });
    });

    useEffect(() => {
        if (scene !== 'playing') return;

        const PLAN_INTERVAL = 2200;
        const SWITCH_COOLDOWN = 2;
        const DANGER_GARRISON_BONUS = 15;

        const timer = setInterval(() => {
            if (paused) return;
            aiTickRef.current += 1;

            setPlanets(ps => {
                const arr = ps.map(p => ({ ...p }));
                const byIdLocal = Object.fromEntries(arr.map(p => [p.id, p]));
                const plannedInbound = inboundPlanCounts(arr);

                for (const pl of players) {
                    if (pl.kind !== 'ai') continue;

                    const me = componentTotals(arr, pl.id);
                    const rivals = players.filter(x => x.id !== pl.id);
                    const theirShips = rivals.reduce((s, r) => s + componentTotals(arr, r.id).ships, 0);
                    const aggressive = me.ships > theirShips * 0.9;

                    const distMap = computeFrontlineDistances(arr, pl.id);

                    // PASS 1: urgent defense
                    const urgent = arr.filter(p =>
                        p.owner === pl.id &&
                        Object.entries(p.invaders || {}).some(([k, v]) => k !== pl.id && v > 0)
                    );
                    for (const t of urgent) {
                        const donors = t.neighbors
                            .map(id => byIdLocal[id])
                            .filter(nb => nb && nb.owner === pl.id)
                            .sort((a, b) =>
                                estimateTravelSeconds(a, t, worldSpeed) -
                                estimateTravelSeconds(b, t, worldSpeed)
                            );

                        for (const d of donors) {
                            const border = isBorderPlanet(d, byIdLocal);
                            const need = border ? DANGER_GARRISON_BONUS : 10;
                            if ((d.ships - need) > t.ships * 0.1) {
                                const sticky = aiStickMapRef.current.get(d.id);
                                if (!sticky || sticky.untilTick <= aiTickRef.current || sticky.to === t.id) {
                                    aiStickMapRef.current.set(d.id, { to: t.id, untilTick: aiTickRef.current + SWITCH_COOLDOWN });
                                    const idx = arr.findIndex(x => x.id === d.id);
                                    if (idx >= 0) arr[idx] = { ...arr[idx], routeTo: t.id };
                                }
                            }
                        }
                    }

                    // PASS 2: per-planet routing
                    for (let i = 0; i < arr.length; i++) {
                        const p = arr[i];
                        if (p.owner !== pl.id) continue;

                        const neighbors = p.neighbors.map(id => byIdLocal[id]).filter(Boolean);
                        if (!neighbors.length) {
                            arr[i] = { ...p, routeTo: null };
                            continue;
                        }

                        const border = isBorderPlanet(p, byIdLocal);
                        const minGAR = border ? DANGER_GARRISON_BONUS : 10;
                        if (p.ships <= minGAR) {
                            const sticky = aiStickMapRef.current.get(p.id);
                            if (!sticky || sticky.untilTick <= aiTickRef.current) {
                                arr[i] = { ...p, routeTo: null };
                            }
                            continue;
                        }

                        let best = null;
                        const hereD = distMap.get(p.id);

                        for (const nb of neighbors) {
                            const nbD = distMap.get(nb.id);
                            let sc = 0;

                            if (nb.owner === pl.id) {
                                const nbUnder = Object.entries(nb.invaders || {}).some(([k, v]) => k !== pl.id && v > 0);
                                if (nbUnder) sc += 60;
                                if (isBorderPlanet(nb, byIdLocal)) sc += 15;
                            } else if (nb.owner === 'neutral') {
                                const val = planetValue(nb, STAR);
                                sc += 35 + 8 * val - 0.25 * nb.ships;
                            } else {
                                const mySendable = Math.max(0, p.ships - minGAR) * 0.6;
                                const odds = winOdds(mySendable, nb.ships, nb.starType, STAR, nb.underAttackTicks);
                                sc += (aggressive ? 28 : 12) * odds;
                                if (isBorderPlanet(nb, byIdLocal)) sc += 6;
                                sc += 3 * planetValue(nb, STAR);
                            }

                            // frontline gradient
                            if (hereD != null && nbD != null) sc += 12 * Math.max(0, hereD - nbD);

                            // sink avoidance
                            sc -= 0.02 * nb.ships;
                            sc -= 4 * (plannedInbound.get(nb.id) || 0);

                            // stickiness
                            const sticky = aiStickMapRef.current.get(p.id);
                            if (sticky && sticky.to === nb.id && sticky.untilTick > aiTickRef.current) {
                                const keepBonus = (hereD != null && nbD != null && nbD >= hereD) ? 1 : 6;
                                sc += keepBonus;
                            }

                            const etaProxy = estimateTravelSeconds(p, nb, worldSpeed);
                            sc -= 6 * etaProxy;

                            if (!best || sc > best.sc) best = { nb, sc };
                        }

                        if (best) {
                            const sticky = aiStickMapRef.current.get(p.id);
                            const wantSwitch = !sticky ||
                                sticky.untilTick <= aiTickRef.current ||
                                sticky.to === best.nb.id;
                            if (wantSwitch) {
                                aiStickMapRef.current.set(p.id, { to: best.nb.id, untilTick: aiTickRef.current + SWITCH_COOLDOWN });
                                arr[i] = { ...arr[i], routeTo: best.nb.id };
                                plannedInbound.set(best.nb.id, (plannedInbound.get(best.nb.id) || 0) + 1);
                            }
                        }
                    }

                    // PASS 3: cut hopeless attacks
                    for (let i = 0; i < arr.length; i++) {
                        const p = arr[i];
                        if (p.owner !== pl.id || !p.routeTo) continue;
                        const to = byIdLocal[p.routeTo]; if (!to) continue;

                        if (to.owner !== pl.id && to.owner !== 'neutral') {
                            const mySendable = Math.max(0, p.ships - (isBorderPlanet(p, byIdLocal) ? DANGER_GARRISON_BONUS : 10)) * 0.6;
                            const odds = winOdds(mySendable, to.ships, to.starType, STAR, to.underAttackTicks);
                            if (odds < (aggressive ? 0.55 : 0.8)) {
                                const sticky = aiStickMapRef.current.get(p.id);
                                if (!sticky || sticky.untilTick <= aiTickRef.current) {
                                    arr[i] = { ...arr[i], routeTo: null };
                                }
                            }
                        }
                    }
                } // players loop

                return arr;
            });
        }, PLAN_INTERVAL);

        return () => clearInterval(timer);
    }, [players, worldSpeed, paused, scene, STAR]);

    // Create the Audio element once
    useEffect(() => {
        if (!audioRef.current) {
            const a = new Audio(DEFAULT_MUSIC_URL);
            a.loop = true;
            a.volume = musicVolume;
            audioRef.current = a;
        }
        return () => {
            // If this component ever unmounts entirely
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // React to musicOn / musicVolume changes
    useEffect(() => {
        localStorage.setItem('pax_music_on', String(musicOn));
        localStorage.setItem('pax_music_vol', String(musicVolume));
        const a = audioRef.current;
        if (!a) return;

        a.volume = musicVolume;

        if (musicOn) {
            // Browser autoplay policies require a user gesture.
            // Toggling the button is a gesture—so try playing, swallow any promise rejection.
            a.play().catch(() => {});
        } else {
            a.pause();
        }
    }, [musicOn, musicVolume]);

    // Hotkey: 'M' to toggle music
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'm' || e.key === 'M') {
                setMusicOn((v) => !v);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    function queuePacket(fromId, toId, owner, amount, a, b, STARMAP) {
        const dist = distance(a, b);
        let edgeSpeed = 0.55 / Math.max(0.2, dist/420);
        const atkMult = (STARMAP[a.starType]?.attack || 1);
        const id = nextPacketId.current++;
        setPackets(pk => [...pk, { id, from: fromId, to: toId, owner, amount, t: 0, speed: edgeSpeed, atkMult, srcType:a.starType }]);
    }
    function queueRetreat(fromId, toId, owner, amount, a, b) {
        const dist = distance(a, b);
        let edgeSpeed = 0.55 / Math.max(0.2, dist/420);
        const id = nextPacketId.current++;
        setPackets(pk => [...pk, { id, from: fromId, to: toId, owner, amount, t: 0, speed: edgeSpeed, atkMult:1, srcType:a.starType, retreat:true }]);
    }
    function ownerColor(o) { return o==='neutral' ? '#9aa1ac' : (players.find(pl => pl.id===o)?.color || '#fff'); }
    function isNeighbor(a, b) { return a.neighbors.includes(b.id); }
    const byId = useMemo(() => Object.fromEntries(planets.map(p => [p.id, p])), [planets]);

    const flowTotals = useMemo(() => {
        const m = new Map();
        for (const f of packets) {
            const key = `${f.from}-${f.to}-${f.owner}`;
            m.set(key, (m.get(key)||0) + f.amount);
        }
        return m;
    }, [packets]);

    const scoreboard = useMemo(() => {
        const { idxs, canonIdx } = getMirrorGroup(planets);
        const mirrorCanonId = canonIdx != null ? planets[canonIdx].id : null;

        return players.map(pl => {
            let ships=0, prodRate=0, inflight=0;
            for (const p of planets) if (p.owner===pl.id){
                if (isMirrorPlanet(p)) {
                    if (p.id !== mirrorCanonId) continue; // count shared pool once
                }
                ships += p.ships;
                prodRate += p.prod * ((STAR[p.starType]?.prod)||1);
            }
            for (const f of packets) if (f.owner===pl.id) inflight += f.amount;
            const effectiveProd = prodRate * worldSpeed;
            return {
                id: pl.id,
                name: playerLabels[pl.id] || pl.name,
                kind: pl.kind,
                color: pl.color,
                armies: Math.floor(ships + inflight),
                prod: Math.floor(effectiveProd)
            };
        }).sort((a,b)=> b.armies - a.armies);
    }, [players, planets, packets, playerLabels, STAR, worldSpeed]);

    function typeColor(t){ return TYPE_COLORS[t] || '#ffffff'; }
    function fontScale(v){ const val = Math.max(1, v||0); const s = 12 + 4*Math.log10(val); return Math.max(12, Math.min(28, s)); }
    function fontScaleLane(v){ const val = Math.max(1, v||0); const s = 11 + 2.5*Math.log10(val); return Math.max(11, Math.min(20, s)); }
    function fmt(n){ if (n>=1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M'; if (n>=1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K'; return String(n|0); }

    if (scene==='menu') {
        return (
            <MenuScreen
                musicOn={musicOn}
                musicVolume={musicVolume}
                onToggleMusic={handleToggleMusic}
                onVolumeChange={handleVolumeChange}
                onStart={startGameFromMenu}
            />
        );
    }

    return (
        <div className="w-full flex flex-col items-center gap-3 select-none">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold">Pax Flow — Classic Look</h1>
                <button onClick={backToMenu} className="px-3 py-1 rounded-2xl shadow border text-sm">Back to Menu</button>
                <button onClick={newMapSameSettings} className="px-3 py-1 rounded-2xl shadow border text-sm">New Map</button>
                <button onClick={()=>setPaused(p=>!p)} className="px-3 py-1 rounded-2xl shadow border text-sm">{paused? 'Resume' : 'Pause'}</button>
                <div className="flex items-center gap-1 text-sm">
                    <span className="opacity-70">Speed</span>
                    {[0.5,1,1.5,2].map(s => (
                        <button key={s} onClick={()=>setWorldSpeed(s)} className={`px-2 py-0.5 rounded-2xl border text-sm ${worldSpeed===s?"bg-black/10 font-semibold":""}`}>{s}x</button>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="opacity-70">Music</span>
                    <button
                        onClick={() => setMusicOn(v => !v)}
                        className={`px-2 py-0.5 rounded-2xl border text-sm ${musicOn ? "bg-black/10 font-semibold" : ""}`}
                        title="Toggle music (M)"
                    >
                        {musicOn ? 'On' : 'Off'}
                    </button>
                    <input
                        type="range"
                        min="0" max="1" step="0.01"
                        value={musicVolume}
                        onChange={e => setMusicVolume(parseFloat(e.target.value))}
                        style={{ width: 90 }}
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs opacity-90">
                <div className="font-medium">Legend:</div>
                <div className="flex items-center gap-1">Owner boundaries</div>
                <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-yellow-400"/> Star type = core</div>
                <div className="ml-4 italic">Spacebar pauses</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs opacity-90">
                {Object.entries(STAR).map(([k,v]) => (
                    <div key={k} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{background: TYPE_COLORS[k]}}/><span>{v.label}: {v.name}</span></div>
                ))}
            </div>

            <svg width={WIDTH} height={HEIGHT} className="rounded-xl shadow border" style={{background:"radial-gradient(ellipse at 40% 50%, #0b1b38 0%, #091426 55%, #07101f 100%)"}}>
                <defs>
                    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <filter id="arrowGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.8" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    {Object.entries(TYPE_COLORS).map(([k,c]) => (
                        <radialGradient id={`core-${k}`} key={k} cx="50%" cy="50%" r="60%">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
                            <stop offset="45%" stopColor={c} stopOpacity="0.95"/>
                            <stop offset="100%" stopColor={c} stopOpacity="1"/>
                        </radialGradient>
                    ))}
                    <filter id="laneGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="lg"/><feMerge><feMergeNode in="lg"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>

                {/* background stars */}
                <g style={{pointerEvents:'none'}}>
                    {starfield.map((s,i)=> <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cbd5e1" opacity={s.o} />)}
                </g>

                {/* ownership fills (clipped to radius around each star) */}
                {players.map(pl => {
                    const comps = componentsByOwner(planets, pl.id);
                    return (
                        <g key={'fills-'+pl.id} opacity={0.14}>
                            {comps.map((comp,ci) => (
                                <g key={ci} fill={ownerColor(pl.id)}>
                                    {comp.map(star => {
                                        const poly = cellPolys.get(star.id);
                                        if (!poly || !poly.length) return null;
                                        const d = `M${poly.map(p=>`${p.x},${p.y}`).join('L')}Z`;
                                        return <path key={star.id} d={d} />;
                                    })}
                                </g>
                            ))}
                        </g>
                    );
                })}

                {/* black gap along inter-owner Voronoi edges */}
                <g stroke="#07101f" strokeWidth={8} strokeOpacity={1}>
                    {edgeSegs.map((s,idx) => {
                        const A = planets[s.i], B = planets[s.j];
                        if (!A || !B || A.owner === B.owner) return null;
                        return <line key={'gap-'+idx} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />;
                    })}
                </g>

                {/* colored borders offset to each side */}
                <g>
                    {edgeSegs.map((s,idx) => {
                        const A = planets[s.i], B = planets[s.j];
                        if (!A || !B || A.owner === B.owner) return null;
                        const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
                        const L = Math.hypot(dx,dy) || 1;
                        const nx = -dy / L, ny = dx / L; // unit normal
                        const push = 2.2, w = 3.5;
                        return (
                            <g key={'edge-'+idx} strokeWidth={w} strokeOpacity={0.98}>
                                <line x1={s.x1 + nx*push} y1={s.y1 + ny*push} x2={s.x2 + nx*push} y2={s.y2 + ny*push} stroke={ownerColor(A.owner)} />
                                <line x1={s.x1 - nx*push} y1={s.y1 - ny*push} x2={s.x2 - nx*push} y2={s.y2 - ny*push} stroke={ownerColor(B.owner)} />
                            </g>
                        );
                    })}
                </g>

                {/* hyperlanes */}
                {planets.map(a => a.neighbors.map(id => {
                    const b = byId[id];
                    if (!b || a.id > b.id) return null;
                    const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx,dy) || 1; const ux = dx/L, uy = dy/L;
                    const sx = a.x + ux*(RADIUS+2), sy=a.y + uy*(RADIUS+2);
                    const tx=b.x - ux*(RADIUS+2), ty=b.y - uy*(RADIUS+2);
                    return <line key={`lane-${a.id}-${b.id}`} x1={sx} y1={sy} x2={tx} y2={ty}
                                 stroke="#9fb8ff" strokeOpacity={0.75} strokeWidth={2.2}
                                 strokeDasharray="2 7" filter="url(#laneGlow)" />;
                }))}

                {/* route indicators + flow amounts */}
                {planets.map(p => {
                    if (!p.routeTo || !p.neighbors.includes(p.routeTo)) return null;
                    const a = p, b = byId[p.routeTo];
                    if (!b) return null;
                    const ownerCol = ownerColor(p.owner);
                    const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx,dy)||1; const ux = dx/L, uy = dy/L;
                    const sx = a.x + ux*(RADIUS+2), sy=a.y + uy*(RADIUS+2);
                    const tx=b.x - ux*(RADIUS+2), ty=b.y - uy*(RADIUS+2);
                    const angle = Math.atan2(dy, dx) * 180/Math.PI;
                    const isCombat = (b.invaders && (b.invaders[p.owner]||0) > 0);
                    const arrowCol = isCombat ? '#ff4d4d' : '#ffffff';
                    const reps = [];
                    for (let i=1;i<=3;i++){
                        const t=(i)/(3+1);
                        const pos = lerp(a,b,t);
                        reps.push(<polygon key={i} points="0,0 12,6 0,12" transform={`translate(${pos.x-6},${pos.y-6}) rotate(${angle},6,6)`} fill={arrowCol} opacity={0.95} filter="url(#arrowGlow)" />);
                    }
                    return (
                        <g key={`route-${p.id}-${b.id}`}>
                            <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={ownerCol} strokeOpacity="0.85" strokeWidth={2.6} />
                            {reps}
                            {(() => {
                                const amt = flowTotals.get(`${p.id}-${b.id}-${p.owner}`);
                                if (!amt) return null;
                                const midx=(sx+tx)/2, midy=(sy+ty)/2;
                                return (
                                    <g>
                                        <text x={midx} y={midy-8} textAnchor="middle" fontSize={fontScaleLane(amt)} fill="#fff" stroke="#000" strokeWidth="3">{Math.floor(amt)}</text>
                                        <text x={midx} y={midy-8} textAnchor="middle" fontSize={fontScaleLane(amt)} fill="#fff">{Math.floor(amt)}</text>
                                    </g>
                                );
                            })()}
                        </g>
                    );
                })}

                {/* moving packets */}
                {packets.map(f => {
                    const a = byId[f.from]; const b = byId[f.to];
                    if (!a || !b) return null;
                    const pos = lerp(a,b, Math.min(1,f.t));
                    const color = ownerColor(f.owner);
                    return <circle key={f.id} cx={pos.x} cy={pos.y} r={4.0} fill={color} filter="url(#softGlow)" />;
                })}

                {/* stars */}
                {planets.map(p => {
                    const neighborHighlight = selected && isNeighbor(selected, p);
                    const under = Object.keys(p.invaders).some(k => k!==p.owner && p.invaders[k]>0);
                    return (
                        <g key={p.id} onClick={() => handlePlanetClick(p)} style={{ cursor: selected && (neighborHighlight || p.id===selected.id) ? 'pointer' : 'default' }}>
                            <circle cx={p.x} cy={p.y} r={RADIUS} fill={`url(#core-${p.starType})`} stroke={selected?.id===p.id? '#fff':'#0a0e1a'} strokeWidth={selected?.id===p.id?3:2} />
                            {selected && isNeighbor(selected, p) && (<circle cx={p.x} cy={p.y} r={RADIUS+16} fill="none" stroke="#9ac1ff" strokeOpacity={0.9} strokeWidth={2} strokeDasharray="2 6" />)}
                            {under && (<circle cx={p.x} cy={p.y} r={RADIUS+18} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={2} strokeDasharray="1 5" />)}
                            <text x={p.x} y={p.y-28} textAnchor="middle" fontSize={fontScale(p.ships)} fill="#e6edf7">{fmt(Math.floor(displayShips(p, byId, planets)))}</text>
                            <text x={p.x} y={p.y-12} textAnchor="middle" fontSize={11} fill="#e6edf7">{`${fmt(Math.floor((p.damaged && p.damaged[p.owner])||0))}/${Math.max(1,Math.round(p.prod*((p.starType==='Y')?2:1)*10)/10)}`}</text>
                        </g>
                    );
                })}

                <text x={40} y={26} textAnchor="start" fontSize="14" fill="#e6edf7">{formatTime(elapsed)}</text>
            </svg>

            <div className="w-full max-w-[980px]">
                <div className="mt-2 rounded-xl border border-slate-700/60 bg-slate-900/40">
                    <div className="grid grid-cols-4 px-3 py-2 text-xs opacity-70">
                        <div>Name</div><div>Type</div><div>Armies</div><div>Production</div>
                    </div>
                    {scoreboard.map(row => (
                        <div key={row.id} className="grid grid-cols-4 px-3 py-1 items-center text-sm border-t border-slate-700/40">
                            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full" style={{background: row.color}}></span><span>{row.name}</span></div>
                            <div>{row.kind==='human' ? 'Human' : 'Computer'}</div>
                            <div className="font-semibold">{row.armies}</div>
                            <div>{row.prod}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="text-sm opacity-80">Mirrors (white) are the same planet shown in multiple spots—one shared pool, one active lane at a time. Send ≈10%/tick (Blue ≈2×). Violet repairs 2× when idle; under attack non-V repair at 1/5. On capture, defender damage retreats to neighbors; new owner garrisons until you set a route. Click your planet → neighbor to route; click again or press X to stop; Space pauses.</div>
        </div>
    );

    function handlePlanetClick(p) {
        if (status) return;
        const me = players[0];
        if (!selected) { if (p.owner === me.id) setSelected(p); return; }
        if (p.id === selected.id) {
            setPlanets(ps => ps.map(q => q.id===selected.id ? { ...q, routeTo: null } : q));
            setSelected(null);
            return;
        }
        if (!isNeighbor(selected, p)) { setSelected(null); return; }
        setPlanets(ps => ps.map(q => q.id===selected.id ? { ...q, routeTo: p.id } : q));
        setSelected(null);
    }
    function formatTime(sec){ const m = Math.floor(sec/60), s = sec%60; return `${m}:${s.toString().padStart(2,'0')}`; }
}
