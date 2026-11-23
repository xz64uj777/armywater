import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Droplets,
  Fan,
  FastForward,
  Fence,
  HardHat,
  Pause,
  Play,
  Undo2,
  Volume2,
  VolumeX,
  Waves,
  Ship,
  Truck,
} from "lucide-react";
import { MISSIONS, missionById, tunedMission, type Difficulty, type MissionDef } from "./missions";
import {
  COSTS,
  cellAt,
  clockLabel,
  createState,
  gaugeDepth,
  limbOf,
  orderCrew,
  placePump,
  placeWall,
  runModel,
  scoreGame,
  sellCell,
  startFight,
  step,
  toFeet,
  toggleSpill,
  FIGHT,
  sandbagLeak,
  plugBreak,
  movePump,
  isWeakWall,
  aimBoat,
  steerBoat,
  aimTruck,
  type GameState,
  type Letter,
  type ModelReport,
  type Scorecard,
} from "./sim";
import { computeView, drawMap, type Floater, type Fx, type View } from "./draw";
import { createAudio, type AudioBus } from "./audio";
import { tapDone, walkFor, walkMarks, type WalkStep } from "./walk";
import type { Relief } from "./scene3d";

type Screen = "title" | "brief" | "manual" | "play";
type Tool = "levee" | "sandbag" | "pump" | "sell" | "repair";

type FightGesture = {
  id: number;
  sx: number;
  sy: number;
  cellX: number;
  cellY: number;
  downAt: number;
  mode: "pending" | "plug" | "pump" | "tap" | "look" | "boat" | "truck";
  held: number;
  fromPump?: { x: number; y: number };
};

const SAVE_KEY = "hold-the-river-v1";
const RANK: Record<Letter, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

interface Save {
  version: 1;
  grades: Record<string, string>;
  mute: boolean;
  mode?: Difficulty;
  walks?: Record<string, boolean>;
}

function loadSave(): Save {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { version: 1, grades: {}, mute: false, mode: "easy", walks: {} };
    const parsed = JSON.parse(raw) as Save;
    if (parsed?.version !== 1) return { version: 1, grades: {}, mute: false, mode: "easy", walks: {} };
    return {
      version: 1,
      grades: parsed.grades ?? {},
      mute: Boolean(parsed.mute),
      mode: parsed.mode === "hard" ? "hard" : "easy",
      walks: parsed.walks ?? {},
    };
  } catch {
    return { version: 1, grades: {}, mute: false, mode: "easy", walks: {} };
  }
}

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden>
      <path d="M4 30 V18 H12 V12 H20 V18 H44 V12 H52 V18 H60 V30" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M4 30 H60 V36 H4 Z" fill="currentColor" />
      <path d="M8 44 Q18 36 28 44 T48 44 T60 42" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

export function GameApp() {
  const [screen, setScreen] = useState<Screen>("title");
  const [missionId, setMissionId] = useState(MISSIONS[0].id);
  const [tool, setTool] = useState<Tool>("levee");
  const [status, setStatus] = useState("Stake levees on the bank between the river and the town.");
  const [hoverText, setHoverText] = useState("");
  const [hudTick, setHudTick] = useState(0);
  const [model, setModel] = useState<ModelReport | null>(null);
  const [assumeSpill, setAssumeSpill] = useState(false);
  const [debrief, setDebrief] = useState<Scorecard | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualReturn, setManualReturn] = useState<"title" | "brief">("title");
  const [coach, setCoach] = useState<number | null>(null);
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [mute, setMute] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");

  const stateRef = useRef<GameState | null>(null);
  const audioRef = useRef<AudioBus | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<View | null>(null);
  const reliefRef = useRef<Relief | null>(null);
  const fxRef = useRef<Fx>({ phase: 0, trauma: 0, shake: true, hover: null, floaters: [], model: null, marks: [], storm: 0, rain: false, breach: null, pumpDrag: null });
  const toolRef = useRef(tool);
  const screenRef = useRef(screen);
  const missionRef = useRef(missionById(missionId));
  const breachesRef = useRef(0);
  const logRef = useRef("");
  const reportedRef = useRef(false);
  const pausedBeforeManual = useRef(false);
  const manualOpenRef = useRef(false);
  const coachRef = useRef<number | null>(null);
  const paintRef = useRef("");
  const lookRef = useRef(true);
  const [look, setLook] = useState(true);
  const [alert, setAlert] = useState<FightAlert | null>(null);
  const alertRef = useRef<FightAlert | null>(null);
  const alertSeenRef = useRef(new Set<string>());
  const alertCoolRef = useRef(0);
  const breachIdRef = useRef(0);
  const seenBreachRef = useRef(new Set<string>());
  const fightPtr = useRef<FightGesture | null>(null);
  const helmRef = useRef<"boat" | "truck" | null>(null);
  const [helm, setHelm] = useState<"boat" | "truck" | null>(null);
  const walksRef = useRef<Record<string, boolean>>({});
  const difficultyRef = useRef<Difficulty>("easy");
  const pausedByCoach = useRef(false);
  const gradesRef = useRef<Record<string, string>>({});
  const muteRef = useRef(mute);
  toolRef.current = tool;
  screenRef.current = screen;
  missionRef.current = tunedMission(missionById(missionId), difficulty);
  muteRef.current = mute;
  manualOpenRef.current = manualOpen;
  coachRef.current = coach;
  gradesRef.current = grades;
  difficultyRef.current = difficulty;
  const assumeRef = useRef(assumeSpill);
  assumeRef.current = assumeSpill;

  useEffect(() => {
    const save = loadSave();
    setGrades(save.grades);
    setMute(save.mute);
    setDifficulty(save.mode === "hard" ? "hard" : "easy");
    walksRef.current = save.walks ?? {};
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fxRef.current.shake = !reduce;
    audioRef.current = createAudio();
    if (save.mute) audioRef.current.setMuted(true);
    const onVis = () => {
      if (document.visibilityState === "visible") audioRef.current?.unlock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screenRef.current !== "play" || !stateRef.current || manualOpenRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const state = stateRef.current;
      if (e.code === "Escape" && coachRef.current != null) {
        e.preventDefault();
        finishCoach();
      }
      if (e.code === "Digit1") setTool(state.mode === "fight" ? "repair" : "levee");
      if (e.code === "Digit2") setTool("sandbag");
      if (e.code === "Digit3" && state.mode === "build") setTool("pump");
      if (e.code === "Digit4" && state.mode === "build") setTool("sell");
      if (e.code === "KeyF") {
        e.preventDefault();
        act(toggleSpill(state));
      }
      if (e.code === "KeyM") {
        const state = stateRef.current;
        if (!state) return;
        const report = runModel(state, missionRef.current, assumeRef.current && state.mode === "build");
        setModel(report);
        fxRef.current.model = report.maxWater;
        setStatus(report.summary);
        const step = currentStep();
        if (step?.kind === "button" && step.button === "model") goCoach((coachRef.current ?? 0) + 1);
        audioRef.current?.ui();
      }
      if (e.code === "Space" && state.mode === "fight") {
        e.preventDefault();
        state.paused = !state.paused;
        setHudTick((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (screen !== "play") return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudAt = 0;
    let cancelled = false;
    const canvas = canvasRef.current;
    void import("./scene3d").then(({ Relief }) => {
      if (cancelled || !canvas) return;
      reliefRef.current = new Relief(canvas);
    });
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      reliefRef.current?.zoom(e.deltaY);
    };
    canvas?.addEventListener("wheel", onWheel, { passive: false });
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const state = stateRef.current;
      if (state && canvas) {
        if (state.mode === "fight" && !state.paused) {
          acc += dt * state.speed;
          while (acc >= 1 / 30) {
            step(state, 1 / 30);
            acc -= 1 / 30;
          }
        } else if (state.mode === "build") {
          step(state, dt);
        }
        const fx = fxRef.current;
        fx.phase += dt;
        fx.trauma = Math.max(0, fx.trauma - dt * 1.35);
        for (const f of fx.floaters) {
          f.life -= dt;
          f.y -= dt * 0.35;
        }
        fx.floaters = fx.floaters.filter((f) => f.life > 0);
        if (state.breaches > breachesRef.current) {
          breachesRef.current = state.breaches;
          fx.trauma = Math.min(1, fx.trauma + 0.95);
          audioRef.current?.breach();
          try {
            navigator.vibrate?.([50, 40, 90]);
          } catch {
            /* unsupported */
          }
          const broken = state.cells.find((c) => c.wall?.breached && !seenBreachRef.current.has(`${c.x},${c.y}`));
          if (broken) {
            seenBreachRef.current.add(`${broken.x},${broken.y}`);
            breachIdRef.current += 1;
            fx.breach = { x: broken.x, y: broken.y, id: breachIdRef.current };
          }
        }
        fx.storm = stormLevel(state);
        fx.rain = state.mode === "fight" && !state.paused;
        fx.helm = helmRef.current;
        const gest = fightPtr.current;
        if (gest?.mode === "plug" && state.mode === "fight") {
          const held = (now - gest.downAt) / 1000;
          const add = Math.max(0, held - gest.held);
          if (add > 0) {
            const msg = plugBreak(state, gest.cellX, gest.cellY, add / FIGHT.plugHold);
            gest.held = held;
            if (msg.startsWith("You plugged")) {
              audioRef.current?.place();
              floatAt(gest.cellX, gest.cellY, "Plugged");
              setStatus(msg);
              fightPtr.current = null;
              reliefRef.current?.setOrbitLock(false);
            }
          }
        }
        const top = state.log[0]?.text ?? "";
        if (top && top !== logRef.current) {
          logRef.current = top;
          if (!top.startsWith("Levee breach") && !top.startsWith("Sandbags")) audioRef.current?.ui();
          setStatus(top);
        }
        audioRef.current?.setRain(state.mode === "fight" && !state.paused);
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        if (cssW < 8 || cssH < 8) {
          raf = requestAnimationFrame(loop);
          return;
        }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        fx.marks = walkMarks(state, missionRef.current.id, difficultyRef.current, coachRef.current);
        fx.tool = toolRef.current;
        const relief = reliefRef.current;
        if (relief) {
          relief.setDragOrbit(lookRef.current);
          relief.resize(cssW, cssH, dpr);
          relief.sync(state, fx);
          relief.render();
        }
        hudAt += dt;
        if (hudAt > 0.2) {
          hudAt = 0;
          setHudTick((n) => n + 1);
          offerAlert(state);
        }
        if (state.mode === "done" && !reportedRef.current) {
          reportedRef.current = true;
          const card = scoreGame(state, missionRef.current);
          setDebrief(card);
          remember(state.missionId, card.letter);
          if (card.letter === "A" || card.letter === "B") audioRef.current?.win();
          else audioRef.current?.fail();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      canvas?.removeEventListener("wheel", onWheel);
      reliefRef.current?.dispose();
      reliefRef.current = null;
    };
  }, [screen, 12]);

  useEffect(() => {
    if (screen !== "play" || coach == null) return;
    const state = stateRef.current;
    const step = walkFor(missionId, difficulty)[coach];
    if (!state || step?.kind !== "tap" || !tapDone(state, step)) return;
    const spec = walkFor(missionId, difficulty)[coach + 1];
    setCoach(coach + 1);
    if (spec?.kind === "tap") setTool(spec.tool);
  }, [coach, hudTick, screen, missionId, difficulty]);

  function persist(nextGrades: Record<string, string>, nextMute: boolean) {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          version: 1,
          grades: nextGrades,
          mute: nextMute,
          mode: difficultyRef.current,
          walks: walksRef.current,
        } satisfies Save),
      );
    } catch {
      /* private mode */
    }
  }

  function gradeKey(id: string) {
    return `${id}:${difficultyRef.current}`;
  }

  function remember(id: string, letter: Letter) {
    setGrades((prev) => {
      const key = gradeKey(id);
      const have = prev[key] as Letter | undefined;
      if (have && RANK[have] >= RANK[letter]) return prev;
      const next = { ...prev, [key]: letter };
      persist(next, muteRef.current);
      return next;
    });
  }

  function finishCoach() {
    const state = stateRef.current;
    if (state?.mode === "fight" && pausedByCoach.current) state.paused = false;
    pausedByCoach.current = false;
    walksRef.current = { ...walksRef.current, [gradeKey(missionRef.current.id)]: true };
    setCoach(null);
    persist(gradesRef.current, muteRef.current);
    setHudTick((n) => n + 1);
  }

  function currentStep(): WalkStep | null {
    if (coachRef.current == null) return null;
    return walkFor(missionRef.current.id, difficultyRef.current)[coachRef.current] ?? null;
  }

  function goCoach(step: number | null) {
    setCoach(step);
    if (step == null) return;
    const spec = walkFor(missionRef.current.id, difficultyRef.current)[step];
    if (spec?.kind === "tap") setTool(spec.tool);
  }

  function offerAlert(state: GameState) {
    if (state.mode !== "fight" || state.ended || coachRef.current != null || manualOpenRef.current) {
      if (alertRef.current) {
        alertRef.current = null;
        setAlert(null);
      }
      return;
    }
    if (alertRef.current) {
      if (alertResolved(state, alertRef.current)) {
        alertSeenRef.current.add(alertRef.current.id);
        alertRef.current = null;
        setAlert(null);
        alertCoolRef.current = state.t + 8;
      }
      return;
    }
    if (state.t < alertCoolRef.current) return;
    const next = pickFightAlert(state, alertSeenRef.current);
    if (!next) return;
    alertRef.current = next;
    setAlert(next);
  }

  function runAlert(next: FightAlert) {
    const state = stateRef.current;
    if (!state) return;
    if (next.action === "gate") act(toggleSpill(state));
    else if (next.action === "crew" && next.x != null && next.y != null) {
      setTool("repair");
      act(orderCrew(state, next.x, next.y, "repair"));
    }
    alertSeenRef.current.add(next.id);
    alertRef.current = null;
    setAlert(null);
    alertCoolRef.current = state.t + 12;
    setHudTick((n) => n + 1);
  }

  function dismissAlert() {
    const state = stateRef.current;
    if (alertRef.current) alertSeenRef.current.add(alertRef.current.id);
    alertRef.current = null;
    setAlert(null);
    if (state) alertCoolRef.current = state.t + 12;
  }

  function act(message: string) {
    if (!message) return;
    setStatus(message);
    audioRef.current?.ui();
  }

  function openManual(from: "title" | "brief") {
    audioRef.current?.unlock();
    audioRef.current?.ui();
    setManualReturn(from);
    setScreen("manual");
  }

  function openPlayManual() {
    const state = stateRef.current;
    if (state?.mode === "fight") {
      pausedBeforeManual.current = state.paused;
      state.paused = true;
      setHudTick((n) => n + 1);
    }
    setManualOpen(true);
  }

  function closePlayManual() {
    const state = stateRef.current;
    if (state?.mode === "fight") state.paused = pausedBeforeManual.current;
    setManualOpen(false);
    setHudTick((n) => n + 1);
  }

  function openBrief(id: string) {
    audioRef.current?.unlock();
    audioRef.current?.ui();
    setMissionId(id);
    setDebrief(null);
    setScreen("brief");
  }

  function openMap() {
    const mission = tunedMission(missionById(missionId), difficultyRef.current);
    const state = createState(mission);
    stateRef.current = state;
    breachesRef.current = 0;
    logRef.current = "";
    reportedRef.current = false;
    fxRef.current.model = null;
    fxRef.current.floaters = [];
    fxRef.current.breach = null;
    fxRef.current.storm = 0;
    fxRef.current.rain = false;
    fxRef.current.pumpDrag = null;
    fxRef.current.helm = null;
    fightPtr.current = null;
    helmRef.current = null;
    setHelm(null);
    alertSeenRef.current = new Set();
    alertCoolRef.current = 0;
    alertRef.current = null;
    setAlert(null);
    seenBreachRef.current = new Set();
    breachIdRef.current = 0;
    setModel(null);
    setDebrief(null);
    setTool("levee");
    setAssumeSpill(mission.sacrificialFarms);
    pausedByCoach.current = false;
    setCoach(walksRef.current[`${mission.id}:${difficultyRef.current}`] ? null : 0);
    setStatus("Tap where the hand points.");
    setScreen("play");
    audioRef.current?.unlock();
    audioRef.current?.place();
  }

  function beginFight() {
    const state = stateRef.current;
    if (!state || state.mode !== "build") return;
    const step = currentStep();
    if (coachRef.current != null && !(step?.kind === "button" && step.button === "begin")) {
      setStatus("Tap where the hand points before you start the clock.");
      return;
    }
    startFight(state);
    setTool("repair");
    setModel(null);
    fxRef.current.model = null;
    if (coachRef.current != null) {
      state.paused = true;
      pausedByCoach.current = true;
      goCoach(coachRef.current + 1);
    }
    setStatus(
      state.paused
        ? "Clock is held. Read the card, then start the river."
        : "The fight is on. Tap leaks and weak walls. Steer the boat. Drive the truck.",
    );
    audioRef.current?.place();
    setHudTick((n) => n + 1);
  }

  function runTheModel() {
    const state = stateRef.current;
    if (!state) return;
    const report = runModel(state, missionRef.current, assumeRef.current && state.mode === "build");
    setModel(report);
    fxRef.current.model = report.maxWater;
    setStatus(report.summary);
    const step = currentStep();
    if (step?.kind === "button" && step.button === "model") goCoach((coachRef.current ?? 0) + 1);
    audioRef.current?.ui();
  }

  function clearModel() {
    setModel(null);
    fxRef.current.model = null;
  }

  function floatAt(x: number, y: number, text: string) {
    const list: Floater[] = fxRef.current.floaters;
    list.push({ x: x + 0.5, y: y + 0.45, text, life: 1.1 });
  }

  function onMapPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    audioRef.current?.unlock();
    const relief = reliefRef.current;
    const state = stateRef.current;
    if (!relief || !state) return;
    if (e.type === "pointerdown") {
      relief.begin(e.pointerId, e.clientX, e.clientY);
      e.currentTarget.setPointerCapture(e.pointerId);
      paintRef.current = "";
      startFightGesture(e.pointerId, e.clientX, e.clientY, state, relief);
    }
    const gest = fightPtr.current;
    if (gest && gest.id === e.pointerId && state.mode === "fight") {
      const moved = Math.hypot(e.clientX - gest.sx, e.clientY - gest.sy);
      if (gest.mode === "pending") {
        if (moved < 14 && (performance.now() - gest.downAt) / 1000 >= FIGHT.pumpPress && gest.fromPump) {
          gest.mode = "pump";
          relief.setOrbitLock(true);
        } else if (moved >= 14) {
          gest.mode = "look";
          relief.setOrbitLock(false);
        }
      }
      const hover = relief.move(e.pointerId, e.clientX, e.clientY);
      if (hover && cellAt(state, hover.x, hover.y)) {
        fxRef.current.hover = hover;
        setHoverText(describe(state, hover.x, hover.y));
      }
      if (gest.mode === "pump") {
        const dest = hover ?? relief.pickAt(e.clientX, e.clientY);
        fxRef.current.pumpDrag = dest;
      }
      if (gest.mode === "boat" && moved >= 10) {
        const pt = relief.pickPoint(e.clientX, e.clientY);
        if (pt) steerBoat(state, Math.atan2(pt.y - state.boat.y, pt.x - state.boat.x));
      }
      return;
    }
    const hover = relief.move(e.pointerId, e.clientX, e.clientY);
    if (hover && cellAt(state, hover.x, hover.y)) {
      fxRef.current.hover = hover;
      setHoverText(describe(state, hover.x, hover.y));
      if (state.mode === "build" && e.buttons > 0 && !lookRef.current && relief.fingers() < 2) tryPlace(hover.x, hover.y);
    }
  }

  function pickHelm(next: "boat" | "truck" | null, announce: boolean) {
    helmRef.current = next;
    setHelm(next);
    fxRef.current.helm = next;
    if (!announce) return;
    if (next === "boat") setStatus("Drag to steer the boat, or tap a spot. The current will pull it.");
    else if (next === "truck") setStatus("Drag or tap a route. Take sandbags to a levee or a crew, or back to the depot.");
  }

  function startFightGesture(id: number, clientX: number, clientY: number, state: GameState, relief: Relief) {
    relief.setOrbitLock(false);
    fxRef.current.pumpDrag = null;
    fightPtr.current = null;
    if (state.mode !== "fight" || state.ended) return;
    const plug = relief.hitNear(state, clientX, clientY, (c) => Boolean(c.wall?.breaking));
    const leak = relief.hitNear(state, clientX, clientY, (c) => Boolean(c.wall?.leaked));
    const pump = relief.hitNear(state, clientX, clientY, (c) => Boolean(c.pump && (c.pump.moving ?? 0) <= 0));
    const ground = relief.pickAt(clientX, clientY);
    const vehGuess = relief.hitVehicle(state, clientX, clientY) ?? helmRef.current;
    const cell = plug ?? leak ?? pump ?? ground;
    if (!cell && vehGuess !== "boat" && vehGuess !== "truck") return;
    const base: FightGesture = {
      id,
      sx: clientX,
      sy: clientY,
      cellX: cell?.x ?? 0,
      cellY: cell?.y ?? 0,
      downAt: performance.now(),
      mode: "tap",
      held: 0,
    };
    if (plug) {
      base.mode = "plug";
      base.cellX = plug.x;
      base.cellY = plug.y;
      relief.setOrbitLock(true);
    } else if (leak) {
      base.cellX = leak.x;
      base.cellY = leak.y;
    } else {
      const veh = relief.hitVehicle(state, clientX, clientY);
      const helmNow = veh ?? helmRef.current;
      if (helmNow === "boat" || helmNow === "truck") {
        base.mode = helmNow;
        if (veh) pickHelm(veh, false);
        relief.setOrbitLock(true);
      } else if (pump) {
        base.mode = "pending";
        base.fromPump = { x: pump.x, y: pump.y };
        base.cellX = pump.x;
        base.cellY = pump.y;
      }
    }
    fightPtr.current = base;
  }

  function onMapUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const relief = reliefRef.current;
    const state = stateRef.current;
    if (!relief || !state) return;
    const gest = fightPtr.current && fightPtr.current.id === e.pointerId ? fightPtr.current : null;
    const hit = relief.end(e.pointerId, e.clientX, e.clientY);
    relief.setOrbitLock(false);
    fxRef.current.pumpDrag = null;
    fightPtr.current = null;
    if (state.mode === "fight" && gest) {
      endFightGesture(state, gest, e.clientX, e.clientY, relief, hit);
      return;
    }
    if (!hit || !cellAt(state, hit.x, hit.y)) return;
    tryPlace(hit.x, hit.y);
  }

  function endFightGesture(
    state: GameState,
    gest: FightGesture,
    clientX: number,
    clientY: number,
    relief: Relief,
    hit: { x: number; y: number } | null,
  ) {
    if (gest.mode === "look") return;
    if (gest.mode === "plug") {
      const held = (performance.now() - gest.downAt) / 1000;
      if (held < 0.22) {
        const msg = plugBreak(state, gest.cellX, gest.cellY, 1 / FIGHT.plugTaps);
        if (msg) setStatus(msg);
        if (msg.startsWith("You plugged")) {
          audioRef.current?.place();
          floatAt(gest.cellX, gest.cellY, "Plugged");
        }
      }
      setHudTick((n) => n + 1);
      return;
    }
    if (gest.mode === "pump" && gest.fromPump) {
      const dest = relief.pickAt(clientX, clientY) ?? hit;
      if (!dest) {
        setStatus("Drop the pump on a town, hospital, or lock.");
        return;
      }
      const msg = movePump(state, gest.fromPump.x, gest.fromPump.y, dest.x, dest.y);
      setStatus(msg);
      if (msg.startsWith("Pump is moving")) audioRef.current?.place();
      setHudTick((n) => n + 1);
      return;
    }
    if (gest.mode === "boat" || gest.mode === "truck") {
      const veh = relief.hitVehicle(state, clientX, clientY);
      const moved = Math.hypot(clientX - gest.sx, clientY - gest.sy) > 12;
      if (!moved && veh) {
        pickHelm(veh, true);
        return;
      }
      if (gest.mode === "boat") {
        const pt = relief.pickPoint(clientX, clientY) ?? (hit ? { x: hit.x + 0.5, y: hit.y + 0.5 } : null);
        if (pt) {
          setStatus(aimBoat(state, pt.x, pt.y));
          audioRef.current?.ui();
        }
      } else {
        const dest = hit ?? relief.pickAt(clientX, clientY);
        if (dest) {
          setStatus(aimTruck(state, dest.x, dest.y));
          audioRef.current?.ui();
        }
      }
      setHudTick((n) => n + 1);
      return;
    }
    const moved = Math.hypot(clientX - gest.sx, clientY - gest.sy) > 12;
    if (moved || gest.mode === "pending" && moved) return;
    const leak = relief.hitNear(state, clientX, clientY, (c) => Boolean(c.wall?.leaked)) ?? (cellAt(state, gest.cellX, gest.cellY)?.wall?.leaked ? { x: gest.cellX, y: gest.cellY } : null);
    if (leak && cellAt(state, leak.x, leak.y)?.wall?.leaked) {
      const msg = sandbagLeak(state, leak.x, leak.y);
      setStatus(msg);
      if (msg.startsWith("Leak sandbagged")) {
        audioRef.current?.place();
        floatAt(leak.x, leak.y, "Sandbagged");
      }
      setHudTick((n) => n + 1);
      return;
    }
    const wallHit = relief.hitNear(state, clientX, clientY, (c) => Boolean(c.wall && isWeakWall(c.wall))) ?? (hit && cellAt(state, hit.x, hit.y)?.wall && isWeakWall(cellAt(state, hit.x, hit.y)!.wall!) ? hit : null);
    if (wallHit) {
      setTool("repair");
      const msg = orderCrew(state, wallHit.x, wallHit.y, "repair");
      setStatus(msg);
      audioRef.current?.ui();
      setHudTick((n) => n + 1);
      return;
    }
    if (hit && cellAt(state, hit.x, hit.y)) tryPlace(hit.x, hit.y);
  }

  function tryPlace(x: number, y: number) {
    const state = stateRef.current;
    if (!state) return;
    const key = `${x},${y}`;
    if (paintRef.current === key) return;
    paintRef.current = key;
    if (state.mode === "done") return;
    if (state.mode === "build" && coachRef.current != null && toolRef.current !== "sell") {
      const step = currentStep();
      if (!step || step.kind !== "tap" || x !== step.x || y !== step.y) {
        setStatus(step?.kind === "tap" ? `Not that parcel. Tap ${step.place}.` : "Follow the card.");
        return;
      }
      toolRef.current = step.tool;
      setTool(step.tool);
    }
    const t = toolRef.current;
    let message = "";
    if (state.mode === "build") {
      if (t === "levee" || t === "sandbag") message = placeWall(state, x, y, t);
      else if (t === "pump") message = placePump(state, x, y);
      else {
        const cell = cellAt(state, x, y);
        const refund = (cell?.wall ? COSTS[cell.wall.kind] : 0) + (cell?.pump ? COSTS.pump : 0);
        message = sellCell(state, x, y);
        if (message.startsWith("Returned")) {
          audioRef.current?.place();
          floatAt(x, y, `+$${refund}`);
          clearModel();
        }
      }
      if (message.startsWith("Levee") || message.startsWith("Sandbag") || message.startsWith("Pump")) {
        audioRef.current?.place();
        floatAt(x, y, costLabel(t));
        clearModel();
      }
    } else if (t === "sandbag") {
      message = orderCrew(state, x, y, "sandbag");
    } else {
      message = orderCrew(state, x, y, "repair");
    }
    setStatus(message);
    setHudTick((n) => n + 1);
  }

  function toggleMute() {
    const next = !mute;
    setMute(next);
    audioRef.current?.unlock();
    audioRef.current?.setMuted(next);
    persist(grades, next);
  }

  const mission = tunedMission(missionById(missionId), difficulty);
  const state = stateRef.current;
  const guide = coach == null ? null : (walkFor(mission.id, difficulty)[coach] ?? null);
  void hudTick;

  return (
    <div className="relative min-h-dvh bg-paper text-ink">
      {screen === "title" && (
        <Title
          grades={grades}
          mute={mute}
          difficulty={difficulty}
          onDifficulty={(mode) => {
            difficultyRef.current = mode;
            setDifficulty(mode);
            persist(gradesRef.current, muteRef.current);
          }}
          onMute={toggleMute}
          onPick={openBrief}
          onManual={() => openManual("title")}
        />
      )}
      {screen === "brief" && (
        <Brief
          mission={mission}
          difficulty={difficulty}
          onBack={() => setScreen("title")}
          onOpen={openMap}
          onManual={() => openManual("brief")}
        />
      )}
      {screen === "manual" && <Manual onBack={() => setScreen(manualReturn)} />}
      {screen === "play" && state && (
        <div className="safe-screen flex h-dvh flex-col overflow-hidden">
          <PlayHeader
            state={state}
            mission={mission}
            difficulty={difficulty}
            mute={mute}
            onMute={toggleMute}
            gaugeHot={guide?.kind === "read" && Boolean(guide.show?.includes("gauge"))}
          />
          <div className="relative min-h-0 flex-1">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full touch-none"
              onPointerDown={onMapPointer}
              onPointerMove={onMapPointer}
              onPointerUp={onMapUp}
              onPointerCancel={onMapUp}
              onPointerLeave={() => {
                fxRef.current.hover = null;
                setHoverText("");
              }}
              onContextMenu={(e) => e.preventDefault()}
              role="application"
              aria-label={`${mission.district} operations map`}
            />
            <div className="absolute inset-x-2 top-2 z-10 flex items-start gap-2">
              <p className="min-w-0 flex-1 bg-paper/90 px-2 py-1 font-display text-xs tracking-widest text-muted">
                {model
                  ? model.summary
                  : state.mode === "fight" && helm === "boat"
                    ? "DRAG TO STEER THE BOAT · TAP A SPOT"
                    : state.mode === "fight" && helm === "truck"
                      ? "DRAG OR TAP A ROUTE FOR THE TRUCK"
                      : look
                        ? "DRAG TO LOOK AROUND · TAP TO BUILD"
                        : "DRAG TO DRAW A LINE · TWO FINGERS TO LOOK AROUND"}
              </p>
              <button
                type="button"
                className={`h-11 shrink-0 border border-ink px-3 font-display text-sm tracking-wide ${look ? "bg-ink text-paper" : "bg-paper"}`}
                onClick={() => {
                  const next = !look;
                  lookRef.current = next;
                  setLook(next);
                }}
              >
                {look ? "Look around" : "Draw a line"}
              </button>
              <button
                type="button"
                className="h-11 shrink-0 border border-ink bg-paper px-3 font-display text-sm tracking-wide"
                onClick={() => reliefRef.current?.frame()}
              >
                Frame
              </button>
            </div>
            {guide && (
              <CoachCard
                step={guide}
                index={coach ?? 0}
                total={walkFor(mission.id, difficulty).length}
                onNext={() => {
                  if (guide.kind !== "read" || coach == null) return;
                  if (coach + 1 >= walkFor(mission.id, difficulty).length) finishCoach();
                  else goCoach(coach + 1);
                }}
                onSkip={finishCoach}
              />
            )}
            {alert && !guide && (
              <AlertCard alert={alert} onAct={() => runAlert(alert)} onSkip={dismissAlert} />
            )}
          </div>
          <footer className="shrink-0 border-t border-ink px-3 py-2">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-display text-sm tracking-wide text-muted">{hoverText || status}</p>
              <button type="button" className="h-11 shrink-0 px-3 font-display text-sm tracking-widest" onClick={openPlayManual}>
                Manual
              </button>
              <button
                type="button"
                className="h-11 shrink-0 px-3 font-display text-sm tracking-widest"
                onClick={() => {
                  const steps = walkFor(mission.id, difficulty);
                  if (state.mode === "build") goCoach(0);
                  else {
                    const i = steps.findIndex((s) => s.kind === "read" && (s.show?.includes("floodway") || s.show?.includes("gauge")));
                    goCoach(i >= 0 ? i : steps.length - 1);
                  }
                }}
              >
                Guide
              </button>
            </div>
            {state.mode === "build" && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className={`h-12 bg-scarlet px-3 font-display text-lg tracking-wide text-paper sm:flex-1 ${guide?.kind === "button" && guide.button === "begin" ? "shadow-[inset_0_0_0_3px_#1b2418]" : ""}`}
                  onClick={beginFight}
                >
                  Begin flood fight
                </button>
                <button
                  type="button"
                  aria-pressed={assumeSpill}
                  className={`h-12 px-3 font-display text-sm tracking-wide ${assumeSpill ? "bg-river text-foam" : "border border-ink bg-paper text-ink"}`}
                  onClick={() => setAssumeSpill((v) => !v)}
                >
                  {assumeSpill ? "Forecast: overflow open" : "Forecast: overflow shut"}
                </button>
              </div>
            )}
            {state.mode === "fight" && !state.ended && (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  aria-pressed={helm === "boat"}
                  className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-2 border border-ink px-2 font-display text-sm tracking-wide ${helm === "boat" ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                  onClick={() => pickHelm(helm === "boat" ? null : "boat", true)}
                >
                  <Ship className="size-5" />
                  {state.boat.carry > 0 ? `Boat · ${state.boat.carry} on board` : state.stranded.length ? "Boat · people on roofs" : "Boat"}
                </button>
                <button
                  type="button"
                  aria-pressed={helm === "truck"}
                  className={`flex h-11 min-w-0 flex-1 items-center justify-center gap-2 border border-ink px-2 font-display text-sm tracking-wide ${helm === "truck" ? "bg-ink text-paper" : "bg-paper text-ink"}`}
                  onClick={() => pickHelm(helm === "truck" ? null : "truck", true)}
                >
                  <Truck className="size-5" />
                  {state.truck.reload > 0 ? "Truck · loading" : `Truck · ${state.truck.loads} load${state.truck.loads === 1 ? "" : "s"}`}
                </button>
              </div>
            )}
            <div className="mt-2 flex gap-2">
              {state.mode === "build" ? (
                <>
                  <ToolButton label="Levee" cost={COSTS.levee} active={tool === "levee"} hot={guide?.kind === "tap" && guide.tool === "levee"} onClick={() => setTool("levee")} icon={<Fence className="size-5" />} />
                  <ToolButton label="Bags" cost={COSTS.sandbag} active={tool === "sandbag"} hot={guide?.kind === "tap" && guide.tool === "sandbag"} onClick={() => setTool("sandbag")} icon={<Waves className="size-5" />} />
                  <ToolButton label="Pump" cost={COSTS.pump} active={tool === "pump"} hot={guide?.kind === "tap" && guide.tool === "pump"} onClick={() => setTool("pump")} icon={<Fan className="size-5" />} />
                  <ToolButton label="Pull" active={tool === "sell"} onClick={() => setTool("sell")} icon={<Undo2 className="size-5" />} />
                </>
              ) : (
                <>
                  <ToolButton label="Repair" active={tool === "repair"} onClick={() => setTool("repair")} icon={<HardHat className="size-5" />} />
                  <ToolButton label="Bags" cost={COSTS.emergency} active={tool === "sandbag"} onClick={() => setTool("sandbag")} icon={<Waves className="size-5" />} />
                  <button
                    type="button"
                    className={`flex h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center font-display text-sm tracking-wide ${state.spillOpen ? "bg-river text-foam" : "border border-ink bg-paper text-ink"} ${guide?.kind === "read" && guide.show?.includes("floodway") ? "shadow-[inset_0_0_0_3px_#9d1c1c]" : ""}`}
                    onClick={() => act(toggleSpill(state))}
                  >
                    <Droplets className="size-5" />
                    {state.spillOpen ? "Gate open" : "Overflow"}
                  </button>
                  <button
                    type="button"
                    className="flex h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center border border-ink font-display text-sm tracking-wide"
                    onClick={() => {
                      if (state.mode !== "fight") return;
                      state.paused = !state.paused;
                      setHudTick((n) => n + 1);
                    }}
                  >
                    {state.paused ? <Play className="size-5" /> : <Pause className="size-5" />}
                    {state.paused ? "Run" : "Hold"}
                  </button>
                  <button
                    type="button"
                    className="flex h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center border border-ink font-display text-sm tracking-wide"
                    onClick={() => {
                      state.speed = state.speed === 1 ? 2 : 1;
                      setHudTick((n) => n + 1);
                    }}
                  >
                    <FastForward className="size-5" />
                    {state.speed === 1 ? "1×" : "2×"}
                  </button>
                </>
              )}
              <button
                type="button"
                className={`flex h-14 min-w-0 basis-16 flex-col items-center justify-center border border-ink px-2 font-display text-sm tracking-wide ${guide?.kind === "button" && guide.button === "model" ? "shadow-[inset_0_0_0_3px_#9d1c1c]" : ""}`}
                onClick={runTheModel}
              >
                Forecast
              </button>
            </div>
          </footer>
          {manualOpen && <Manual onBack={closePlayManual} overlay />}
          {debrief && (
            <Debrief
              card={debrief}
              mission={mission}
              onRetry={openMap}
              onDesk={() => setScreen("title")}
              onNext={() => {
                const i = MISSIONS.findIndex((m) => m.id === mission.id);
                const next = MISSIONS[i + 1];
                if (next) openBrief(next.id);
                else setScreen("title");
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CoachCard({
  step,
  index,
  total,
  onNext,
  onSkip,
}: {
  step: WalkStep;
  index: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-10 border border-ink bg-paper p-2 sm:inset-x-auto sm:right-3 sm:bottom-3 sm:w-72">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-xs tracking-widest text-scarlet">
          WALKTHROUGH · {index + 1} / {total}
        </p>
        <button type="button" onClick={onSkip} className="font-display text-xs tracking-widest text-muted">
          Skip
        </button>
      </div>
      <h2 className="font-display text-xl leading-none tracking-wide">{step.title}</h2>
      <p className="mt-1 text-sm leading-snug">{step.body}</p>
      {step.kind === "read" && (
        <button type="button" onClick={onNext} className="mt-3 h-11 w-full bg-scarlet font-display text-lg tracking-wide text-paper">
          {step.next}
        </button>
      )}
    </div>
  );
}

function costLabel(tool: Tool): string {
  if (tool === "levee") return `-$${COSTS.levee}`;
  if (tool === "sandbag") return `-$${COSTS.sandbag}`;
  if (tool === "pump") return `-$${COSTS.pump}`;
  return "";
}

function describe(state: GameState, x: number, y: number): string {
  const c = cellAt(state, x, y);
  if (!c) return "";
  const bits = [c.label || c.kind];
  if (c.wall) {
    const pct = Math.max(0, Math.round((c.wall.hp / c.wall.maxHp) * 100));
    bits.push(c.wall.breached ? `${c.wall.kind} BREACH` : `${c.wall.kind} ${pct}%`);
    if (c.wall.breaking) bits.push("giving way — plug it");
    else if (c.wall.leaked) bits.push("leak — tap to sandbag");
  }
  if (c.pump) bits.push(c.pump.flooded ? "pump flooded" : (c.pump.moving ?? 0) > 0 ? "pump moving" : "pump running");
  if (c.kind === "river") bits.push(`stage ${c.water.toFixed(1)} m`);
  else if (c.water > 0.05) bits.push(`${c.water.toFixed(2)} m on the ground`);
  if ((c.evac ?? 0) > 0 && c.water >= 0.18) bits.push("people on the roofs");
  if (c.failed) bits.push("LOST");
  if (c.spill) bits.push(state.spillOpen ? "gate open" : "gate shut");
  return bits.join(" · ");
}

function ToolButton({
  label,
  cost,
  active,
  hot,
  onClick,
  icon,
}: {
  label: string;
  cost?: number;
  active: boolean;
  hot?: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center font-display text-sm tracking-wide ${active ? "bg-ink text-paper" : "border border-ink bg-paper text-ink"} ${hot ? "shadow-[inset_0_0_0_3px_#9d1c1c]" : ""}`}
    >
      {icon}
      {label}
      {cost != null && <span className="text-xs opacity-80">${cost}</span>}
    </button>
  );
}

function PlayHeader({
  state,
  mission,
  difficulty,
  mute,
  onMute,
  gaugeHot,
}: {
  state: GameState;
  mission: MissionDef;
  difficulty: Difficulty;
  mute: boolean;
  onMute: () => void;
  gaugeHot?: boolean;
}) {
  const depth = gaugeDepth(state);
  const feet = toFeet(depth, state);
  const pct = Math.max(4, Math.min(100, (feet / state.topFt) * 100));
  const floodAt = (state.floodFt / state.topFt) * 100;
  const majorAt = (state.majorFt / state.topFt) * 100;
  const limb = limbOf(state);
  return (
    <header className="flex shrink-0 items-end gap-2 overflow-hidden border-b border-ink px-3 py-2">
      <div className="min-w-0">
        <p className="font-display text-xs tracking-widest text-muted">HOLD THE RIVER · {difficulty === "easy" ? "EASY" : "HARD"}</p>
        <h1 className="truncate font-display text-2xl leading-none">{mission.codename}</h1>
        <p className="font-display text-sm tracking-wide text-muted">
          Budget ${Math.round(state.budget)} · Reserve ${Math.round(state.reserve)}
        </p>
      </div>
      <div className={`min-w-0 flex-1 pb-1 ${gaugeHot ? "shadow-[inset_0_0_0_2px_#9d1c1c]" : ""}`}>
        <div className="flex justify-between font-display text-xs tracking-widest">
          <span className="text-muted">{state.gaugeName} gauge</span>
          <span>{state.mode === "build" ? "BASE" : `${feet.toFixed(1)} FT`}</span>
        </div>
        <div className="relative mt-1 h-3 bg-paper-2">
          <div className="absolute inset-y-0 left-0 bg-river" style={{ width: `${state.mode === "build" ? Math.min(pct, 42) : pct}%` }} />
          <span className="absolute inset-y-0 w-0.5 bg-scarlet" style={{ left: `${floodAt}%` }} title="Flood stage" />
          <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${majorAt}%` }} title="High flood" />
        </div>
      </div>
      <div className="text-right">
        <p className="font-display text-xl leading-none">{state.mode === "build" ? "PLAN" : clockLabel(state)}</p>
        <p className="font-display text-sm tracking-widest text-scarlet">{state.mode === "fight" ? limbLabel(limb) : mission.hazard.toUpperCase()}</p>
        <button type="button" className="mt-1 inline-flex h-11 w-11 items-center justify-center text-ink" aria-label={mute ? "Unmute" : "Mute"} onClick={onMute}>
          {mute ? <VolumeX className="ml-auto size-5" /> : <Volume2 className="ml-auto size-5" />}
        </button>
      </div>
    </header>
  );
}

function Title({
  grades,
  mute,
  difficulty,
  onDifficulty,
  onMute,
  onPick,
  onManual,
}: {
  grades: Record<string, string>;
  mute: boolean;
  difficulty: Difficulty;
  onDifficulty: (mode: Difficulty) => void;
  onMute: () => void;
  onPick: (id: string) => void;
  onManual: () => void;
}) {
  return (
    <main className="safe-screen mx-auto grid min-h-dvh w-full max-w-6xl content-center gap-8 px-4 py-6 lg:grid-cols-2 lg:items-center lg:px-8">
      <div>
        <div className="flex items-center justify-between">
          <p className="font-display text-xs tracking-widest text-muted">DISTRICT ENGINEER · FIELD PROBLEM</p>
          <button type="button" aria-label={mute ? "Unmute" : "Mute"} onClick={onMute} className="inline-flex h-11 w-11 items-center justify-center">
            {mute ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
        </div>
        <Mark className="mt-6 h-12 w-16 text-ink" />
        <h1 className="mt-3 font-display text-6xl leading-none tracking-wide sm:text-7xl">HOLD THE RIVER</h1>
        <p className="mt-4 max-w-xl text-lg leading-snug">
          You have a building budget, two work crews, and a river that is already over its banks. Build your defenses before the water peaks. Then hold the line.
        </p>
        <p className="mt-4 max-w-xl border-l-2 border-scarlet pl-3 text-base leading-snug">
          Levees on the bank. A pump in the low ground behind them. The overflow gate is a choice, not decoration.
        </p>
        <button type="button" onClick={onManual} className="mt-5 h-12 border border-ink px-4 font-display text-lg tracking-wide">
          How to play
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 border border-ink">
          <button
            type="button"
            aria-pressed={difficulty === "easy"}
            onClick={() => onDifficulty("easy")}
            className={`h-12 font-display text-lg tracking-wide ${difficulty === "easy" ? "bg-ink text-paper" : "bg-paper text-ink"}`}
          >
            Easy
          </button>
          <button
            type="button"
            aria-pressed={difficulty === "hard"}
            onClick={() => onDifficulty("hard")}
            className={`h-12 border-l border-ink font-display text-lg tracking-wide ${difficulty === "hard" ? "bg-ink text-paper" : "bg-paper text-ink"}`}
          >
            Hard
          </button>
        </div>
        <p className="text-sm leading-snug text-muted">
          {difficulty === "easy"
            ? "A lower flood. A shorter line holds, and you can leave the overflow gate shut."
            : "A full flood. On Oxbow and Port Amity you must open the overflow gate at the peak, or the towns fail."}
        </p>
        {MISSIONS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.id)}
            className="flex items-stretch gap-3 border border-ink bg-paper-2 p-3 text-left hover:bg-paper"
          >
            <span className="flex w-12 items-center justify-center border-r border-ink pr-3 font-display text-2xl">{m.index}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-2xl leading-none tracking-wide">{m.codename}</span>
              <span className="mt-1 block text-sm text-muted">
                {m.river} · {m.hazard}
              </span>
            </span>
            <span className="flex items-center font-display text-3xl">{grades[`${m.id}:${difficulty}`] ?? "—"}</span>
          </button>
        ))}
        <p className="font-display text-sm tracking-widest text-muted">Grade shown is for this mode. Each district keeps both.</p>
      </div>
    </main>
  );
}

function Brief({
  mission,
  difficulty,
  onBack,
  onOpen,
  onManual,
}: {
  mission: MissionDef;
  difficulty: Difficulty;
  onBack: () => void;
  onOpen: () => void;
  onManual: () => void;
}) {
  return (
    <main className="safe-screen mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-6">
      <button type="button" onClick={onBack} className="inline-flex h-11 items-center self-start font-display text-sm tracking-widest text-muted">
        ← District desk
      </button>
      <p className="mt-6 font-display text-xs tracking-widest text-scarlet">
        {difficulty === "easy" ? "EASY" : "HARD"} · {mission.index} · {mission.hazard.toUpperCase()}
      </p>
      <h1 className="mt-1 font-display text-5xl leading-none tracking-wide">{mission.codename}</h1>
      <p className="mt-1 font-display text-lg tracking-wide text-muted">
        {mission.district} · {mission.river}
      </p>
      <p className="mt-5 text-lg leading-snug">{mission.briefing}</p>
      <p className="mt-3 border-l-2 border-scarlet pl-3 text-base leading-snug">
        {difficulty === "easy"
          ? "A smaller flood. The walkthrough marks the short line."
          : "A full flood. The walkthrough marks the line that holds, including the overflow gate when you need it."}
      </p>
      <p className="mt-4 font-display text-xl tracking-wide">Objective — {mission.objective}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {mission.orders.map((order) => (
          <li key={order} className="border-l-2 border-scarlet pl-3 text-base leading-snug">
            {order}
          </li>
        ))}
      </ul>
      <p className="mt-4 font-display text-sm tracking-wide text-muted">
        Budget ${mission.budget} · Emergency reserve ${mission.reserve} · Levee ${COSTS.levee} · Sandbags ${COSTS.sandbag} · Pump ${COSTS.pump}
      </p>
      <button type="button" onClick={onManual} className="mt-6 h-12 border border-ink font-display text-lg tracking-wide">
        How to play
      </button>
      <button type="button" onClick={onOpen} className="mt-2 h-14 bg-scarlet font-display text-2xl tracking-wide text-paper">
        Open the district map
      </button>
    </main>
  );
}

const MANUAL: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Two stages",
    body: "Open a district. A hand points at one square. Tap it, then the next. Skip if you already know the line. Building money only spends before you start the flood fight.",
  },
  {
    n: "02",
    title: "Where a levee goes",
    body: `Select Levee ($${COSTS.levee}) and tap a bank square between the river and the town, lock, or hospital. Sandbags ($${COSTS.sandbag}) are shorter and can blow out at a high peak. Save them for the wall in front of a lock, not the town bank.`,
  },
  {
    n: "03",
    title: "Low ground needs a pump",
    body: `A levee stops the river and traps the rain. Select Pump ($${COSTS.pump}) and tap inside the town, the hospital, or the lock. One pump can drain a connected pair of town squares. Pull refunds a mistake back into the building budget.`,
  },
  {
    n: "04",
    title: "Check the forecast",
    body: "Forecast runs your current line through the storm. Forecast: overflow open assumes you open the overflow gate at the peak. If it names a town, a lock, or a hospital, change the plan before you start.",
  },
  {
    n: "05",
    title: "During the fight",
    body: `Watch the river gauge. The red mark is flood stage. The black mark is high flood. Repair sends the nearest crew to a break or a drowned pump. Bags ($${COSTS.emergency} from the reserve) throws an emergency line on an empty bank. They need a dry path. Hold pauses. 2× runs the clock faster.`,
  },
  {
    n: "06",
    title: "Stay on the line",
    body: "A bubbling leak on a stressed levee will eat the wall if you leave it. Tap the leak to sandbag it. If a wall starts to break, a ring counts down — tap quickly or hold to plug it before time runs out. Press and hold a pump, then drag it to a new town, hospital, or lock; it will not pump until it is set. Tap a weak or failing levee to send the nearest free crew. When a town floods, people stand on the roofs — tap Boat, then drag or tap a spot to steer; the current will pull it, and people you drop on dry ground count as saved. Tap Truck and drag or tap a route from the depot to a levee or a crew; a load strengthens that wall or gives the crew a fresh bag kit, and flooded roads slow or block the truck.",
  },
  {
    n: "07",
    title: "The overflow gate",
    body: "The gate dumps the river into the lower fields. Open it when the gauge hits the black high-flood mark, and shut it once the label says GOING DOWN. Leave it open the whole fight and the grade drops. On Millford a built line should not need it. On Oxbow and Port Amity, a shut gate lets the peak over the levees.",
  },
  {
    n: "08",
    title: "The grade",
    body: "A means the town, lock, and hospital stayed dry and you did not flood the fields for too long. B means you held, but the fields or a gate left open too long paid for it. Losing the town, the lock, or the hospital is C, D, or F. Grades stay on this screen.",
  },
];

function Manual({ onBack, overlay }: { onBack: () => void; overlay?: boolean }) {
  return (
    <div className={overlay ? "safe-screen absolute inset-0 z-20 overflow-y-auto bg-paper" : "safe-screen min-h-dvh overflow-y-auto bg-paper"}>
      <main className="mx-auto flex max-w-2xl flex-col px-4 py-6">
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center self-start font-display text-sm tracking-widest text-muted">
          {overlay ? "← Back to the map" : "← Back"}
        </button>
        <p className="mt-6 font-display text-xs tracking-widest text-scarlet">HOW TO PLAY</p>
        <h1 className="mt-1 font-display text-5xl leading-none tracking-wide">HOLD THE LINE</h1>
        <p className="mt-4 text-lg leading-snug">
          You are in charge of the district. The river does not care about the budget. Your grade depends on who stayed dry.
        </p>
        <ol className="mt-6 flex flex-col gap-5">
          {MANUAL.map((step) => (
            <li key={step.n} className="border-t border-ink pt-4">
              <p className="font-display text-xs tracking-widest text-muted">{step.n}</p>
              <h2 className="font-display text-2xl leading-none tracking-wide">{step.title}</h2>
              <p className="mt-2 text-base leading-snug">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 font-display text-sm tracking-wide text-muted">
          Keys: 1 levee or repair · 2 bags · 3 pump · 4 pull · F overflow · M forecast · Space pause
        </p>
        <button type="button" onClick={onBack} className="mt-6 h-14 bg-scarlet font-display text-2xl tracking-wide text-paper">
          {overlay ? "Back to the map" : "Close the manual"}
        </button>
      </main>
    </div>
  );
}

function Debrief({
  card,
  mission,
  onRetry,
  onNext,
  onDesk,
}: {
  card: Scorecard;
  mission: MissionDef;
  onRetry: () => void;
  onNext: () => void;
  onDesk: () => void;
}) {
  const bad = card.letter === "D" || card.letter === "F" || card.letter === "C";
  return (
    <div className="safe-screen absolute inset-0 z-10 overflow-y-auto bg-paper">
      <div className="mx-auto flex max-w-2xl flex-col px-4 py-6">
        <p className="font-display text-xs tracking-widest text-muted">AFTER-ACTION · {mission.district.toUpperCase()}</p>
        <p className={`mt-2 font-display text-8xl leading-none ${bad ? "text-scarlet" : "text-ink"}`}>{card.letter}</p>
        <h2 className="font-display text-4xl leading-none tracking-wide">{card.title}</h2>
        <div className="mt-4 flex flex-col gap-3 text-lg leading-snug">
          {card.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 font-display text-sm tracking-wide sm:grid-cols-4">
          <Stat k="People dry" v={`${card.popSaved.toLocaleString()} / ${card.popTotal.toLocaleString()}`} />
          <Stat k="Rescued" v={card.rescued ? card.rescued.toLocaleString() : "0"} />
          <Stat k="Peak" v={`${card.peakFeet.toFixed(1)} ft`} />
          <Stat k="Breaches" v={String(card.breaches)} />
          <Stat k="Funds left" v={`$${card.budgetLeft}`} />
        </dl>
        <ul className="mt-4">
          {card.assets.map((a) => (
            <li key={a.label} className="flex justify-between border-b border-paper-2 py-2 font-display text-lg tracking-wide">
              <span>{a.label}</span>
              <span className={a.ok ? "text-ink" : "text-scarlet"}>{a.ok ? "Held" : "Lost"}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onRetry} className="h-12 flex-1 bg-scarlet font-display text-xl tracking-wide text-paper">
            Retry the district
          </button>
          <button type="button" onClick={onNext} className="h-12 flex-1 border border-ink font-display text-xl tracking-wide">
            Next problem
          </button>
          <button type="button" onClick={onDesk} className="h-12 flex-1 border border-ink font-display text-xl tracking-wide">
            Desk
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="border border-ink px-2 py-2">
      <dt className="text-xs tracking-widest text-muted">{k}</dt>
      <dd className="text-lg text-ink">{v}</dd>
    </div>
  );
}

type FightAlert = {
  id: string;
  title: string;
  body: string;
  action: "crew" | "gate";
  label: string;
  x?: number;
  y?: number;
};

function limbLabel(limb: "RISING" | "CREST" | "FALLING" | "STANDBY"): string {
  if (limb === "RISING") return "GOING UP";
  if (limb === "CREST") return "AT THE PEAK";
  if (limb === "FALLING") return "GOING DOWN";
  return "STANDBY";
}

function stormLevel(state: GameState): number {
  if (state.mode === "build") return 0;
  const u = Math.min(1.35, state.t / Math.max(0.001, state.duration));
  const peak = state.hydro.peak;
  if (u <= peak) return 0.12 + 0.88 * (u / Math.max(0.05, peak));
  const down = (u - peak) / Math.max(0.2, 1.15 - peak);
  return Math.max(state.mode === "done" ? 0.1 : 0.12, 1 - down * 0.85);
}

function crewBoundFor(state: GameState, x: number, y: number): boolean {
  return state.crews.some((c) => {
    if (c.stranded > 0) return false;
    if (c.task !== "repair" && c.task !== "sandbag" && c.task !== "move") return false;
    const dest = c.path.length ? c.path[c.path.length - 1] : { x: Math.round(c.x), y: Math.round(c.y) };
    return dest.x === x && dest.y === y;
  });
}

function pickFightAlert(state: GameState, seen: Set<string>): FightAlert | null {
  let worst: { x: number; y: number; label: string; breached: boolean; frac: number } | null = null;
  for (const c of state.cells) {
    if (!c.wall || c.wall.breaking || seen.has(`wall:${c.x},${c.y}`) || crewBoundFor(state, c.x, c.y)) continue;
    const frac = c.wall.maxHp > 0 ? c.wall.hp / c.wall.maxHp : 1;
    if (!c.wall.breached && frac >= 0.45) continue;
    if (!worst || (c.wall.breached ? -1 : frac) < (worst.breached ? -1 : worst.frac)) {
      worst = { x: c.x, y: c.y, label: c.label || "this bank", breached: c.wall.breached, frac };
    }
  }
  if (worst) {
    return {
      id: `wall:${worst.x},${worst.y}`,
      title: worst.breached ? "Levee break" : "Levee is failing",
      body: `${worst.label} needs a crew now.`,
      action: "crew",
      label: "Send a crew",
      x: worst.x,
      y: worst.y,
    };
  }

  for (const c of state.cells) {
    if (!c.pump?.flooded || seen.has(`pump:${c.x},${c.y}`) || crewBoundFor(state, c.x, c.y)) continue;
    return {
      id: `pump:${c.x},${c.y}`,
      title: "Pump is underwater",
      body: `The pump at ${c.label || "this spot"} has drowned. Send a crew to restart it.`,
      action: "crew",
      label: "Send a crew",
      x: c.x,
      y: c.y,
    };
  }

  if (state.hitMajor && !state.spillOpen && state.cells.some((c) => c.spill) && !seen.has("major")) {
    return {
      id: "major",
      title: "High flood",
      body: "The river has reached the high mark. Open the overflow gate into the fields?",
      action: "gate",
      label: "Open the gate",
    };
  }
  return null;
}

function alertResolved(state: GameState, alert: FightAlert): boolean {
  if (alert.action === "gate") return state.spillOpen || !state.hitMajor;
  if (alert.x == null || alert.y == null) return true;
  const cell = cellAt(state, alert.x, alert.y);
  if (!cell) return true;
  if (crewBoundFor(state, alert.x, alert.y)) return true;
  if (alert.id.startsWith("pump:")) return !cell.pump?.flooded;
  if (alert.id.startsWith("wall:")) {
    if (!cell.wall) return true;
    if (cell.wall.breached) return false;
    return cell.wall.hp >= cell.wall.maxHp * 0.45;
  }
  return false;
}

function AlertCard({
  alert,
  onAct,
  onSkip,
}: {
  alert: FightAlert;
  onAct: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-10 border border-ink bg-paper p-2 sm:inset-x-auto sm:right-3 sm:bottom-3 sm:w-72">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-xs tracking-widest text-scarlet">NOW</p>
        <button type="button" onClick={onSkip} className="inline-flex h-11 items-center font-display text-xs tracking-widest text-muted">
          Not now
        </button>
      </div>
      <h2 className="font-display text-xl leading-none tracking-wide">{alert.title}</h2>
      <p className="mt-1 text-sm leading-snug">{alert.body}</p>
      <button type="button" onClick={onAct} className="mt-3 h-12 w-full bg-scarlet font-display text-lg tracking-wide text-paper">
        {alert.label}
      </button>
    </div>
  );
}

