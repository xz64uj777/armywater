export type Kind =
  | "high"
  | "upland"
  | "river"
  | "bank"
  | "town"
  | "hospital"
  | "lock"
  | "farm"
  | "wetland"
  | "road"
  | "basin"
  | "depot";

export interface Place {
  x: number;
  y: number;
  label: string;
  pop?: number;
}

export interface Hydro {
  base: number;
  crest: number;
  peak: number;
  width: number;
  outlet: number;
  rain: number;
  /** Extra tailwater inflow at the height of a coastal surge. 0 = none. */
  surge: number;
}

export interface Gauge {
  name: string;
  datum: number;
  scale: number;
  flood: number;
  major: number;
  top: number;
}

export interface MissionDef {
  id: string;
  index: string;
  codename: string;
  district: string;
  river: string;
  hazard: string;
  summary: string;
  briefing: string;
  objective: string;
  orders: string[];
  rows: string[];
  places: Place[];
  budget: number;
  reserve: number;
  duration: number;
  hydro: Hydro;
  gauge: Gauge;
  /** Farms are the intended sacrifice if the floodway runs. */
  sacrificialFarms: boolean;
}

export type Difficulty = "easy" | "hard";

const EASY_ORDERS: Record<string, string[]> = {
  millford: [
    "Two levees on the town bank. This smaller flood does not reach Lock 4, the river lock.",
    "One pump inside Millford. A levee traps rain behind it, so the low ground needs a pump.",
    "Leave the overflow gate shut.",
  ],
  oxbow: [
    "Levees on both town banks, and sandbags on the wall in front of the lock.",
    "A pump in Hartsfield and a pump in the hospital.",
    "The overflow gate can stay shut. The peak fits behind a full line.",
  ],
  amity: [
    "Levees in front of Port Amity and Harbor Clinic.",
    "A pump in each low area behind the levees.",
    "Leave the tide gate shut. This is not the full surge.",
  ],
};

export function tunedMission(base: MissionDef, mode: Difficulty): MissionDef {
  if (mode === "hard") return base;
  return {
    ...base,
    hydro: {
      ...base.hydro,
      crest: Math.round(base.hydro.crest * 0.7 * 100) / 100,
      rain: base.hydro.rain * 0.45,
      surge: Math.round(base.hydro.surge * 0.45 * 100) / 100,
    },
    budget: base.budget + (base.id === "millford" ? 40 : 80),
    reserve: base.reserve + 30,
    sacrificialFarms: false,
    orders: EASY_ORDERS[base.id] ?? base.orders,
  };
}

export const ELEV: Record<Kind, number> = {
  high: 8.6,
  upland: 5.1,
  river: 0,
  bank: 1.22,
  town: 1.72,
  hospital: 1.84,
  lock: 1.68,
  farm: 1.02,
  wetland: 0.58,
  road: 2.55,
  basin: 0.52,
  depot: 7.4,
};

export const MISSIONS: MissionDef[] = [
  {
    id: "millford",
    index: "01",
    codename: "Millford",
    district: "Blackhawk District",
    river: "Blackhawk River",
    hazard: "Spring flood",
    summary: "A town in a low spot, a river lock with a boat still inside, and an overflow gate you should not need.",
    briefing:
      "Snow is melting in the hills, and the Blackhawk is already over its banks. Millford sits in low ground. Lock 4, the river lock, still has a boat in it. Spend your building budget before the water peaks, then use two crews and a small emergency reserve to hold the line.",
    objective: "Keep Millford and Lock 4 dry through the peak of the flood.",
    orders: [
      "Put levees on the bank, between the river and what you are protecting.",
      "A levee traps rain behind it. Put a pump in Millford or the streets will fill.",
      "The overflow gate dumps the river into the lower fields. If your line is built, leave the gate shut.",
    ],
    rows: [
      "hhhhhhhhhh",
      "hhrBThhhhh",
      "hhrBTDhhhh",
      "hhrhhhhhhh",
      "hhrGKhhhhh",
      "hhrhhhhhhh",
      "hhrsFFhhhh",
      "hhrsWFhhhh",
      "hhhhhhhhhh",
    ],
    places: [
      { x: 4, y: 1, label: "Millford", pop: 1680 },
      { x: 4, y: 2, label: "Millford", pop: 940 },
      { x: 5, y: 2, label: "Depot" },
      { x: 4, y: 4, label: "Lock 4" },
      { x: 3, y: 4, label: "Guide wall" },
      { x: 4, y: 6, label: "Lower fields" },
      { x: 5, y: 6, label: "Lower fields" },
      { x: 5, y: 7, label: "Lower fields" },
      { x: 4, y: 7, label: "Sawgrass" },
      { x: 3, y: 6, label: "Floodway" },
      { x: 3, y: 7, label: "Floodway" },
    ],
    budget: 360,
    reserve: 66,
    duration: 120,
    hydro: { base: 0.72, crest: 3.15, peak: 0.56, width: 0.18, outlet: 0.85, rain: 0.0042, surge: 0 },
    gauge: { name: "Millford", datum: 8, scale: 3.55, flood: 16, major: 19.5, top: 28 },
    sacrificialFarms: false,
  },
  {
    id: "oxbow",
    index: "02",
    codename: "Oxbow",
    district: "Oxbow District",
    river: "Oxbow Reach",
    hazard: "The overflow decision",
    summary: "Two banks, one budget, and soybean fields that can take the extra water.",
    briefing:
      "Hartsfield and the county hospital face each other across the river. The budget will not buy a careless line. Downstream, the old overflow channel runs through soybeans this year. Open that gate when the river gauge hits the high mark — not at the first rain, and not after the levees are already gone.",
    objective: "Hold Hartsfield, the hospital, and Lock 7. Use the overflow for the peak, not the whole storm.",
    orders: [
      "Both communities need a levee on their river bank, and each low area behind a levee needs a pump.",
      "The wall in front of the lock can take a sandbag line. A full levee there spends money the hospital needs.",
      "Open the overflow gate as the peak arrives. Leave it open the entire fight and the fields pay for your caution.",
    ],
    rows: [
      "hhhhhhhhhhhhh",
      "hTBrBHhhhhhhh",
      "hTBrBHDhhhhhh",
      "hhh=hhhhhhhhh",
      "hKGrhhhhhhhhh",
      "hhhrsshhhhhhh",
      "hhhhsFWhhhhhh",
      "hhhhsWFhhhhhh",
      "hhhhhhhhhhhhh",
    ],
    places: [
      { x: 1, y: 1, label: "Hartsfield", pop: 1420 },
      { x: 1, y: 2, label: "Hartsfield", pop: 860 },
      { x: 5, y: 1, label: "County Hospital", pop: 640 },
      { x: 5, y: 2, label: "County Hospital", pop: 380 },
      { x: 6, y: 2, label: "Depot" },
      { x: 1, y: 4, label: "Lock 7" },
      { x: 2, y: 4, label: "Guide wall" },
      { x: 5, y: 6, label: "Soybeans" },
      { x: 6, y: 7, label: "Soybeans" },
      { x: 6, y: 6, label: "Backwater" },
      { x: 5, y: 7, label: "Backwater" },
    ],
    budget: 490,
    reserve: 70,
    duration: 135,
    hydro: { base: 0.78, crest: 4.45, peak: 0.54, width: 0.16, outlet: 0.85, rain: 0.0044, surge: 0 },
    gauge: { name: "Hartsfield", datum: 8, scale: 3.55, flood: 16, major: 20, top: 30 },
    sacrificialFarms: true,
  },
  {
    id: "amity",
    index: "03",
    codename: "Port Amity",
    district: "Coastal District",
    river: "Amity Sound",
    hazard: "Storm surge",
    summary: "The outlet drowns. The gauge climbs from the bottom of the map.",
    briefing:
      "Storm Ione is not a river flood. The surge comes up the sound, the outlet gates stop working, and Port Amity has less time than money. Build a short line, keep a pump running, and open the tide overflow when water from downstream hits the high mark — then shut it once the gauge turns down.",
    objective: "Keep Port Amity and Harbor Clinic dry through the surge.",
    orders: [
      "Water rises from downstream. A levee too far upstream will not help.",
      "Pumps die if the low ground fills over them. Repair them, or the town floods behind a standing levee.",
      "The tide overflow scars the marsh. Run it for the surge, not the whole evening.",
    ],
    rows: [
      "hhhhhhhhhh",
      "hhTBrhhhhh",
      "hDTBrhhhhh",
      "hhhhrhhhhh",
      "hhHBrhhhhh",
      "hhhhrhhhhh",
      "uuuurssuuu",
      "uuuurWWuuu",
    ],
    places: [
      { x: 2, y: 1, label: "Port Amity", pop: 2100 },
      { x: 2, y: 2, label: "Port Amity", pop: 760 },
      { x: 1, y: 2, label: "Depot" },
      { x: 2, y: 4, label: "Harbor Clinic", pop: 520 },
      { x: 5, y: 6, label: "Tide gate" },
      { x: 6, y: 6, label: "Tide gate" },
      { x: 5, y: 7, label: "Tidal marsh" },
      { x: 6, y: 7, label: "Tidal marsh" },
    ],
    budget: 400,
    reserve: 88,
    duration: 110,
    hydro: { base: 0.7, crest: 3.05, peak: 0.62, width: 0.15, outlet: 0.85, rain: 0.0055, surge: 3.4 },
    gauge: { name: "Port Amity", datum: 7.5, scale: 3.7, flood: 15, major: 19, top: 30 },
    sacrificialFarms: true,
  },
];

export function missionById(id: string): MissionDef {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}
