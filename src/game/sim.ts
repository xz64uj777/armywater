import {
  ELEV,
  type Hydro,
  type Kind,
  type MissionDef,
  type Place,
} from "./missions.ts";

export type WallKind = "levee" | "sandbag";
export type Mode = "build" | "fight" | "done";
export type CrewTask = "idle" | "move" | "repair" | "sandbag";

export interface Leak {
  id: number;
  ox: number;
  oz: number;
}

export interface Wall {
  kind: WallKind;
  hp: number;
  maxHp: number;
  height: number;
  breached: boolean;
  leaked?: Leak | null;
  leakCool?: number;
  /** Seconds left to plug a starting break. 0 or unset = not breaking. */
  breaking?: number;
  breakMax?: number;
  plugWork?: number;
}

export interface Pump {
  flooded: boolean;
  alarmed: boolean;
  /** Seconds left before a mid-fight move finishes. 0 or unset = pumping. */
  moving?: number;
}

export interface Cell {
  x: number;
  y: number;
  kind: Kind;
  elev: number;
  water: number;
  wall: Wall | null;
  pump: Pump | null;
  pop: number;
  label: string;
  wet: number;
  failed: boolean;
  alarmed: boolean;
  peak: number;
  buildWall: boolean;
  buildPump: boolean;
  spill: boolean;
  bridge: boolean;
}

export interface Crew {
  id: number;
  name: string;
  x: number;
  y: number;
  path: { x: number; y: number }[];
  task: CrewTask;
  intent: "repair" | "sandbag";
  work: number;
  stranded: number;
}

export interface LogLine {
  t: number;
  text: string;
}

export interface GameState {
  missionId: string;
  cols: number;
  rows: number;
  cells: Cell[];
  river: number[];
  crews: Crew[];
  mode: Mode;
  t: number;
  duration: number;
  budget: number;
  reserve: number;
  spillOpen: boolean;
  spillUsed: boolean;
  spillSeconds: number;
  hydro: Hydro;
  gaugeName: string;
  datum: number;
  scale: number;
  floodFt: number;
  majorFt: number;
  topFt: number;
  breaches: number;
  log: LogLine[];
  speed: number;
  paused: boolean;
  ended: "hold" | "fail" | null;
  endLogged: boolean;
  hitFlood: boolean;
  hitMajor: boolean;
  hitCrest: boolean;
  peakDepth: number;
  /** Forecast and other no-player runs. Skips leaks and the plug window. */
  headless?: boolean;
  leakSeq?: number;
  lastLeakAt?: number;
}

export const COSTS = { levee: 80, sandbag: 26, pump: 60, emergency: 22 } as const;

/** Mid-fight attention actions. Forecast runs skip leaks and the plug window. */
export const FIGHT = {
  leakFrac: 0.72,
  leakDmg: 4,
  leakCool: 16,
  leakGap: 7,
  leakAfter: 10,
  breakTime: 5,
  plugTaps: 6,
  plugHold: 1.15,
  pumpPress: 0.4,
  pumpMove: 2.6,
  weakFrac: 0.45,
} as const;

const LEVEE = { height: 2.45, hp: 170 };
const SANDBAG = { height: 1.25, hp: 70 };
const PUMP_RATE = 0.36;
const REPAIR_TIME = 4.2;
const SANDBAG_TIME = 2.8;
const CREW_SPEED = 2.75;
const FAIL_DEPTH = 0.34;
const SEEP: Partial<Record<Kind, number>> = {
  town: 0.0066,
  hospital: 0.0068,
  lock: 0.00115,
  farm: 0.0016,
};
const FAIL_AFTER: Partial<Record<Kind, number>> = {
  town: 13,
  hospital: 9,
  lock: 10,
  farm: 11,
};

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export type Letter = "A" | "B" | "C" | "D" | "F";

export interface Scorecard {
  letter: Letter;
  title: string;
  lines: string[];
  popSaved: number;
  popTotal: number;
  assets: { label: string; ok: boolean }[];
  farmsLost: number;
  farms: number;
  breaches: number;
  budgetLeft: number;
  reserveLeft: number;
  peakFeet: number;
  spillSeconds: number;
  spillFraction: number;
}

export interface ModelReport {
  maxWater: number[];
  failures: string[];
  holds: string[];
  peakFeet: number;
  summary: string;
}

function pushLog(state: GameState, text: string) {
  if (state.log[0]?.text === text) return;
  state.log.unshift({ t: state.t, text });
  if (state.log.length > 7) state.log.pop();
}

export function cellAt(state: GameState, x: number, y: number): Cell | null {
  if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) return null;
  return state.cells[y * state.cols + x];
}

function neighbors(state: GameState, c: Cell): Cell[] {
  const out: Cell[] = [];
  for (const [dx, dy] of DIRS) {
    const n = cellAt(state, c.x + dx, c.y + dy);
    if (n) out.push(n);
  }
  return out;
}

export function bedOf(c: Cell): number {
  let b = c.elev;
  if (c.wall && !c.wall.breached) b += c.wall.height;
  return b;
}

export function toFeet(depth: number, state: Pick<GameState, "datum" | "scale">): number {
  return state.datum + depth * state.scale;
}

export function gaugeDepth(state: GameState): number {
  const town = state.cells.find((c) => c.kind === "town");
  if (!town || state.river.length === 0) {
    if (!state.river.length) return 0;
    let s = 0;
    for (const i of state.river) s += state.cells[i].water;
    return s / state.river.length;
  }
  let best = state.river[0];
  let bd = 1e9;
  for (const i of state.river) {
    const r = state.cells[i];
    const d = Math.abs(r.x - town.x) + Math.abs(r.y - town.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return state.cells[best].water;
}

export function inflowAt(h: Hydro, u: number): number {
  const x = (u - h.peak) / h.width;
  const pulse = Math.exp(-x * x);
  return h.base + (h.crest - h.base) * pulse;
}

function rainAt(h: Hydro, u: number): number {
  const x = (u - (h.peak + 0.02)) / (h.width * 1.2);
  return h.rain * Math.exp(-x * x);
}

function surgeAt(h: Hydro, u: number): number {
  if (h.surge <= 0) return 0;
  const x = (u - 0.6) / 0.16;
  return Math.exp(-x * x);
}

function decodeChar(ch: string): { kind: Kind; elev?: number; bridge?: boolean; spill?: boolean } {
  switch (ch) {
    case "h":
      return { kind: "high" };
    case "u":
      return { kind: "upland" };
    case "r":
      return { kind: "river" };
    case "=":
      return { kind: "river", bridge: true };
    case "B":
      return { kind: "bank" };
    case "G":
      return { kind: "bank", elev: 2.32 };
    case "T":
      return { kind: "town" };
    case "H":
      return { kind: "hospital" };
    case "K":
      return { kind: "lock" };
    case "F":
      return { kind: "farm" };
    case "W":
      return { kind: "wetland" };
    case "D":
      return { kind: "depot" };
    case "s":
      return { kind: "basin", spill: true };
    case "+":
      return { kind: "road" };
    default:
      throw new Error(`Unknown map cell "${ch}"`);
  }
}

function traceRiver(cells: Cell[], cols: number): number[] {
  const rivers = cells.filter((c) => c.kind === "river");
  if (!rivers.length) return [];
  let inlet = rivers[0];
  for (const c of rivers) {
    const north = c.y > 0 ? cells[(c.y - 1) * cols + c.x] : null;
    if (!north || north.kind !== "river") {
      if (c.y < inlet.y || (c.y === inlet.y && c.x < inlet.x)) inlet = c;
    }
  }
  const order: number[] = [];
  const seen = new Set<number>();
  let cur: Cell | null = inlet;
  const prefer = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
  ] as const;
  while (cur && !seen.has(cur.y * cols + cur.x)) {
    const id = cur.y * cols + cur.x;
    order.push(id);
    seen.add(id);
    let next: Cell | null = null;
    for (const [dx, dy] of prefer) {
      const nx: number = cur.x + dx;
      const ny: number = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= cells.length / cols) continue;
      const j: number = ny * cols + nx;
      if (cells[j].kind === "river" && !seen.has(j)) {
        next = cells[j];
        break;
      }
    }
    cur = next;
  }
  return order;
}

function applyPlaces(cells: Cell[], places: Place[]) {
  for (const p of places) {
    const c = cells.find((cell) => cell.x === p.x && cell.y === p.y);
    if (!c) continue;
    c.label = p.label;
    if (p.pop != null) c.pop = p.pop;
  }
}

export function createState(mission: MissionDef): GameState {
  const rows = mission.rows;
  const cols = rows[0]?.length ?? 0;
  if (!cols || rows.some((r) => r.length !== cols)) {
    throw new Error(`Ragged map: ${mission.id}`);
  }
  const cells: Cell[] = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < cols; x++) {
      const spec = decodeChar(rows[y][x]);
      const kind = spec.kind;
      const pop = kind === "town" ? 1000 : kind === "hospital" ? 400 : 0;
      cells.push({
        x,
        y,
        kind,
        elev: spec.elev ?? ELEV[kind],
        water: 0,
        wall: null,
        pump: null,
        pop,
        label:
          kind === "town"
            ? "Town"
            : kind === "hospital"
              ? "Hospital"
              : kind === "lock"
                ? "Lock"
                : kind === "farm"
                  ? "Fields"
                  : kind === "basin"
                    ? "Floodway"
                    : kind === "depot"
                      ? "Depot"
                      : kind === "wetland"
                        ? "Wetland"
                        : kind === "bank"
                          ? "Bank"
                          : "",
        wet: 0,
        failed: false,
        alarmed: false,
        peak: 0,
        buildWall: kind === "bank",
        buildPump: kind === "town" || kind === "hospital" || kind === "lock",
        spill: Boolean(spec.spill),
        bridge: Boolean(spec.bridge),
      });
    }
  }
  applyPlaces(cells, mission.places);
  for (const c of cells) {
    if (c.kind !== "bank" || c.label !== "Bank") continue;
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows.length) continue;
      const n = cells[y * cols + x];
      if ((n.kind === "town" || n.kind === "hospital" || n.kind === "lock" || n.kind === "farm") && n.label) {
        c.label = `${n.label} bank`;
        break;
      }
    }
  }
  const river = traceRiver(cells, cols);
  const baseDepth = mission.hydro.base / mission.hydro.outlet;
  for (const i of river) cells[i].water = baseDepth;

  const depot = cells.find((c) => c.kind === "depot") ?? cells.find((c) => c.kind === "high") ?? cells[0];
  const crews: Crew[] = [1, 2].map((id) => ({
    id,
    name: `ENG-${id}`,
    x: depot.x,
    y: depot.y,
    path: [],
    task: "idle",
    intent: "repair",
    work: 0,
    stranded: 0,
  }));

  return {
    missionId: mission.id,
    cols,
    rows: rows.length,
    cells,
    river,
    crews,
    mode: "build",
    t: 0,
    duration: mission.duration,
    budget: mission.budget,
    reserve: mission.reserve,
    spillOpen: false,
    spillUsed: false,
    spillSeconds: 0,
    hydro: { ...mission.hydro },
    gaugeName: mission.gauge.name,
    datum: mission.gauge.datum,
    scale: mission.gauge.scale,
    floodFt: mission.gauge.flood,
    majorFt: mission.gauge.major,
    topFt: mission.gauge.top,
    breaches: 0,
    log: [],
    speed: 1,
    paused: false,
    ended: null,
    endLogged: false,
    hitFlood: false,
    hitMajor: false,
    hitCrest: false,
    peakDepth: baseDepth,
  };
}

function walkable(c: Cell): boolean {
  if (c.bridge) return c.water < 6;
  if (c.kind === "river") return false;
  if (c.kind === "high" || c.kind === "depot") return true;
  if (c.wall && !c.wall.breached) return c.water < 0.75;
  if (c.kind === "road" || c.kind === "upland") return c.water < 1.3;
  return c.water < 1.05;
}

function bfs(state: GameState, sx: number, sy: number, gx: number, gy: number) {
  if (sx === gx && sy === gy) return [{ x: sx, y: sy }];
  const { cols, rows } = state;
  const start = sy * cols + sx;
  const goal = gy * cols + gx;
  const q = [start];
  const prev = new Map<number, number>();
  prev.set(start, -1);
  while (q.length) {
    const cur = q.shift()!;
    if (cur === goal) break;
    const c = state.cells[cur];
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const j = y * cols + x;
      if (prev.has(j)) continue;
      if (!walkable(state.cells[j])) continue;
      prev.set(j, cur);
      q.push(j);
    }
  }
  if (!prev.has(goal)) return null;
  const path: { x: number; y: number }[] = [];
  let cur = goal;
  while (cur !== -1) {
    const c = state.cells[cur];
    path.push({ x: c.x, y: c.y });
    const p = prev.get(cur);
    if (p == null || p === -1) break;
    cur = p;
  }
  path.reverse();
  return path;
}

function needsWork(c: Cell): boolean {
  if (c.wall && (c.wall.breached || c.wall.hp < c.wall.maxHp * 0.86)) return true;
  if (c.pump?.flooded) return true;
  return false;
}

function pickCrew(state: GameState, x: number, y: number): Crew | null {
  const free = state.crews.filter((c) => c.stranded <= 0 && c.task === "idle");
  const pool = free.length ? free : state.crews.filter((c) => c.stranded <= 0);
  if (!pool.length) return null;
  pool.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  return pool[0];
}

export function placeWall(state: GameState, x: number, y: number, kind: WallKind): string {
  if (state.mode !== "build") return "Too late to build more. Use the crews you have.";
  const cell = cellAt(state, x, y);
  if (!cell?.buildWall) return "Levees sit on the bank, between the river and the town.";
  if (cell.wall?.kind === kind && !cell.wall.breached) return "Already on that station.";
  const cost = COSTS[kind];
  const refund = cell.wall ? COSTS[cell.wall.kind] : 0;
  if (cost - refund > state.budget + 0.001) return "Not enough building money for that.";
  state.budget -= cost - refund;
  const spec = kind === "levee" ? LEVEE : SANDBAG;
  cell.wall = { kind, hp: spec.hp, maxHp: spec.hp, height: spec.height, breached: false };
  return kind === "levee" ? "Levee staked in." : "Sandbag line placed.";
}

export function placePump(state: GameState, x: number, y: number): string {
  if (state.mode !== "build") return "Too late for a new pump. They had to be in before the fight.";
  const cell = cellAt(state, x, y);
  if (!cell?.buildPump) return "Set the pump in the low ground behind a levee — town, hospital, or lock.";
  if (cell.pump) return "A pump is already on that pad.";
  if (state.budget < COSTS.pump) return "Not enough left for a pump.";
  state.budget -= COSTS.pump;
  cell.pump = { flooded: false, alarmed: false };
  return "Pump set and fueled.";
}

export function sellCell(state: GameState, x: number, y: number): string {
  if (state.mode !== "build") return "The contracts are let. Fight with what's in the ground.";
  const cell = cellAt(state, x, y);
  if (!cell) return "Off the map.";
  let refund = 0;
  if (cell.wall) {
    refund += COSTS[cell.wall.kind];
    cell.wall = null;
  }
  if (cell.pump) {
    refund += COSTS.pump;
    cell.pump = null;
  }
  if (!refund) return "Nothing on that parcel to pull.";
  state.budget += refund;
  return "Returned to the building budget.";
}

export function toggleSpill(state: GameState): string {
  if (!state.cells.some((c) => c.spill)) return "This district has no overflow gate.";
  if (state.mode === "build") return "Leave the gate shut until the fight. Open it from the river gauge, not the plan.";
  state.spillOpen = !state.spillOpen;
  if (state.spillOpen) {
    state.spillUsed = true;
    const msg = "Overflow gate open. The lower fields are taking the river.";
    pushLog(state, msg);
    return msg;
  }
  const msg = "Overflow gate closed.";
  pushLog(state, msg);
  return msg;
}

export function orderCrew(state: GameState, x: number, y: number, intent: "repair" | "sandbag"): string {
  if (state.mode !== "fight") return "Crews move once the fight starts.";
  const cell = cellAt(state, x, y);
  if (!cell) return "Off the map.";
  let task = intent;
  if (task === "sandbag" && (cell.wall?.breached || (cell.wall && cell.wall.hp < cell.wall.maxHp * 0.86))) {
    task = "repair";
  }
  if (task === "sandbag") {
    if (cell.wall?.kind === "levee" && !cell.wall.breached) return "That station already has a levee.";
    if (cell.wall?.kind === "sandbag" && !cell.wall.breached && cell.wall.hp > cell.wall.maxHp * 0.86) {
      return "Sandbags are already up.";
    }
    if (!cell.buildWall) return "Sandbags go on a bank.";
    if (!cell.wall && state.reserve < COSTS.emergency) return "The emergency reserve is spent.";
  } else if (!needsWork(cell)) {
    return "Nothing there needs a crew.";
  }
  const crew = pickCrew(state, x, y);
  if (!crew) return "Both crews are stuck.";
  const sx = Math.round(crew.x);
  const sy = Math.round(crew.y);
  const path = bfs(state, sx, sy, x, y);
  if (!path) return "No dry route. The crew can't reach that spot.";
  crew.path = path.slice(1);
  crew.intent = task;
  crew.work = 0;
  crew.task = crew.path.length ? "move" : task;
  return task === "repair" ? `${crew.name} is going to repair.` : `${crew.name} is hauling sandbags.`;
}

export function startFight(state: GameState) {
  state.mode = "fight";
  state.t = 0;
  state.paused = false;
  state.spillOpen = false;
  state.spillUsed = false;
  state.spillSeconds = 0;
  state.breaches = 0;
  state.ended = null;
  state.endLogged = false;
  state.hitFlood = false;
  state.hitMajor = false;
  state.hitCrest = false;
  state.peakDepth = gaugeDepth(state);
  for (const c of state.cells) {
    if (c.kind !== "river") c.water = 0;
    c.wet = 0;
    c.failed = false;
    c.alarmed = false;
    c.peak = c.kind === "river" ? c.water : 0;
    if (c.pump) {
      c.pump.flooded = false;
      c.pump.moving = 0;
    }
    if (c.wall) {
      c.wall.leaked = null;
      c.wall.leakCool = 0;
      c.wall.breaking = 0;
      c.wall.breakMax = 0;
      c.wall.plugWork = 0;
    }
  }
  state.leakSeq = 0;
  state.lastLeakAt = 0;
  const depot = state.cells.find((c) => c.kind === "depot");
  for (const crew of state.crews) {
    crew.task = "idle";
    crew.path = [];
    crew.work = 0;
    crew.stranded = 0;
    if (depot) {
      crew.x = depot.x;
      crew.y = depot.y;
    }
  }
  state.log = [];
  pushLog(state, "The fight is on. Tap leaks and weak walls. Plug a breaking wall. Drag a pump to move it.");
}

function gateBlocks(a: Cell, b: Cell, state: GameState): boolean {
  const spill = a.spill ? a : b.spill ? b : null;
  const river = a.kind === "river" ? a : b.kind === "river" ? b : null;
  if (!spill || !river) return false;
  if (state.spillOpen) return false;
  return river.elev + river.water < 4.7;
}

function advect(state: GameState, dt: number, inflow: number, outletK: number) {
  const r = state.river;
  if (!r.length) return;
  const cells = state.cells;
  cells[r[0]].water += inflow * dt;
  for (let i = 0; i < r.length - 1; i++) {
    const a = cells[r[i]];
    const b = cells[r[i + 1]];
    const slope = Math.max(0, a.elev + a.water - (b.elev + b.water));
    let flow = (0.9 * a.water + 1.4 * slope) * dt;
    flow = Math.min(flow, a.water * 0.42);
    a.water -= flow;
    b.water += flow;
  }
  for (let i = r.length - 1; i > 0; i--) {
    const down = cells[r[i]];
    const up = cells[r[i - 1]];
    const slope = down.elev + down.water - (up.elev + up.water);
    if (slope > 0) {
      let flow = 1.05 * slope * dt;
      flow = Math.min(flow, down.water * 0.35);
      down.water -= flow;
      up.water += flow;
    }
  }
  const tail = cells[r[r.length - 1]];
  tail.water = Math.max(0, tail.water - tail.water * outletK * dt);
}

function divert(state: GameState, dt: number) {
  if (!state.spillOpen) return;
  state.spillUsed = true;
  state.spillSeconds += dt;
  let edges = 0;
  for (const c of state.cells) if (c.spill) {
    for (const n of neighbors(state, c)) if (n.kind === "river") edges++;
  }
  const share = edges > 0 ? 1 / edges : 1;
  for (const c of state.cells) {
    if (!c.spill) continue;
    for (const n of neighbors(state, c)) {
      if (n.kind !== "river") continue;
      const take = Math.min(n.water, (0.16 + 0.045 * n.water) * dt);
      n.water -= take;
      c.water += take * 0.35;
    }
  }
  const relief = (0.055 + 0.04 * share) * dt;
  for (const i of state.river) {
    const c = state.cells[i];
    const take = Math.min(c.water, relief * (0.45 + c.water * 0.35));
    c.water -= take;
  }
}

function fillBasin(state: GameState, dt: number) {
  for (const c of state.cells) {
    if (!c.spill && c.kind !== "farm" && c.kind !== "wetland") continue;
    const cap = c.kind === "farm" ? 0.92 : 1.2;
    if (c.water < cap) c.water = Math.min(cap, c.water + 0.14 * dt);
  }
}

function lateral(state: GameState, dt: number) {
  const { cells } = state;
  const beds = cells.map((c) => bedOf(c));
  const surf = cells.map((c, i) => beds[i] + c.water);
  const delta = new Float64Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.water <= 0.0008) continue;
    const opts: { j: number; head: number; k: number }[] = [];
    for (const [dx, dy] of DIRS) {
      const n = cellAt(state, c.x + dx, c.y + dy);
      if (!n) continue;
      const j = n.y * state.cols + n.x;
      if (c.kind === "river" && n.kind === "river") continue;
      if (gateBlocks(c, n, state)) continue;
      if ((c.spill || c.kind === "farm" || c.kind === "wetland") && n.kind === "river") continue;
      const head = surf[i] - Math.max(surf[j], beds[j]);
      if (head <= 0.004) continue;
      const riverish = c.kind === "river" || n.kind === "river" || c.spill || n.spill;
      opts.push({ j, head, k: riverish ? 1.15 : 0.62 });
    }
    opts.sort((a, b) => b.head - a.head);
    let budget = c.water * 0.48;
    for (const o of opts) {
      if (budget <= 0) break;
      let flow = o.k * o.head * dt;
      flow = Math.min(flow, budget);
      budget -= flow;
      delta[i] -= flow;
      delta[o.j] += flow;
    }
  }
  for (let i = 0; i < cells.length; i++) cells[i].water = Math.max(0, cells[i].water + delta[i]);
}

function pressure(state: GameState, c: Cell): number {
  let head = 0;
  for (const n of neighbors(state, c)) {
    if (n.kind === "river") head = Math.max(head, n.elev + n.water - c.elev);
    if (n.wall && !n.wall.breached) {
      for (const n2 of neighbors(state, n)) {
        if (n2.kind === "river") head = Math.max(head, n2.elev + n2.water - c.elev);
      }
    }
  }
  return Math.max(0, head);
}

function seepage(state: GameState, dt: number) {
  for (const c of state.cells) {
    const k = SEEP[c.kind];
    if (!k) continue;
    const head = pressure(state, c);
    if (head <= 0) continue;
    c.water += k * head * dt;
    // Pull a token amount from the nearest river so the books stay honest.
    let best: Cell | null = null;
    let bd = 1e9;
    for (const i of state.river) {
      const r = state.cells[i];
      const d = Math.abs(r.x - c.x) + Math.abs(r.y - c.y);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    if (best) best.water = Math.max(0, best.water - k * head * dt * 0.25);
  }
}

function pumps(state: GameState, dt: number) {
  for (const c of state.cells) {
    if (!c.pump || c.pump.flooded || (c.pump.moving ?? 0) > 0) continue;
    if (c.water <= 0.001) continue;
    const take = Math.min(c.water, PUMP_RATE * dt);
    c.water -= take;
    let best = state.river[0];
    let bd = 1e9;
    for (const i of state.river) {
      const r = state.cells[i];
      const d = Math.abs(r.x - c.x) + Math.abs(r.y - c.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best != null) state.cells[best].water += take;
    if (c.water > 1.05) {
      c.pump.flooded = true;
      if (!c.pump.alarmed) {
        c.pump.alarmed = true;
        pushLog(state, `Pump at ${c.label} is underwater.`);
      }
    }
  }
}

function erode(state: GameState, dt: number) {
  for (const c of state.cells) {
    if (!c.wall || c.wall.breached) continue;
    const crest = bedOf(c);
    let load = c.water > 0.22 ? (c.water - 0.22) * 2.8 : 0;
    for (const n of neighbors(state, c)) {
      if (n.kind !== "river" && n.water <= 0.03) continue;
      const ns = (n.kind === "river" ? n.elev : bedOf(n)) + n.water;
      const over = ns - crest;
      if (over > 0.02) load += over * 2.15;
      else if (n.kind === "river") {
        const sat = n.elev + n.water - c.elev;
        if (sat > 1.6) load += (sat - 1.6) * 0.01;
      }
    }
    if (c.wall.breaking) continue;
    const armor = c.wall.kind === "sandbag" ? 1.55 : 1;
    c.wall.hp -= load * armor * 5.4 * dt;
    if (c.wall.hp <= 0) beginBreak(state, c);
  }
}

function finishBreach(state: GameState, c: Cell) {
  if (!c.wall || c.wall.breached) return;
  c.wall.hp = 0;
  c.wall.breached = true;
  c.wall.breaking = 0;
  c.wall.breakMax = 0;
  c.wall.plugWork = 0;
  c.wall.leaked = null;
  state.breaches += 1;
  const what = c.wall.kind === "levee" ? "Levee breach" : "Sandbags blown out";
  pushLog(state, `${what} at ${c.label}.`);
}

function beginBreak(state: GameState, c: Cell) {
  if (!c.wall || c.wall.breached) return;
  c.wall.hp = 0;
  c.wall.leaked = null;
  if (state.headless) {
    finishBreach(state, c);
    return;
  }
  if (c.wall.breaking) return;
  c.wall.breaking = FIGHT.breakTime;
  c.wall.breakMax = FIGHT.breakTime;
  c.wall.plugWork = 0;
  pushLog(state, `The wall at ${c.label} is giving way. Plug it now.`);
}

function tickMoves(state: GameState, dt: number) {
  for (const c of state.cells) {
    if (!c.pump || !((c.pump.moving ?? 0) > 0)) continue;
    c.pump.moving = Math.max(0, (c.pump.moving ?? 0) - dt);
    if (c.pump.moving <= 0) {
      c.pump.moving = 0;
      pushLog(state, `Pump is set at ${c.label}.`);
    }
  }
}

function tickBreaks(state: GameState, dt: number) {
  for (const c of state.cells) {
    if (!c.wall?.breaking) continue;
    c.wall.breaking = Math.max(0, c.wall.breaking - dt);
    if (c.wall.breaking <= 0) finishBreach(state, c);
  }
}

function tickLeaks(state: GameState, dt: number) {
  for (const c of state.cells) {
    if (!c.wall) continue;
    if (c.wall.leakCool) c.wall.leakCool = Math.max(0, c.wall.leakCool - dt);
    if (!c.wall.leaked || c.wall.breached || c.wall.breaking) {
      if (c.wall.breached || c.wall.breaking) c.wall.leaked = null;
      continue;
    }
    if (state.headless) continue;
    c.wall.hp -= FIGHT.leakDmg * dt;
    if (c.wall.hp <= 0) beginBreak(state, c);
  }
  if (state.headless || state.mode !== "fight") return;
  if (state.t < FIGHT.leakAfter) return;
  if ((state.lastLeakAt ?? 0) > 0 && state.t - (state.lastLeakAt ?? 0) < FIGHT.leakGap) return;
  let pick: Cell | null = null;
  let worst = 1;
  for (const c of state.cells) {
    const wall = c.wall;
    if (!wall || wall.breached || wall.breaking || wall.leaked) continue;
    if ((wall.leakCool ?? 0) > 0) continue;
    const frac = wall.maxHp > 0 ? wall.hp / wall.maxHp : 1;
    if (frac >= FIGHT.leakFrac) continue;
    if (frac < worst) {
      worst = frac;
      pick = c;
    }
  }
  if (!pick?.wall) return;
  pick.wall.leaked = {
    id: (state.leakSeq ?? 0) + 1,
    ox: (Math.random() - 0.5) * 0.5,
    oz: (Math.random() * 0.12 + 0.04) * (Math.random() < 0.5 ? 1 : -1),
  };
  state.leakSeq = pick.wall.leaked.id;
  state.lastLeakAt = state.t;
  pushLog(state, `A leak is bubbling at ${pick.label}. Tap it to sandbag it.`);
}

export function sandbagLeak(state: GameState, x: number, y: number): string {
  if (state.mode !== "fight") return "Leaks only show up during the fight.";
  const c = cellAt(state, x, y);
  if (!c?.wall?.leaked) return "No leak there.";
  c.wall.leaked = null;
  c.wall.leakCool = FIGHT.leakCool;
  const msg = `Leak sandbagged at ${c.label}.`;
  pushLog(state, msg);
  return msg;
}

export function plugBreak(state: GameState, x: number, y: number, work: number): string {
  if (state.mode !== "fight") return "";
  const c = cellAt(state, x, y);
  if (!c?.wall?.breaking) return "";
  c.wall.plugWork = Math.min(1, (c.wall.plugWork ?? 0) + work);
  if (c.wall.plugWork < 1) return "Keep going — hold or tap to plug the break.";
  c.wall.breaking = 0;
  c.wall.breakMax = 0;
  c.wall.plugWork = 0;
  c.wall.hp = Math.max(c.wall.hp, c.wall.maxHp * 0.38);
  c.wall.leakCool = 8;
  const msg = `You plugged the break at ${c.label}.`;
  pushLog(state, msg);
  return msg;
}

export function isWeakWall(wall: Wall): boolean {
  if (wall.breached || wall.breaking) return true;
  return wall.maxHp > 0 && wall.hp / wall.maxHp < FIGHT.weakFrac;
}

export function movePump(state: GameState, fromX: number, fromY: number, toX: number, toY: number): string {
  if (state.mode !== "fight") return "Pumps can be moved once the fight starts.";
  const from = cellAt(state, fromX, fromY);
  const to = cellAt(state, toX, toY);
  if (!from?.pump) return "No pump there.";
  if ((from.pump.moving ?? 0) > 0) return "That pump is already moving.";
  if (fromX === toX && fromY === toY) return "Pump stays where it is.";
  if (!to?.buildPump) return "Pumps only go in the low ground behind a levee — town, hospital, or lock.";
  if (to.pump) return "A pump is already on that pad.";
  to.pump = { flooded: from.pump.flooded, alarmed: from.pump.alarmed, moving: FIGHT.pumpMove };
  from.pump = null;
  const msg = `Pump is moving to ${to.label}. It will not pump until it is set.`;
  pushLog(state, msg);
  return msg;
}

function failures(state: GameState, dt: number) {
  for (const c of state.cells) {
    c.peak = Math.max(c.peak, c.water);
    const after = FAIL_AFTER[c.kind];
    if (!after) continue;
    if (c.water > FAIL_DEPTH) {
      c.wet += dt;
      if (c.wet >= after && !c.failed) {
        c.failed = true;
        if (!c.alarmed) {
          c.alarmed = true;
          const verb = c.kind === "farm" ? "is under" : c.kind === "lock" ? "is lost" : "is flooding";
          pushLog(state, `${c.label} ${verb}.`);
        }
      }
    } else {
      c.wet = Math.max(0, c.wet - dt * 0.45);
    }
  }
}

function tickCrews(state: GameState, dt: number) {
  for (const crew of state.crews) {
    if (crew.stranded > 0) {
      crew.stranded -= dt;
      if (crew.stranded <= 0) {
        const depot = state.cells.find((c) => c.kind === "depot");
        if (depot) {
          crew.x = depot.x;
          crew.y = depot.y;
        }
        crew.path = [];
        crew.task = "idle";
        crew.work = 0;
        pushLog(state, `${crew.name} is back at the depot.`);
      }
      continue;
    }
    if (crew.task === "move") {
      const next = crew.path[0];
      if (!next) {
        crew.task = crew.intent;
      } else {
        const target = cellAt(state, next.x, next.y);
        if (target && !walkable(target)) {
          crew.path = [];
          crew.task = "idle";
          pushLog(state, `${crew.name} lost the route to water.`);
          continue;
        }
        const dx = next.x - crew.x;
        const dy = next.y - crew.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const stepDist = CREW_SPEED * dt;
        if (dist <= stepDist) {
          crew.x = next.x;
          crew.y = next.y;
          crew.path.shift();
          if (!crew.path.length) crew.task = crew.intent;
        } else {
          crew.x += (dx / dist) * stepDist;
          crew.y += (dy / dist) * stepDist;
        }
      }
      continue;
    }
    const here = cellAt(state, Math.round(crew.x), Math.round(crew.y));
    if (here && !walkable(here) && crew.task !== "idle") {
      crew.stranded = 4.2;
      crew.task = "idle";
      crew.path = [];
      pushLog(state, `${crew.name} is stranded.`);
      continue;
    }
    if (crew.task === "repair" && here) {
      if (!needsWork(here)) {
        crew.task = "idle";
        continue;
      }
      crew.work += dt;
      if (crew.work >= REPAIR_TIME) {
        if (here.wall) {
          here.wall.breached = false;
          here.wall.hp = here.wall.maxHp * 0.8;
        }
        if (here.pump) {
          here.pump.flooded = false;
          here.pump.alarmed = false;
        }
        crew.work = 0;
        crew.task = "idle";
        pushLog(state, `${crew.name} restored ${here.label}.`);
      }
    } else if (crew.task === "sandbag" && here) {
      if (here.wall && !here.wall.breached && here.wall.hp > here.wall.maxHp * 0.86) {
        crew.task = "idle";
        continue;
      }
      if (!here.buildWall) {
        crew.task = "idle";
        continue;
      }
      if (!here.wall && state.reserve < COSTS.emergency) {
        crew.task = "idle";
        pushLog(state, "Reserve empty. Sandbag order cancelled.");
        continue;
      }
      crew.work += dt;
      if (crew.work >= SANDBAG_TIME) {
        if (!here.wall) state.reserve -= COSTS.emergency;
        here.wall = {
          kind: "sandbag",
          hp: SANDBAG.hp,
          maxHp: SANDBAG.hp,
          height: SANDBAG.height,
          breached: false,
        };
        crew.work = 0;
        crew.task = "idle";
        pushLog(state, `${crew.name} has sandbags up at ${here.label}.`);
      }
    }
  }
}

function maybeEnd(state: GameState) {
  const crit = state.cells.filter((c) => c.kind === "town" || c.kind === "hospital" || c.kind === "lock");
  const allFailed = crit.length > 0 && crit.every((c) => c.failed);
  const depth = gaugeDepth(state);
  const receded = depth < state.hydro.base / state.hydro.outlet + 0.28;
  const finished = state.t >= state.duration && (receded || state.t > state.duration + 18);
  if (!allFailed && !finished) return;
  state.mode = "done";
  state.ended = crit.some((c) => c.failed) ? "fail" : "hold";
  if (!state.endLogged) {
    state.endLogged = true;
    pushLog(
      state,
      state.ended === "hold" ? "The river is back inside its banks." : "The fight is over. Count what the water took.",
    );
  }
}

export function step(state: GameState, dt: number) {
  if (state.paused || state.mode === "done") return;
  if (state.mode === "build") {
    const target = state.hydro.base / state.hydro.outlet;
    for (const i of state.river) {
      const c = state.cells[i];
      c.water += (target - c.water) * Math.min(1, dt * 0.7);
    }
    return;
  }
  const u = Math.min(1.35, state.t / state.duration);
  const storm = surgeAt(state.hydro, u);
  const outlet = state.hydro.outlet * (1 - 0.9 * storm);
  advect(state, dt, inflowAt(state.hydro, Math.min(1, u)), outlet);
  if (storm > 0 && state.hydro.surge > 0) {
    const tail = state.river[state.river.length - 1];
    if (tail != null) state.cells[tail].water += state.hydro.surge * storm * dt;
    const mid = state.river[Math.max(0, state.river.length - 2)];
    if (mid != null) state.cells[mid].water += state.hydro.surge * storm * 0.45 * dt;
  }
  for (const c of state.cells) {
    if (c.kind === "river" || c.kind === "high" || c.kind === "depot") continue;
    if (c.wall && !c.wall.breached) continue;
    c.water += rainAt(state.hydro, Math.min(1, u)) * dt;
  }
  divert(state, dt);
  if (state.spillOpen) fillBasin(state, dt);
  lateral(state, dt);
  seepage(state, dt);
  pumps(state, dt);
  erode(state, dt);
  tickLeaks(state, dt);
  tickBreaks(state, dt);
  tickMoves(state, dt);
  failures(state, dt);
  tickCrews(state, dt);
  const depth = gaugeDepth(state);
  state.peakDepth = Math.max(state.peakDepth, depth);
  const feet = toFeet(depth, state);
  if (!state.hitFlood && feet >= state.floodFt) {
    state.hitFlood = true;
    pushLog(state, "Gauge is above flood stage.");
  }
  if (!state.hitMajor && feet >= state.majorFt) {
    state.hitMajor = true;
    pushLog(state, "High flood on the gauge. This is the peak window.");
  }
  if (!state.hitCrest && u >= state.hydro.peak) {
    state.hitCrest = true;
    pushLog(state, "The flood is at its highest on the gauge.");
  }
  for (const c of state.cells) c.water = Math.max(0, Math.min(14, c.water));
  state.t += dt;
  maybeEnd(state);
}

export function limbOf(state: GameState): "RISING" | "CREST" | "FALLING" | "STANDBY" {
  if (state.mode === "build") return "STANDBY";
  const u = state.t / state.duration;
  if (u < state.hydro.peak - 0.07) return "RISING";
  if (u > state.hydro.peak + 0.08) return "FALLING";
  return "CREST";
}

export function clockLabel(state: GameState): string {
  const span = 16 * 60;
  const mins = Math.floor((Math.min(state.t, state.duration) / state.duration) * span);
  const hh = (6 + Math.floor(mins / 60)) % 24;
  const mm = mins % 60;
  return `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}`;
}

function uniqueAssets(cells: Cell[]) {
  const seen = new Set<string>();
  const out: { label: string; ok: boolean }[] = [];
  for (const c of cells) {
    if (!c.label || seen.has(c.label)) continue;
    if (c.kind !== "town" && c.kind !== "hospital" && c.kind !== "lock") continue;
    seen.add(c.label);
    const group = cells.filter((o) => o.label === c.label);
    out.push({ label: c.label, ok: group.every((o) => !o.failed) });
  }
  return out;
}

export function scoreGame(state: GameState, mission: MissionDef): Scorecard {
  const popCells = state.cells.filter((c) => c.pop > 0);
  const popTotal = popCells.reduce((s, c) => s + c.pop, 0);
  const popSaved = popCells.filter((c) => !c.failed).reduce((s, c) => s + c.pop, 0);
  const farms = state.cells.filter((c) => c.kind === "farm");
  const farmsLost = farms.filter((c) => c.failed || c.peak > 0.7).length;
  const crit = state.cells.filter((c) => c.kind === "town" || c.kind === "hospital" || c.kind === "lock");
  const hospitalFailed = crit.some((c) => c.kind === "hospital" && c.failed);
  const lockFailed = crit.some((c) => c.kind === "lock" && c.failed);
  const townFailed = crit.some((c) => c.kind === "town" && c.failed);
  const ratio = popTotal ? popSaved / popTotal : 1;
  const frac = state.duration > 0 ? state.spillSeconds / state.duration : 0;
  let letter: Letter = "A";
  if (hospitalFailed || ratio < 0.5) letter = "F";
  else if (lockFailed || ratio < 0.78) letter = "D";
  else if (townFailed || ratio < 0.999) letter = "C";
  else if (!mission.sacrificialFarms && (farmsLost > 0 || frac > 0.08)) letter = "B";
  else if (mission.sacrificialFarms && frac > 0.62) letter = "B";
  else letter = "A";

  const title =
    letter === "A"
      ? "The district held"
      : letter === "B"
        ? "Held, with damages"
        : letter === "C"
          ? "Partial evacuation"
          : letter === "D"
            ? "The line failed"
            : "District flooded";

  const assets = uniqueAssets(state.cells);
  const lostNames = assets.filter((a) => !a.ok).map((a) => a.label);
  const savedNames = assets.filter((a) => a.ok).map((a) => a.label);
  const lines: string[] = [];
  if (letter === "A" || letter === "B") {
    lines.push(`${mission.district} is still a place people can go home to.`);
  } else {
    lines.push(`${mission.district} will be writing this storm up for a long time.`);
  }
  if (lostNames.length) lines.push(`${lostNames.join(" and ")} went under.`);
  else if (savedNames.length) lines.push(`${savedNames.join(", ")} stayed dry.`);
  if (frac > 0.62) {
    lines.push("The overflow ran for most of the fight. The fields did more work than the peak required.");
  } else if (frac > 0.05) {
    lines.push(
      farmsLost
        ? "You opened the overflow at the peak. The lower ground paid for the towns."
        : "You opened the overflow at the peak and kept the damage short.",
    );
  } else if (mission.sacrificialFarms && (letter === "C" || letter === "D" || letter === "F")) {
    lines.push("The overflow gate never opened. The river had nowhere to go but over the line.");
  } else if (!mission.sacrificialFarms && frac <= 0.05 && (letter === "A" || letter === "B")) {
    lines.push("You held the flood without giving the fields to the river.");
  }
  if (state.breaches > 0) {
    lines.push(
      state.breaches === 1 ? "One breach opened in the line." : `${state.breaches} breaches opened in the line.`,
    );
  }
  const peakFeet = toFeet(state.peakDepth, state);
  lines.push(
    `Peak ${peakFeet.toFixed(1)} ft on the ${mission.gauge.name} gauge. Building funds left $${Math.round(state.budget)}.`,
  );

  return {
    letter,
    title,
    lines,
    popSaved,
    popTotal,
    assets,
    farmsLost,
    farms: farms.length,
    breaches: state.breaches,
    budgetLeft: Math.round(state.budget),
    reserveLeft: Math.round(state.reserve),
    peakFeet,
    spillSeconds: state.spillSeconds,
    spillFraction: frac,
  };
}

export function runModel(src: GameState, mission: MissionDef, assumeSpill: boolean): ModelReport {
  const state = structuredClone(src) as GameState;
  startFight(state);
  state.headless = true;
  const maxWater = new Float64Array(state.cells.length);
  const dt = 1 / 20;
  const limit = state.duration * 1.12;
  while (state.t < limit && state.mode === "fight") {
    const u = state.t / state.duration;
    if (assumeSpill && state.cells.some((c) => c.spill)) {
      state.spillOpen = u >= 0.38 && u <= (state.hydro.surge > 0 ? 0.9 : 0.74);
      if (state.spillOpen) state.spillUsed = true;
    } else {
      state.spillOpen = false;
    }
    step(state, dt);
    for (let i = 0; i < state.cells.length; i++) {
      maxWater[i] = Math.max(maxWater[i], state.cells[i].peak, state.cells[i].water);
    }
  }
  const names = new Map<string, boolean>();
  for (const c of state.cells) {
    if (c.kind !== "town" && c.kind !== "hospital" && c.kind !== "lock") continue;
    const prev = names.get(c.label);
    names.set(c.label, prev === undefined ? !c.failed : prev && !c.failed);
  }
  const failures: string[] = [];
  const holds: string[] = [];
  for (const [label, ok] of names) (ok ? holds : failures).push(label);
  const peakFeet = toFeet(state.peakDepth, state);
  const summary = failures.length
    ? `Forecast: ${failures.join(", ")} fail at a ${peakFeet.toFixed(1)} ft peak.`
    : `Forecast: the line holds. Peak ${peakFeet.toFixed(1)} ft.`;
  return { maxWater: Array.from(maxWater), failures, holds, peakFeet, summary };
}

export interface Plan {
  walls: { x: number; y: number; kind: WallKind }[];
  pumps: { x: number; y: number }[];
  /** never | always | crest window */
  spill: "never" | "always" | "crest";
  autoRepair?: boolean;
}

export function simulate(mission: MissionDef, plan: Plan) {
  const state = createState(mission);
  const notes: string[] = [];
  for (const w of plan.walls) notes.push(placeWall(state, w.x, w.y, w.kind));
  for (const p of plan.pumps) notes.push(placePump(state, p.x, p.y));
  startFight(state);
  state.headless = true;
  const dt = 1 / 30;
  while (state.mode === "fight" && state.t < state.duration + 20) {
    const u = state.t / state.duration;
    if (plan.spill === "always") state.spillOpen = true;
    else if (plan.spill === "crest") state.spillOpen = u >= 0.4 && u <= 0.7;
    else state.spillOpen = false;
    if (state.spillOpen) state.spillUsed = true;
    if (plan.autoRepair) {
      for (const c of state.cells) {
        if (!c.wall?.breached && !c.pump?.flooded) continue;
        const busy = state.crews.some(
          (cr) =>
            (cr.task === "repair" || cr.task === "move") &&
            (cr.path.some((p) => p.x === c.x && p.y === c.y) ||
              (Math.round(cr.x) === c.x && Math.round(cr.y) === c.y && cr.intent === "repair")),
        );
        if (!busy) orderCrew(state, c.x, c.y, "repair");
      }
    }
    step(state, dt);
  }
  const card = scoreGame(state, mission);
  return {
    notes,
    letter: card.letter,
    ended: state.ended,
    peakFeet: card.peakFeet,
    failed: state.cells.filter((c) => c.failed).map((c) => `${c.label}@${c.x},${c.y}`),
    walls: state.cells
      .filter((c) => c.wall)
      .map((c) => ({
        at: `${c.x},${c.y}`,
        kind: c.wall!.kind,
        hp: Math.round(c.wall!.hp),
        breached: c.wall!.breached,
      })),
    wet: state.cells
      .filter((c) => c.kind === "town" || c.kind === "hospital" || c.kind === "lock" || c.kind === "farm")
      .map((c) => ({
        at: `${c.label}@${c.x},${c.y}`,
        peak: Number(c.peak.toFixed(3)),
        failed: c.failed,
      })),
    budget: state.budget,
    spill: Number(state.spillSeconds.toFixed(1)),
    breaches: state.breaches,
    log: state.log.map((l) => l.text),
  };
}
