// game/utils/math.js
export function xmur3(str){ let h=1779033703^str.length; for(let i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19; } return function(){ h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909); h^=h>>>16; return h>>>0; } }
export function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; } }
export function makeRNG(seed){ const seedFn=xmur3(String(seed||Math.random())); return mulberry32(seedFn()); }
export const randRange = (rng,min,max) => rng()*(max-min)+min;
export const distance = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
export const lerp = (a,b,t) => ({ x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t });


// Travel ETA proxy
export function estimateTravelSeconds(a, b, worldSpeed){
    const dist = distance(a, b);
    let edgeSpeed = 0.55 / Math.max(0.2, dist / 420);
    return 1 / (edgeSpeed * Math.max(0.25, worldSpeed));
}


// Combat odds helper
export function winOdds(attacker, defenderShips, defenderType, STAR, underAttackTicks = 0){
    const defBias = 1.2;
    const defMult = (STAR[defenderType]?.defense) || 1;
    const defEff = defenderShips * defMult * defBias;
    const odds = attacker / (defEff + 1e-6);
    const under = Math.min(underAttackTicks, 20);
    const soft = 1 - 0.01 * under; // up to ~20% softer
    return odds * (1 / Math.max(0.6, soft));
}
