// game/utils/mirror.js
import { isEqual } from "lodash-es"; // optional; you can avoid if you prefer

export const isMirrorPlanet = (p) => p.starType === 'M';

export function getMirrorGroup(planets){
    const idxs=[]; planets.forEach((p,i)=>{ if (isMirrorPlanet(p)) idxs.push(i); });
    if (!idxs.length) return { idxs: [], canonIdx: null };
    const canonIdx = idxs.reduce((best,i)=> planets[i].id < planets[best].id ? i : best, idxs[0]);
    return { idxs, canonIdx };
}

export function displayShips(p, byId, planets){
    if (!isMirrorPlanet(p)) return p.ships; const { canonIdx } = getMirrorGroup(planets);
    if (canonIdx==null) return p.ships; const canonId = planets[canonIdx].id; return byId[canonId]?.ships ?? p.ships;
}

// Single-lane lock across mirror instances
export function chooseMirrorRouteAndAnchor(arr, packetsRef, lockRef){
    const { idxs, canonIdx } = getMirrorGroup(arr);
    if (!idxs.length) return { activeIdx: null, to: null };
    const owner = arr[canonIdx]?.owner ?? null;
    const mirrorIds = idxs.map(i=>arr[i].id);
    const hasInflight = packetsRef.current.some(f => mirrorIds.includes(f.from) && !f.retreat && f.t<1);

    const candidates=[]; for (const i of idxs){ const to=arr[i].routeTo; if (to && arr[i].neighbors.includes(to)) candidates.push({i,to}); }

    if (lockRef.current.owner !== owner){ lockRef.current = { activeIdx:null, to:null, owner }; }

    if (lockRef.current.activeIdx == null){
        const canonCand = candidates.find(c=>c.i===canonIdx);
        const pick = canonCand ?? candidates[0] ?? null;
        lockRef.current.activeIdx = pick?.i ?? null;
        lockRef.current.to = pick?.to ?? null;
        lockRef.current.owner = owner;
    } else if (!hasInflight){
        const stillValid = candidates.find(c => isEqual(c, { i: lockRef.current.activeIdx, to: lockRef.current.to }));
        if (!stillValid){
            const canonCand = candidates.find(c=>c.i===canonIdx);
            const pick = canonCand ?? candidates[0] ?? null;
            lockRef.current.activeIdx = pick?.i ?? null;
            lockRef.current.to = pick?.to ?? null;
            lockRef.current.owner = owner;
        }
    }
    return { activeIdx: lockRef.current.activeIdx, to: lockRef.current.to };
}

export function ownerFleetPowerMirrorAware(arr, ownerId){
    const { canonIdx } = getMirrorGroup(arr);
    const mirrorCanonId = canonIdx != null ? arr[canonIdx].id : null;
    let ships=0, prod=0; for (const p of arr){ if (p.owner!==ownerId) continue; if (isMirrorPlanet(p) && p.id!==mirrorCanonId) continue; ships+=p.ships; prod+=p.prod; }
    return { ships, prod };
}
