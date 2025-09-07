// game/utils/geom.js
export function circumcenter(ax, ay, bx, by, cx, cy) {
    const d = 2 * (ax*(by-cy) + bx*(cy-ay) + cx*(ay-by)) || 1e-9;
    const ux = ((ax*ax + ay*ay)*(by-cy) + (bx*bx + by*by)*(cy-ay) + (cx*cx + cy*cy)*(ay-by)) / d;
    const uy = ((ax*ax + ay*ay)*(cx-bx) + (bx*bx + by*by)*(ax-cx) + (cx*cx + cy*cy)*(bx-ax)) / d;
    return [ux, uy];
}

export function voronoiSegments(delaunay) {
    const segs = []; const {points, triangles, halfedges} = delaunay; const triOf = (e)=>Math.floor(e/3)*3;
    for (let e=0;e<halfedges.length;e++){
        const h=halfedges[e]; if (h<0) continue; if (e<h){
            const t=triOf(e), t2=triOf(h);
            const a=triangles[t], b=triangles[t+1], c=triangles[t+2];
            const a2=triangles[t2], b2=triangles[t2+1], c2=triangles[t2+2];
            const [ux,uy] = circumcenter(points[2*a],points[2*a+1],points[2*b],points[2*b+1],points[2*c],points[2*c+1]);
            const [vx,vy] = circumcenter(points[2*a2],points[2*a2+1],points[2*b2],points[2*b2+1],points[2*c2],points[2*c2+1]);
            const si = triangles[e]; const sj = triangles[e % 3 === 2 ? e-2 : e+1];
            segs.push({ x1:ux, y1:uy, x2:vx, y2:vy, i:si, j:sj });
        }
    }
    return segs;
}
