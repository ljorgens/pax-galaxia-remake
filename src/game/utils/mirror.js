// game/utils/mirror.js

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
// Allows quick switching: when no packets in flight, switch to whichever mirror has a route
export function chooseMirrorRouteAndAnchor(arr, packetsRef, lockRef){
    const { idxs, canonIdx } = getMirrorGroup(arr);
    if (!idxs.length) return { activeIdx: null, to: null };
    const owner = arr[canonIdx]?.owner ?? null;
    const mirrorIds = idxs.map(i=>arr[i].id);
    const hasInflight = packetsRef.current.some(f => mirrorIds.includes(f.from) && !f.retreat && f.t<1);

    // Find all mirrors with valid routes
    const candidates=[]; for (const i of idxs){ const to=arr[i].routeTo; if (to && arr[i].neighbors.includes(to)) candidates.push({i,to}); }

    // Reset lock if owner changed
    if (lockRef.current.owner !== owner){ lockRef.current = { activeIdx:null, to:null, owner }; }

    // No lock yet - pick first candidate
    if (lockRef.current.activeIdx == null){
        const pick = candidates[0] ?? null;
        lockRef.current.activeIdx = pick?.i ?? null;
        lockRef.current.to = pick?.to ?? null;
        lockRef.current.owner = owner;
    } else if (!hasInflight){
        // No packets in flight - switch to whichever mirror has a route
        // This enables quick switching when player sets route on different mirror
        const pick = candidates[0] ?? null;
        lockRef.current.activeIdx = pick?.i ?? null;
        lockRef.current.to = pick?.to ?? null;
        lockRef.current.owner = owner;
    }
    // If packets are in flight, keep current lock (don't switch mid-send)

    return { activeIdx: lockRef.current.activeIdx, to: lockRef.current.to };
}

export function ownerFleetPowerMirrorAware(arr, ownerId){
    const { canonIdx } = getMirrorGroup(arr);
    const mirrorCanonId = canonIdx != null ? arr[canonIdx].id : null;
    let ships=0, prod=0; for (const p of arr){ if (p.owner!==ownerId) continue; if (isMirrorPlanet(p) && p.id!==mirrorCanonId) continue; ships+=p.ships; prod+=p.prod; }
    return { ships, prod };
}
