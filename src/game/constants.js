// game/constants.js
export const WIDTH = 980;
export const HEIGHT = 600;
export const RADIUS = 10;


export const OWNER_COLORS = [
    "#63a6ff", "#ff6b6b", "#35d072", "#ffd166", "#b892ff",
    "#ff8c42", "#22d3ee", "#f472b6", "#a3e635", "#f59e0b",
    "#8b5cf6", "#14b8a6", "#ef4444", "#10b981", "#eab308", "#3b82f6",
];


// AI tuning
export const AI_SEND_BASE = 0.12;
export const AI_BURST = 0.45;
export const AI_BURST_COOLDOWN_TICKS = 6; // ~13s at PLAN_INTERVAL=2200ms
export const AI_OPENING_WINDOW_SEC = 50;
export const PLAN_INTERVAL = 2200;
export const SWITCH_COOLDOWN = 2; // ticks before retarget
export const ODDS_GO_AGGR = 0.45;
export const ODDS_GO_SAFE = 0.60;
export const ODDS_CANCEL_AGGR = 0.50;
export const ODDS_CANCEL_SAFE = 0.72;


export const DANGER_GARRISON_BONUS = 15; // retained legacy constant


export const TYPE_COLORS = {
    Y:'#ffd34a', B:'#45b3ff', V:'#c084fc', R:'#ff6b6b', G:'#35d072', O:'#ff9c42', M:'#ffffff'
};


export const STAR_PRESET = {
// same labels/names you have
    Y:{name:"Yellow – Production×2",color:"#ffd34a",prod:2,label:"Y"},
    B:{name:"Blue – Move×2 per tick",color:"#45b3ff",move:2,label:"B"},
    V:{name:"Violet – Repair×2 (idle)",color:"#c084fc",repair:2,label:"V"},
    R:{name:"Red – Defense×2",color:"#ff6b6b",defense:2,label:"R"},
    G:{name:"Green – Attack×2 on launch",color:"#35d072",attack:2,label:"G"},
    O:{name:"Orange – No bonus",color:"#ff9c42",label:"O"},
    M:{name:"Mirror (shared pool)",color:"#ffffff",label:"M"},
};
