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
    body: "The wall in front of Lock 4, the river lock.",
    x: 3,
    y: 4,
    tool: "levee",
    place: "the wall in front of Lock 4",
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
    body: "Lock 4 is its own low spot. It needs its own pump.",
    x: 4,
    y: 4,
    tool: "pump",
    place: "Lock 4",
  },
  {
    kind: "button",
    title: "Forecast",
    body: "Press Forecast. Leave the overflow gate shut.",
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
    body: "The red mark is flood stage. The black mark is high flood. Leave the overflow gate shut. Tap leaks, plug a breaking wall, or send a crew to a weak levee.",
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
    body: "South bank, same low area.",
    x: 4,
    y: 2,
    tool: "levee",
    place: "the hospital's south bank",
  },
  {
    kind: "tap",
    title: "Sandbags",
    body: "The wall in front of the lock. Not a full levee.",
    x: 2,
    y: 4,
    tool: "sandbag",
    place: "the wall in front of the lock",
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
    title: "Forecast",
    body: "Press Forecast. The overflow gate should open at the peak.",
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
    body: "Open the overflow gate at the black mark while it says GOING UP. Shut it when it says GOING DOWN. Tap leaks, plug a breaking wall, or send a crew to a weak levee.",
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
    title: "Forecast",
    body: "Press Forecast. The tide overflow has to open.",
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
    body: "Open the overflow gate at the black mark while it says GOING UP. Shut it when it says GOING DOWN. Tap leaks, plug a breaking wall, or send a crew to a weak levee.",
    next: "Run the surge",
    show: ["gauge", "floodway"],
  },
];

const EASY: Record<string, WalkStep[]> = {
  millford: [
    {
      kind: "read",
      title: "Smaller flood",
      body: "A lower peak. Two levees and one pump. The lock can sit this one out.",
      next: "Show the hand",
      show: ["river"],
    },
    { kind: "tap", title: "Levee", body: "Bank in front of Millford.", x: 3, y: 1, tool: "levee", place: "the bank in front of Millford" },
    { kind: "tap", title: "Second levee", body: "South half of Millford.", x: 3, y: 2, tool: "levee", place: "the second Millford bank" },
    { kind: "tap", title: "Town pump", body: "Inside Millford.", x: 4, y: 1, tool: "pump", place: "Millford" },
    { kind: "button", title: "Forecast", body: "Press Forecast. Leave the overflow gate shut.", button: "model" },
    { kind: "button", title: "Start", body: "Press Begin flood fight.", button: "begin" },
    {
      kind: "read",
      title: "Gate stays shut",
      body: "This flood fits behind the town. Leave the overflow gate shut. Tap leaks, plug a breaking wall, or send a crew to a weak levee.",
      next: "Run the river",
      show: ["gauge"],
    },
  ],
  oxbow: [
    {
      kind: "read",
      title: "Easy reach",
      body: "Both towns, sandbags on the lock. Leave the overflow gate shut.",
      next: "Show the hand",
      show: ["river"],
    },
    { kind: "tap", title: "Levee", body: "Hartsfield, north bank.", x: 2, y: 1, tool: "levee", place: "Hartsfield's north bank" },
    { kind: "tap", title: "Second levee", body: "Hartsfield, south bank.", x: 2, y: 2, tool: "levee", place: "Hartsfield's south bank" },
    { kind: "tap", title: "Hospital levee", body: "North bank, county hospital.", x: 4, y: 1, tool: "levee", place: "the hospital's north bank" },
    { kind: "tap", title: "Hospital levee", body: "South bank, same low area.", x: 4, y: 2, tool: "levee", place: "the hospital's south bank" },
    { kind: "tap", title: "Sandbags", body: "The wall in front of the lock.", x: 2, y: 4, tool: "sandbag", place: "the wall in front of the lock" },
    { kind: "tap", title: "Town pump", body: "Inside Hartsfield.", x: 1, y: 1, tool: "pump", place: "Hartsfield" },
    { kind: "tap", title: "Hospital pump", body: "Inside the county hospital.", x: 5, y: 1, tool: "pump", place: "the county hospital" },
    { kind: "button", title: "Forecast", body: "Press Forecast. Leave the overflow gate shut.", button: "model" },
    { kind: "button", title: "Start", body: "Press Begin flood fight.", button: "begin" },
    {
      kind: "read",
      title: "Gate stays shut",
      body: "The peak fits behind the line. Leave the overflow gate shut. Tap leaks, plug a breaking wall, or send a crew to a weak levee.",
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
    { kind: "button", title: "Forecast", body: "Press Forecast. Leave the overflow gate shut.", button: "model" },
    { kind: "button", title: "Start", body: "Press Begin flood fight.", button: "begin" },
    {
      kind: "read",
      title: "Gate stays shut",
      body: "This surge fits behind the line. Leave the tide gate shut. Tap leaks, plug a breaking wall, or send a crew to a weak levee.",
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
