import type { Difficulty } from "./missions";
import type { GameState } from "./sim";

export type WalkTool = "levee" | "sandbag" | "pump";

export type WalkStep =
  | {
      kind: "read";
      title: string;
      body: string;
      next: string;
      show?: ("river" | "gauge" | "floodway")[];
    }
  | {
      kind: "tap";
      title: string;
      body: string;
      x: number;
      y: number;
      tool: WalkTool;
      place: string;
    }
  | {
      kind: "button";
      title: string;
      body: string;
      button: "model" | "begin";
    };

const MILLFORD: WalkStep[] = [
  {
    kind: "read",
    title: "Tap the hand",
    body: "Blue is the river. The hand shows the next cell.",
    next: "Show the hand",
    show: ["river"],
  },
  {
    kind: "tap",
    title: "Levee",
    body: "Bank in front of Millford.",
    x: 3,
    y: 1,
    tool: "levee",
    place: "the bank in front of Millford",
  },
  {
    kind: "tap",
    title: "Second levee",
    body: "South half of Millford.",
    x: 3,
    y: 2,
    tool: "levee",
    place: "the second Millford bank",
  },
  {
    kind: "tap",
    title: "Lock levee",
    body: "Guide wall in front of Lock 4.",
    x: 3,
    y: 4,
    tool: "levee",
    place: "the guide wall in front of Lock 4",
  },
  {
    kind: "tap",
    title: "Town pump",
    body: "Inside Millford. Not the bank.",
    x: 4,
    y: 1,
    tool: "pump",
    place: "Millford",
  },
  {
    kind: "tap",
    title: "Lock pump",
    body: "Lock 4 is its own bowl.",
    x: 4,
    y: 4,
    tool: "pump",
    place: "Lock 4",
  },
  {
    kind: "button",
    title: "Model",
    body: "Press Model. Leave the gate shut.",
    button: "model",
  },
  {
    kind: "button",
    title: "Start",
    body: "Press Begin flood fight.",
    button: "begin",
  },
  {
    kind: "read",
    title: "Gate stays shut",
    body: "Scarlet tick is flood. Black tick is major. Do not open the floodway.",
    next: "Run the river",
    show: ["gauge"],
  },
];

const OXBOW: WalkStep[] = [
  {
    kind: "read",
    title: "Tap the hand",
    body: "Hartsfield is left. The hospital is right.",
    next: "Show the hand",
    show: ["river"],
  },
  {
    kind: "tap",
    title: "Levee",
    body: "Hartsfield, north bank.",
    x: 2,
    y: 1,
    tool: "levee",
    place: "Hartsfield's north bank",
  },
  {
    kind: "tap",
    title: "Second levee",
    body: "Hartsfield, south bank.",
    x: 2,
    y: 2,
    tool: "levee",
    place: "Hartsfield's south bank",
  },
  {
    kind: "tap",
    title: "Hospital levee",
    body: "North bank, county hospital.",
    x: 4,
    y: 1,
    tool: "levee",
    place: "the hospital's north bank",
  },
  {
    kind: "tap",
    title: "Hospital levee",
    body: "South bank, same bowl.",
    x: 4,
    y: 2,
    tool: "levee",
    place: "the hospital's south bank",
  },
  {
    kind: "tap",
    title: "Sandbags",
    body: "Lock guide wall. Not a full levee.",
    x: 2,
    y: 4,
    tool: "sandbag",
    place: "the lock guide wall",
  },
  {
    kind: "tap",
    title: "Town pump",
    body: "Inside Hartsfield.",
    x: 1,
    y: 1,
    tool: "pump",
    place: "Hartsfield",
  },
  {
    kind: "tap",
    title: "Hospital pump",
    body: "Inside the county hospital.",
    x: 5,
    y: 1,
    tool: "pump",
    place: "the county hospital",
  },
  {
    kind: "button",
    title: "Model",
    body: "Press Model. The gate opens for the crest.",
    button: "model",
  },
  {
    kind: "button",
    title: "Start",
    body: "Press Begin flood fight.",
    button: "begin",
  },
  {
    kind: "read",
    title: "Time the gate",
    body: "Open Floodway at the black tick while it says RISING. Shut it on FALLING.",
    next: "Run the river",
    show: ["gauge", "floodway"],
  },
];

const AMITY: WalkStep[] = [
  {
    kind: "read",
    title: "Tap the hand",
    body: "The surge climbs from the bottom of the map.",
    next: "Show the hand",
    show: ["river"],
  },
  {
    kind: "tap",
    title: "Levee",
    body: "Port Amity, north bank.",
    x: 3,
    y: 1,
    tool: "levee",
    place: "Port Amity's north bank",
  },
  {
    kind: "tap",
    title: "Second levee",
    body: "Port Amity, south bank.",
    x: 3,
    y: 2,
    tool: "levee",
    place: "Port Amity's south bank",
  },
  {
    kind: "tap",
    title: "Clinic levee",
    body: "Bank in front of Harbor Clinic.",
    x: 3,
    y: 4,
    tool: "levee",
    place: "the bank in front of Harbor Clinic",
  },
  {
    kind: "tap",
    title: "Town pump",
    body: "Inside Port Amity.",
    x: 2,
    y: 1,
    tool: "pump",
    place: "Port Amity",
  },
  {
    kind: "tap",
    title: "Clinic pump",
    body: "Inside Harbor Clinic.",
    x: 2,
    y: 4,
    tool: "pump",
    place: "Harbor Clinic",
  },
  {
    kind: "button",
    title: "Model",
    body: "Press Model. The tide gate has to open.",
    button: "model",
  },
  {
    kind: "button",
    title: "Start",
    body: "Press Begin flood fight.",
    button: "begin",
  },
  {
    kind: "read",
    title: "Time the gate",
    body: "Open Floodway at the black tick while it says RISING. Shut it on FALLING.",
    next: "Run the surge",
    show: ["gauge", "floodway"],
  },
];

const EASY: Record<string, WalkStep[]> = {
  millford: [
    {
      kind: "read",
      title: "Easy freshet",
      body: "Lower crest. Two levees and one pump. The lock can sit.",
      next: "Show the hand",
      show: ["river"],
    },
    { kind: "tap", title: "Levee", body: "Bank in front of Millford.", x: 3, y: 1, tool: "levee", place: "the bank in front of Millford" },
    { kind: "tap", title: "Second levee", body: "South half of Millford.", x: 3, y: 2, tool: "levee", place: "the second Millford bank" },
    { kind: "tap", title: "Town pump", body: "Inside Millford.", x: 4, y: 1, tool: "pump", place: "Millford" },
    { kind: "button", title: "Model", body: "Press Model. Leave the gate shut.", button: "model" },
    { kind: "button", title: "Start", body: "Press Begin flood fight.", button: "begin" },
    {
      kind: "read",
      title: "Gate stays shut",
      body: "This freshet fits behind the town. Do not open the floodway.",
      next: "Run the river",
      show: ["gauge"],
    },
  ],
  oxbow: [
    {
      kind: "read",
      title: "Easy reach",
      body: "Both towns, sandbags on the lock. The gate stays shut.",
      next: "Show the hand",
      show: ["river"],
    },
    { kind: "tap", title: "Levee", body: "Hartsfield, north bank.", x: 2, y: 1, tool: "levee", place: "Hartsfield's north bank" },
    { kind: "tap", title: "Second levee", body: "Hartsfield, south bank.", x: 2, y: 2, tool: "levee", place: "Hartsfield's south bank" },
    { kind: "tap", title: "Hospital levee", body: "North bank, county hospital.", x: 4, y: 1, tool: "levee", place: "the hospital's north bank" },
    { kind: "tap", title: "Hospital levee", body: "South bank, same bowl.", x: 4, y: 2, tool: "levee", place: "the hospital's south bank" },
    { kind: "tap", title: "Sandbags", body: "Lock guide wall.", x: 2, y: 4, tool: "sandbag", place: "the lock guide wall" },
    { kind: "tap", title: "Town pump", body: "Inside Hartsfield.", x: 1, y: 1, tool: "pump", place: "Hartsfield" },
    { kind: "tap", title: "Hospital pump", body: "Inside the county hospital.", x: 5, y: 1, tool: "pump", place: "the county hospital" },
    { kind: "button", title: "Model", body: "Press Model. Leave the gate shut.", button: "model" },
    { kind: "button", title: "Start", body: "Press Begin flood fight.", button: "begin" },
    {
      kind: "read",
      title: "Gate stays shut",
      body: "The crest fits behind the line. Do not open the floodway.",
      next: "Run the river",
      show: ["gauge"],
    },
  ],
  amity: [
    {
      kind: "read",
      title: "Easy surge",
      body: "Smaller surge. Three levees, two pumps. The tide gate stays shut.",
      next: "Show the hand",
      show: ["river"],
    },
    { kind: "tap", title: "Levee", body: "Port Amity, north bank.", x: 3, y: 1, tool: "levee", place: "Port Amity's north bank" },
    { kind: "tap", title: "Second levee", body: "Port Amity, south bank.", x: 3, y: 2, tool: "levee", place: "Port Amity's south bank" },
    { kind: "tap", title: "Clinic levee", body: "Bank in front of Harbor Clinic.", x: 3, y: 4, tool: "levee", place: "the bank in front of Harbor Clinic" },
    { kind: "tap", title: "Town pump", body: "Inside Port Amity.", x: 2, y: 1, tool: "pump", place: "Port Amity" },
    { kind: "tap", title: "Clinic pump", body: "Inside Harbor Clinic.", x: 2, y: 4, tool: "pump", place: "Harbor Clinic" },
    { kind: "button", title: "Model", body: "Press Model. Leave the gate shut.", button: "model" },
    { kind: "button", title: "Start", body: "Press Begin flood fight.", button: "begin" },
    {
      kind: "read",
      title: "Gate stays shut",
      body: "This surge fits behind the line. Do not open the tide gate.",
      next: "Run the surge",
      show: ["gauge"],
    },
  ],
};

const WALKS: Record<string, WalkStep[]> = {
  millford: MILLFORD,
  oxbow: OXBOW,
  amity: AMITY,
};

export function walkFor(missionId: string, mode: Difficulty = "hard"): WalkStep[] {
  const book = mode === "easy" ? EASY : WALKS;
  return book[missionId] ?? book.millford ?? MILLFORD;
}

export function tapDone(state: GameState, step: WalkStep): boolean {
  if (step.kind !== "tap") return false;
  const cell = state.cells.find((c) => c.x === step.x && c.y === step.y);
  if (!cell) return false;
  if (step.tool === "pump") return Boolean(cell.pump);
  return cell.wall?.kind === step.tool && !cell.wall.breached;
}

export function walkMarks(state: GameState, missionId: string, mode: Difficulty, index: number | null): { x: number; y: number }[] {
  if (index == null) return [];
  const step = walkFor(missionId, mode)[index];
  if (!step) return [];
  if (step.kind === "tap") return [{ x: step.x, y: step.y }];
  if (step.kind === "read" && step.show?.includes("river")) {
    return state.cells.filter((c) => c.kind === "river").map((c) => ({ x: c.x, y: c.y }));
  }
  return [];
}
