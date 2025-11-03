// game/utils/map.js
import { WIDTH, HEIGHT, RADIUS } from "../constants.js";
import { makeRNG, randRange, distance } from "./math";
import { generateGraphFlexible, ensureGlobalConnectivity } from "./graph";

const NAME_POOL = [
    "Captain Vega",
    "Commander Lyra",
    "Admiral Corvus",
    "Strategist Nyx",
    "Marshal Orion",
    "Commodore Atria",
    "Overseer Kael",
    "Director Solin",
    "Navigator Rhea",
    "Legate Arden",
    "Warlord Cassian",
    "Baroness Elara",
    "Vizier Thorne",
    "High Captain Mirel",
    "Archon Selene",
    "Executor Varek",
    "Consul Idrin",
    "Magister Lio",
    "Praetor Kalix",
    "Seer Isra",
];

function makeNamePicker(rng) {
    const available = [...NAME_POOL];
    let counter = 0;
    return () => {
        if (available.length) {
            const idx = Math.floor((rng() || 0) * available.length) % available.length;
            return available.splice(idx, 1)[0];
        }
        counter += 1;
        return `Commander ${counter}`;
    };
}

export function makePlayers(aiCount, OWNER_COLORS, rng = Math.random){
    const rngFn = typeof rng === "function" ? rng : Math.random;
    const pickName = makeNamePicker(rngFn);
    const ps = [{ id: "p0", name: pickName(), color: OWNER_COLORS[0], kind: "human" }];
    for (let i=0;i<aiCount;i++) {
        ps.push({
            id: `p${i+1}`,
            name: pickName(),
            color: OWNER_COLORS[(i+1)%OWNER_COLORS.length],
            kind: "ai",
        });
    }
    return ps;
}

export function weightedPick(rng, w){ const total = Object.values(w).reduce((a,b)=>a+b,0); let r=rng()*total; for(const [k,v] of Object.entries(w)){ if((r-=v)<=0) return k; } return 'O'; }

export function ensureAtLeastTwoMirrors(planets){
    const mIdxs=[]; for(let i=0;i<planets.length;i++) if (planets[i].starType==='M') mIdxs.push(i);
    if (mIdxs.length===0) return; if (mIdxs.length>=2) return;
    const existing = mIdxs.map(i=>planets[i]);
    const candidatesNeutral=[], candidatesAny=[];
    for (let i=0;i<planets.length;i++){
        const p=planets[i]; if (p.starType==='M') continue;
        const minDistToM = Math.min(...existing.map(m=>distance(p,m)));
        const entry = { i, score:minDistToM, isNeutral:p.owner==='neutral' };
        if (entry.isNeutral) candidatesNeutral.push(entry);
        candidatesAny.push(entry);
    }
    const pickFrom = candidatesNeutral.length? candidatesNeutral : candidatesAny;
    if (!pickFrom.length) return; pickFrom.sort((a,b)=>b.score-a.score);
    planets[pickFrom[0].i].starType = 'M';
}

export function generateMap(players, totalStars, rng){
    const planets=[]; const MIN_DIST=Math.max(60, RADIUS*3.2);
    // seed with homeworlds
    for (let i=0;i<players.length;i++){
        let px,py,attempts=0;
        do { px=randRange(rng,90,WIDTH-90); py=randRange(rng,80,HEIGHT-80); attempts++; }
        while (attempts<8000 && planets.some(p=>Math.hypot(p.x-px,p.y-py)<MIN_DIST));
        planets.push({ id: planets.length+1, x:px, y:py, owner: players[i].id, ships:36, prod:1.1, routeTo:null, neighbors:[], starType:'O', damaged:{}, invaders:{}, invadersEff:{}, underAttackTicks:0 });
    }
    // fill neutrals
    let tries=0, guard=0; while(planets.length<totalStars && tries<12000){
        tries++; guard++; let x=randRange(rng,90,WIDTH-90), y=randRange(rng,80,HEIGHT-80);
        let ok = planets.every(p=>Math.hypot(p.x-x,p.y-y)>=MIN_DIST);
        if (!ok && guard%4000===0){ const relax=MIN_DIST*0.9; ok = planets.every(p=>Math.hypot(p.x-x,p.y-y)>=relax); }
        if (!ok) continue;
        planets.push({ id: planets.length+1, x, y, owner:'neutral', ships: Math.floor(randRange(rng,8,24)), prod:1.0, routeTo:null, neighbors:[], starType:'O', damaged:{}, invaders:{}, invadersEff:{}, underAttackTicks:0 });
    }
    let neighborIds = generateGraphFlexible(planets, rng);
    neighborIds = ensureGlobalConnectivity(planets, neighborIds);
    for (let i=0;i<planets.length;i++) planets[i].neighbors = neighborIds[i];
    return planets;
}

export function generateMapWithTypes(players, totalStars, STAR, { rng=makeRNG(), weightsPreset='balanced' }={}){
    const planets = generateMap(players, totalStars, rng);
    let weights;
    if (weightsPreset==='econ') weights = { O:20, Y:26, B:20, V:8, R:8, G:12, M:1 };
    else if (weightsPreset==='combat') weights = { O:20, Y:12, B:12, V:8, R:20, G:20, M:1 };
    else if (weightsPreset==='tele') weights = { O:22, Y:14, B:12, V:8, R:10, G:12, M:15 };
    else weights = { O:28, Y:18, B:14, V:10, R:10, G:12, M:1 };

    for (let i=0;i<planets.length;i++){
        if (planets[i].owner==='neutral') planets[i].starType = weightedPick(rng, weights);
        else { planets[i].starType='O'; planets[i].prod=1.1; }
    }
    ensureAtLeastTwoMirrors(planets);
    return planets;
}
