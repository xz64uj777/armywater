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
    "Two levees on the town bank. This freshet does not reach Lock 4.",
    "One pump inside Millford. The levee makes a bowl.",
    "Leave the floodway shut.",
  ],
  oxbow: [
    "Levees on both town banks, and sandbags on the lock guide wall.",
    "A pump in Hartsfield and a pump in the hospital.",
    "The gate can stay shut. The crest fits behind a full line.",
  ],
  amity: [
    "Levees in front of Port Amity and Harbor Clinic.",
    "A pump in each bowl.",
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
    hazard: "Spring freshet",
    summary: "A town in a bowl, a lock with a tow in the chamber, and a floodway you should not need.",
    briefing:
      "Snow is leaving the ridges and the Blackhawk is already off its summer banks. Millford sits in a bowl behind the spoil bank. Lock 4 still has a tow in the chamber. You get one civil-works budget before the crest — then two engineer sections and a thin flood-fight reserve.",
    objective: "Keep Millford and Lock 4 dry through the crest.",
    orders: [
      "Levees go on the bank, between the river and what you are protecting.",
      "A levee makes a bowl. Put a pump in Millford or seepage will pond until the streets fail.",
      "The floodway dumps the river into the lower fields. If the line is built, leave the gate shut.",
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
    hazard: "The floodway decision",
    summary: "Two banks, one appropriation, and soybean fields that are also a relief valve.",
    briefing:
      "Hartsfield and the county hospital face each other across the channel. The appropriation will not buy a careless line. Downstream, the old floodway is in soybeans this year. Open that gate when the gauge goes major — not from the first drop of rain, and not after the levees are already gone.",
    objective: "Hold Hartsfield, the hospital, and Lock 7. Use the floodway for the crest, not the whole storm.",
    orders: [
      "Both communities need a levee on their river bank, and each bowl needs a pump.",
      "The lock's guide wall can take a sandbag line. A full levee there spends money the hospital needs.",
      "Open the floodway as the crest arrives. Leave it open the entire fight and the basin pays for your caution.",
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
      "Storm Ione is not a river flood. The surge comes up the sound, the outlet gates stop working, and Port Amity has less time than money. Build a short line, keep a pump alive, and open the tidal floodway when tailwater goes major — then get it shut once the gauge turns.",
    objective: "Keep Port Amity and Harbor Clinic dry through the surge.",
    orders: [
      "Tailwater rises from downstream. A pretty upstream levee does not help a drowned outlet.",
      "Pumps die if the bowl fills over their pads. Repair them, or the town floods behind a standing levee.",
      "The tidal floodway scars the marsh. Run it for the surge, not the whole evening.",
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
