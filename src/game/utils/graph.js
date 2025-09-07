// game/utils/graph.js
import { randRange, distance } from "./math";

export function generateGraphFlexible(planets, rng){
    const N = planets.length;
    const adj = planets.map(()=>[]);
    const addEdge=(i,j)=>{ if(i===j) return; if(!adj[i].includes(j)) adj[i].push(j); if(!adj[j].includes(i)) adj[j].push(i); };

    // nearest-neighbor seed
    for (let i=0;i<N;i++){
        let bestJ=-1, bestD=Infinity;
        for (let j=0;j<N;j++){ if (j===i) continue; const d=distance(planets[i], planets[j]); if (d<bestD){bestD=d; bestJ=j;} }
        if (bestJ>=0) addEdge(i,bestJ);
    }

    // degree targets
    const minDeg=1, maxDeg=4;
    const targets = Array.from({length:N}, () => Math.floor(randRange(rng, minDeg, maxDeg+1)));
    for (let i=0;i<N;i++){
        const here = planets[i];
        const order = planets.map((p,j)=>({j, d: j===i?Infinity:distance(here,p)})).sort((a,b)=>a.d-b.d);
        let idx=0; while(adj[i].length < targets[i] && idx<order.length){ addEdge(i, order[idx++].j); }
    }

    // prune crossings by removing the longer of two crossing edges
    const orient=(a,b,c)=> (planets[b].x-planets[a].x)*(planets[c].y-planets[a].y) - (planets[b].y-planets[a].y)*(planets[c].x-planets[a].x);
    const onSeg=(a,b,c)=>{ const pa=planets[a], pb=planets[b], pc=planets[c]; return Math.min(pa.x,pb.x)<=pc.x && pc.x<=Math.max(pa.x,pb.x) && Math.min(pa.y,pb.y)<=pc.y && pc.y<=Math.max(pa.y,pb.y); };
    const segmentsCross=(a,b,c,d)=>{ if(a===c||a===d||b===c||b===d) return false; const o1=orient(a,b,c), o2=orient(a,b,d), o3=orient(c,d,a), o4=orient(c,d,b); if(o1===0&&onSeg(a,b,c))return false; if(o2===0&&onSeg(a,b,d))return false; if(o3===0&&onSeg(c,d,a))return false; if(o4===0&&onSeg(c,d,b))return false; return (o1>0)!==(o2>0) && (o3>0)!==(o4>0); };
    const edges=()=>{ const list=[]; for(let i=0;i<N;i++){ for(const j of adj[i]) if (i<j) list.push([i,j]); } return list; };

    let changed=true, guard=0; while(changed && guard<100){ changed=false; guard++; const es=edges();
        for (let a=0;a<es.length;a++){
            for (let b=a+1;b<es.length;b++){
                const [i,j]=es[a], [u,v]=es[b];
                if (segmentsCross(i,j,u,v)){
                    const dij=distance(planets[i],planets[j]); const duv=distance(planets[u],planets[v]);
                    const [ix,jx] = (dij>duv) ? [i,j] : [u,v];
                    adj[ix]=adj[ix].filter(n=>n!==jx); adj[jx]=adj[jx].filter(n=>n!==ix); changed=true;
                }
            }
        }
    }

    return adj.map(ns => ns.map(j => planets[j].id));
}

export function ensureGlobalConnectivity(planets, neighborIds){
    const n = planets.length;
    const idToIdx = Object.fromEntries(planets.map((p,i)=>[p.id,i]));
    const adj = Array.from({length:n}, ()=>[]);
    for (let i=0;i<n;i++) for (const id of (neighborIds[i]||[])){ const j = idToIdx[id]; if (j==null) continue; if(!adj[i].includes(j)) adj[i].push(j); if(!adj[j].includes(i)) adj[j].push(i); }

    const orient=(a,b,c)=> (planets[b].x-planets[a].x)*(planets[c].y-planets[a].y) - (planets[b].y-planets[a].y)*(planets[c].x-planets[a].x);
    const onSeg=(a,b,c)=>{ const pa=planets[a], pb=planets[b], pc=planets[c]; return Math.min(pa.x,pb.x)<=pc.x && pc.x<=Math.max(pa.x,pb.x) && Math.min(pa.y,pb.y)<=pc.y && pc.y<=Math.max(pa.y,pb.y); };
    const segmentsCross=(a,b,c,d)=>{ if(a===c||a===d||b===c||b===d) return false; const o1=orient(a,b,c), o2=orient(a,b,d), o3=orient(c,d,a), o4=orient(c,d,b); if(o1===0&&onSeg(a,b,c))return false; if(o2===0&&onSeg(a,b,d))return false; if(o3===0&&onSeg(c,d,a))return false; if(o4===0&&onSeg(c,d,b))return false; return (o1>0)!==(o2>0) && (o3>0)!==(o4>0); };
    const edges=()=>{ const list=[]; for(let i=0;i<n;i++){ for(const j of adj[i]) if (i<j) list.push([i,j]); } return list; };

    // Union-Find
    const parent = Array.from({length:n}, (_,i)=>i);
    const find=x=>{ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
    const unite=(a,b)=>{ a=find(a); b=find(b); if(a!==b) parent[b]=a; };
    for (const [i,j] of edges()) unite(i,j);

    const compRoots=()=>{ const s=new Set(); for(let i=0;i<n;i++) s.add(find(i)); return Array.from(s); };
    let comps = compRoots();
    let guard = 0;
    while(comps.length>1 && guard<500){ guard++;
        const compMap = new Map(); for(let i=0;i<n;i++){ const r=find(i); if(!compMap.has(r)) compMap.set(r,[]); compMap.get(r).push(i); }

        let best = null; const compArr = Array.from(compMap.values());
        for (let a=0;a<compArr.length;a++) for (let b=a+1;b<compArr.length;b++) for (const i of compArr[a]) for (const j of compArr[b]){
            const d = distance(planets[i], planets[j]);
            let crosses = false; for (const [u,v] of edges()){ if (segmentsCross(i,j,u,v)){ crosses=true; break; } }
            if (!crosses && (!best || d<best.d)) best = {i,j,d};
        }

        if (!best) break;
        if (!adj[best.i].includes(best.j)) adj[best.i].push(best.j);
        if (!adj[best.j].includes(best.i)) adj[best.j].push(best.i);
        unite(best.i,best.j);
        comps = compRoots();
    }

    return adj.map((nbrs,i)=> nbrs.map(j=> planets[j].id));
}
