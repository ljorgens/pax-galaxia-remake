# Pax Flow — README

*A modern, fast remake of a classic “send-ships-along-lanes” space strategy game.*  
You build up planets, set routes, and the economy/AI/combat all tick in real time. The UI shows smooth owner borders (Voronoi), hyperlanes, and clear flow arrows. This doc explains **every system** so designers, engineers, and playtesters understand the rules.

---

## Table of Contents
- [TL;DR (How to Play)](#tldr-how-to-play)
- [Installation & Running](#installation--running)
- [Menu Settings](#menu-settings)
- [Controls](#controls)
- [UI & Visuals](#ui--visuals)
- [Entities & Star Types](#entities--star-types)
- [Economy & Production](#economy--production)
- [Movement & Routing](#movement--routing)
- [Combat Model](#combat-model)
- [Mirror Planets (M)](#mirror-planets-m)
- [AI (Computer Players)](#ai-computer-players)
- [Map Generation](#map-generation)
- [Simulation Timing](#simulation-timing)
- [Scoreboard](#scoreboard)
- [Music System (Optional)](#music-system-optional)
- [Tuning Knobs (Where to Edit)](#tuning-knobs-where-to-edit)
- [Star Distribution Presets](#star-distribution-presets)
- [Edge Cases & Notes](#edge-cases--notes)
- [Developer Notes (Architecture)](#developer-notes-architecture)
- [Roadmap Ideas](#roadmap-ideas)
- [FAQ](#faq)

---

## TL;DR (How to Play)
- Each dot is a **planet**. Dashed lines are **hyperlanes**—you can only move along those.
- Click **your planet** → then click a **neighbor** to start sending ~10% of its ships per tick along the lane. Click again (or press **X**) to stop.
- **Star types** give bonuses (see table below). Mirrors (**M**, white) are special: they’re the **same planet shown in multiple places**.
- **Spacebar** pauses. **R** new map (same settings). **H** toggles neighbor highlights. **S** toggles speed UI. **M** toggles music.
- Goal (for now): dominate the scoreboard.

---

## Installation & Running
- The playable UI lives in a React component: `PaxFlowClassicLook`.
- Dependencies: `react`, `d3-delaunay`.
- Add and render it in your app; it runs entirely client-side.

```bash
npm i d3-delaunay
# or
yarn add d3-delaunay
```

If you enable the music toggle, serve your audio from `/public/audio/...` or import it as a module so bundlers fingerprint it.

---

## Menu Settings
- **AI Players:** 1–12 computer opponents.
- **Total Stars:** 12–120 (includes player starts).
- **Lane Density:** 2–5 per star, or **Random (1–4)**. (Actual lanes are cleaned so they don’t cross; see “Map Generation”.)
- **Star Distribution Preset:**
  - **Balanced:** default spread.
  - **Economy-Heavy:** more Yellow/Blue.
  - **Combat-Heavy:** more Red/Green.
  - **Mirror-Rich:** more mirror planets.
- **Seed:** reproducible maps; same seed → same galaxy.

---

## Controls
- **Click**: Select your planet, then click a **neighbor** to set its `routeTo`.
- **Click selected** (or **X**) to cancel its route.
- **Space**: Pause/resume simulation.
- **R**: New map with the same settings.
- **H**: Toggle always-show neighbor rings for your selection.
- **S**: Toggle speed overlay.
- **M**: Toggle music on/off (volume slider in menu and in-game toolbar).

---

## UI & Visuals
- **Voronoi owner fill** shows each owner’s area with low opacity. It’s purely visual—movement is still limited to hyperlanes.
- **Owner borders** along inter-owner Voronoi edges:
  - A thin black “gap” line, then two colored lines offset to each side (each owner’s color).
- **Dashed hyperlanes** show valid movement paths; **routes** draw as solid colored lines with arrowheads.
- **Neighbor highlight** ring renders when a selected planet can route to that neighbor.
- **Indicators**:
  - White dashed ring = planet under attack.
  - Text above planet:
    - Top: Current **ships** (big number).
    - Below: **Damaged/Supply** — e.g., `12/1.0` means 12 ships currently damaged & repairing; production rate ~1.0.

---

## Entities & Star Types
Each planet keeps:
- `owner`: `"neutral"` or a player id (`p0` is you).
- `ships`: current healthy ships stationed.
- `damaged[owner]`: stock of **damaged** ships (not fighting, repairable).
- `invaders[owner]`: attacking ships currently on the planet, per attacker.
- `invadersEff[owner]`: attacking effectiveness pool (see Combat).
- `prod`: production rate (typically `1.0`; player starts `1.1`).
- `neighbors`: list of neighbor planet ids (hyperlanes).
- `routeTo`: neighbor id to send to (optional).

**Star Types & Bonuses**

| Code | Name                          | Effect                                                |
|-----:|-------------------------------|-------------------------------------------------------|
| Y    | Yellow – Production ×2        | Production multiplier `prodMul = 2`                   |
| B    | Blue – Move ×2                | Sends ~**20%** per tick instead of 10%                |
| V    | Violet – Repair ×2 (idle)     | Double repair speed when **not** under attack         |
| R    | Red – Defense ×2              | Defense multiplier during combat                      |
| G    | Green – Attack ×2 on launch   | Packets launched **from** here carry 2× attack power |
| O    | Orange – No bonus             | —                                                     |
| M    | **Mirror (white)**            | Shared pool planet shown in multiple places           |

---

## Economy & Production
- Every 1 second, all **non-neutral** planets produce ships:
  ```js
  ships += prod * (STAR[type].prod || 1) * worldSpeed
  ```
  - `prod` is the per-planet baseline (1.0 typical; player starts 1.1).
  - Yellow doubles that multiplier.
  - `worldSpeed` globally scales the sim.

---

## Movement & Routing
- A planet with a valid `routeTo` sends a **fraction** of its ships once per second (econ tick):
  ```js
  const GAR = 10;                       // garrison floor
  const moveFactor = (STAR[type].move || 1); // 2x for Blue
  desiredSend = ships * 0.10 * moveFactor;   // baseline 10%
  available   = Math.max(0, ships - GAR);
  send        = Math.min(desiredSend, available); // never drop below GAR
  ```
- A **packet** is created and travels along the lane with progress (updated each RAF frame):
  ```js
  edgeSpeed = 0.55 / Math.max(0.2, (distance / 420)) // faster on shorter lanes
  t += edgeSpeed * worldSpeed * dt                    // dt from requestAnimationFrame
  ```
- **Flow labels** on a lane show the sum of all in-flight amounts along that route during the current second.

---

## Combat Model
When enemy packets arrive:
- If target `owner === packet.owner`:
  - If it’s a **retreat** packet, `50%` repairs into ships; `50%` becomes damaged stock.
  - Otherwise, they simply **add** to ships.
- If target `owner !== packet.owner`:
  - They become **invaders**:
    ```js
    invaders[owner]    += amount
    invadersEff[owner] += amount * atkMult   // atkMult is 2 if launched from Green
    ```

Each second, for planets **under attack** (any `invaders` present):
- Track **pressure time**: `underAttackTicks` (0–20).
- Compute totals:
  ```js
  defEff = ships * defenseMult * BASE_DEF_BIAS
  defenseMult = STAR[type].defense || 1   // Red doubles
  BASE_DEF_BIAS = 1.2

  atkEff = sum(invadersEff[k] for each attacker k)
  ```
- Exchange losses:
  ```js
  K_ATK = 0.22
  K_DEF = 0.30

  defLoss      = Math.min(ships,       K_ATK * atkEff)
  atkLossTotal = Math.min(sum(invaders), K_DEF * defEff)
  ```
- **Destroyed vs Damaged** split increases the longer a siege lasts:
  ```js
  destroyFrac = clamp(0.30 + 0.04 * underAttackTicks, 0, 0.80)
  damageFrac  = 1 - destroyFrac
  ```
  - Of any losses, `damageFrac` becomes **damaged stock** (repairable), the rest is **destroyed** permanently.
- Allocate attacker losses proportionally by **effective** pressure (stronger sources lose more).

**Capture Resolution**
- If defenders reach `ships <= 0` and any invaders remain:
  - New `owner` becomes the attacker with the **largest remaining** invader pool.
  - Defender’s **damaged stock** aftermath:
    - If the old owner has any **friendly neighbors**:
      - `25%` of that damaged stock is **destroyed** outright.
      - `75%` **retreats** to friendly neighbors (even split) as retreat packets.
    - Otherwise (isolated), **50%** converts to **ships for the new owner** (scavenged).
  - Clears invader pools and resets siege timer.

**Repairs**
- Every second, defender repairs damaged stock:
  ```js
  baseRate = 0.05 * worldSpeed          // 5% of damaged pool per second
  mult     = 2.0 if Violet and not under attack
           = 1.0 if not Violet and not under attack
           = 1.0 if Violet but under attack
           = 0.2 if not Violet and under attack

  repaired = damaged[owner] * baseRate * mult
  damaged[owner] -= repaired
  ships          += repaired
  ```
- Non-owner damaged entries (from attackers) are cleaned up if the planet is no longer under attack.

---

## Mirror Planets (M)
Mirrors are special:
- They are **one shared planet** rendered in multiple places for map variety.
- **All copies** show the **same owner, ships, damaged, invaders**, etc.
- Packets **arriving to any mirror copy** are redirected to the **canon** instance (the copy with the smallest id) so the pool stays consistent.

**Single-lane lock (anti-teleport exploit)**
- Exactly **one mirror copy** at a time is allowed to send along a lane:
  - The system prefers the **canon** copy’s route if set; otherwise the first valid routed copy.
  - While any mirror packets are **in-flight**, that active copy/route is **locked**.
  - After packets arrive, another routed copy can take over (canon preferred).

---

## AI (Computer Players)
Runs every ~**2200 ms** (tunable). The AI keeps a per-planet **“sticky”** target (cooldown) so it doesn’t oscillate routes each tick.

**Three Passes per AI:**
1) **Urgent Defense**
   - For any owned planet **under attack**, find nearest friendly neighbors and route reinforcements, keeping a **garrison** (higher if the donor is a border world).
   - Uses **frontline distance** (BFS from all enemy planets) to push help toward the front.

2) **Per-Planet Routing (Scoring)**
   For each owned planet with enough ships:
   - Score each neighbor:
     - **Friendly neighbor**: big score if it’s under attack; some score if it’s on the border.
     - **Neutral neighbor**: score by **value** (production, star bonuses, connectivity) minus current garrison.
     - **Enemy neighbor**: score by **win odds** (sendable ships vs. defender/bonuses/siege softness), bonus if border, bonus by value.
     - **Frontline gradient**: prefer moves **toward** the front.
     - **Sink avoidance**: penalize neighbors with huge ship counts or many inbound plans (avoid overcommitting).
     - **Stickiness**: small bonus to keep a recent route if still reasonable.
     - **Travel time** penalty.
   - Set `routeTo` to the highest-scoring neighbor; keep a short cooldown (prevents thrashing).

3) **Cut Hopeless Attacks**
   - If routing at an enemy but the odds are too low, cancel the route (unless still in cooldown).

**Aggression**
- If AI’s total ships ≳ 90% of all rivals combined, it becomes more aggressive (lower thresholds to attack).

**AI Garrisons**
- Donor worlds keep **15** if **border**, else **10**.

---

## Map Generation
1) **Place starts** (one per player), then **neutral planets**:
   - Random within margins; **minimum spacing** `MIN_DIST` (≈ `RADIUS * 3.2`, with a small relaxation if stuck).
2) **Initial links**:
   - Each planet connects to its **nearest** neighbor.
3) **Build target degree**:
   - For each planet, target K neighbors (either **fixed `2–5`** or **random `1–4`** per “Lane Density”). Add nearest unused neighbors until degree is reached.
4) **Remove crossings**:
   - Iterate edges; if two edges would cross, keep the **shorter** one and drop the other.
5) **Ensure global connectivity**:
   - Union-find to get components; if multiple, connect the **closest pair** across components with a **non-crossing** edge. Repeat until fully connected.
6) **Owner borders (Voronoi)**:
   - The Delaunay/Voronoi structure is used for **rendering** owner areas & borders only—**movement still follows hyperlanes**.

---

## Simulation Timing
- **Economy + Combat + Sending:** 1 Hz interval.
- **Packet Motion:** `requestAnimationFrame` (smooth interpolation).
- **AI Planning:** ~2200 ms interval.
- **World Speed:** buttons set a global multiplier (affects production & packet progress; not AI cadence).

---

## Scoreboard
For each player:
- **Armies** = `floor(healthy ships on planets + own in-flight amounts)`
- **Production** = `floor(sum(prod * prodMult) * worldSpeed)`

Mirrors count **once** (the canon instance) so shared pools don’t double count.

---

## Music System (Optional)
- One global `Audio` object, looped, volume remembered in `localStorage`.
- Toggle in **menu** and **in-game header**; hotkey **M**.
- Use an absolute/public URL or module import for reliability; include MP3 as a Safari fallback.
- Optional: pause when tab is hidden to prioritize render perf.

---

## Tuning Knobs (Where to Edit)
Search these constants/lines in the component:
- **Sending fraction**: `p.ships * 0.10 * moveFactor`
- **Min garrison**: `GAR = 10`
- **Defense bias**: `BASE_DEF_BIAS = 1.2`
- **Combat constants**: `K_ATK = 0.22`, `K_DEF = 0.30`
- **Siege softness**: `destroyFrac = 0.30 + 0.04 * underAttackTicks` (cap 0.80)
- **Repair base**: `0.05` per second; multipliers based on Violet / under-attack
- **Lane speed**: `edgeSpeed = 0.55 / max(0.2, dist/420)`
- **AI cadence**: `PLAN_INTERVAL = 2200`
- **AI stickiness**: `SWITCH_COOLDOWN = 2` (planning ticks)
- **Mirror behavior**: see `chooseMirrorRouteAndAnchor`, `getMirrorGroup`

---

## Star Distribution Presets
Assigned to **neutral** planets in `generateMapWithTypes`:

- **balanced:** `{ O:28, Y:18, B:14, V:10, R:10, G:12, M:1 }`
- **econ:** `{ O:20, Y:26, B:20, V:8, R:8,  G:12, M:1 }`
- **combat:** `{ O:20, Y:12, B:12, V:8, R:20, G:20, M:1 }`
- **tele (mirror-rich):** `{ O:22, Y:14, B:12, V:8, R:10, G:12, M:15 }`

Additionally, the generator calls `ensureAtLeastTwoMirrors` so you never end up with a single, lonely mirror.

---

## Edge Cases & Notes
- **Routes only along neighbors.** If a route becomes invalid, it’s cleared.
- **Mirror arrival redirection**: packets that target a mirror copy are redirected to the **canon** internally (keeps one shared pool).
- **Damage accounting** is per-owner; when combat ends, non-owner damage entries are pruned.
- **Victory condition**: scoreboard-driven for now. (We can add “sole survivor” or timed domination.)

---

## Developer Notes (Architecture)
- **State model**: `planets[]` (immutable updates each econ tick) + transient `packets[]`.
- **Movement**: continuous interpolation (`t` in `[0,1]`) with lane-length-adjusted speed; render every RAF frame.
- **Combat**: uses **effective** attacker power (`invadersEff`) so multi-attacker fights apportion losses sanely.
- **Borders**: Voronoi derived from planet positions; dual-color offset strokes on edges between different owners. Visual only.

---

## Roadmap Ideas
- Add **win conditions** and endgame summary.
- **Fleet burst sends** (manual launches) for tactical spikes.
- **Fog of war** & sensors.
- **Star upgrades** / spend damaged stock to repair faster.
- Difficulty settings & AI personalities (turtle, raider, expansionist).
- **Campaign seeds** with objectives.

---

## FAQ
**Why can’t I move across an area I own?**  
Movement is strictly along hyperlanes. Voronoi areas/borders are for visualization.

**My mirror routes seem to “stick” to one copy. Bug?**  
By design. Mirrors enforce a **single active lane** across all copies. While mirror packets are in-flight, the active copy/route is locked; then it can switch (canon preferred).

**Defenses feel really sticky.**  
Defenders get a bias (`1.2×`) and **Red** doubles defense. Long sieges **destroy** a higher fraction per tick (fewer “damaged” to repair later). Push with **Green** launches (2× attack) or flank to cut reinforcements.

**Can I tweak how much a planet sends?**  
Yes—edit the `0.10` send fraction (and/or `GAR`), or add a UI slider to expose it.

---

*Pax Flow — designed for clarity, speed, and satisfying large-scale battles. Have fun conquering the map!*

