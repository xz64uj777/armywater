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
  const fxRef = useRef<Fx>({ phase: 0, trauma: 0, shake: true, hover: null, floaters: [], model: null, marks: [] });
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
          fx.trauma = Math.min(1, fx.trauma + 0.62);
          audioRef.current?.breach();
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
    setStatus(state.paused ? "Clock is held. Read the card, then run the river." : "Flood fight is live. Watch the gauge.");
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
    }
    const hover = relief.move(e.pointerId, e.clientX, e.clientY);
    if (hover && cellAt(state, hover.x, hover.y)) {
      fxRef.current.hover = hover;
      setHoverText(describe(state, hover.x, hover.y));
      if (e.buttons > 0 && !lookRef.current && relief.fingers() < 2) tryPlace(hover.x, hover.y);
    }
  }

  function onMapUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const relief = reliefRef.current;
    const state = stateRef.current;
    if (!relief || !state) return;
    const hit = relief.end(e.pointerId, e.clientX, e.clientY);
    if (!hit || !cellAt(state, hit.x, hit.y)) return;
    tryPlace(hit.x, hit.y);
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
        <div className="flex h-dvh flex-col overflow-hidden">
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
            <p className="pointer-events-none absolute left-2 top-2 z-10 bg-paper/90 px-2 py-1 font-display text-xs tracking-widest text-muted">
              {look ? "DRAG TO LOOK · TAP TO BUILD" : "DRAG TO BUILD · TWO FINGERS TO LOOK"}
            </p>
            <button
              type="button"
              className={`absolute right-24 top-2 z-10 h-9 border border-ink px-3 font-display text-sm tracking-wide ${look ? "bg-ink text-paper" : "bg-paper"}`}
              onClick={() => {
                const next = !look;
                lookRef.current = next;
                setLook(next);
              }}
            >
              {look ? "Look" : "Draw"}
            </button>
            <button
              type="button"
              className="absolute right-2 top-2 z-10 h-9 border border-ink bg-paper px-3 font-display text-sm tracking-wide"
              onClick={() => reliefRef.current?.frame()}
            >
              Frame
            </button>
            {model && (
              <p className="pointer-events-none absolute inset-x-3 top-2 bg-paper px-2 py-1 font-display text-sm tracking-wide text-ink">
                {model.summary}
              </p>
            )}
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
          </div>
          <footer className="shrink-0 border-t border-ink px-3 py-2">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate font-display text-sm tracking-wide text-muted">{hoverText || status}</p>
              <button type="button" className="shrink-0 font-display text-sm tracking-widest" onClick={openPlayManual}>
                Manual
              </button>
              <button
                type="button"
                className="shrink-0 font-display text-sm tracking-widest"
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
                  {assumeSpill ? "Model: gate opens" : "Model: gate shut"}
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
                    {state.spillOpen ? "Gate open" : "Floodway"}
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
                Model
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
  }
  if (c.pump) bits.push(c.pump.flooded ? "pump flooded" : "pump running");
  if (c.kind === "river") bits.push(`stage ${c.water.toFixed(1)} m`);
  else if (c.water > 0.05) bits.push(`${c.water.toFixed(2)} m on the ground`);
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
          Civil ${Math.round(state.budget)} · Reserve ${Math.round(state.reserve)}
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
          <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${majorAt}%` }} title="Major stage" />
        </div>
      </div>
      <div className="text-right">
        <p className="font-display text-xl leading-none">{state.mode === "build" ? "PLAN" : clockLabel(state)}</p>
        <p className="font-display text-sm tracking-widest text-scarlet">{state.mode === "fight" ? limb : mission.hazard.toUpperCase()}</p>
        <button type="button" className="mt-1 text-ink" aria-label={mute ? "Unmute" : "Mute"} onClick={onMute}>
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
    <main className="mx-auto grid min-h-dvh w-full max-w-6xl content-center gap-8 px-4 py-6 lg:grid-cols-2 lg:items-center lg:px-8">
      <div>
        <div className="flex items-center justify-between">
          <p className="font-display text-xs tracking-widest text-muted">DISTRICT ENGINEER · FIELD PROBLEM</p>
          <button type="button" aria-label={mute ? "Unmute" : "Mute"} onClick={onMute} className="p-2">
            {mute ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
        </div>
        <Mark className="mt-6 h-12 w-16 text-ink" />
        <h1 className="mt-3 font-display text-6xl leading-none tracking-wide sm:text-7xl">HOLD THE RIVER</h1>
        <p className="mt-4 max-w-xl text-lg leading-snug">
          You have a civil-works budget, two engineer sections, and a river that is already out of its banks. Build the line before the crest. Then fight it.
        </p>
        <p className="mt-4 max-w-xl border-l-2 border-scarlet pl-3 text-base leading-snug">
          Levees on the bank. A pump in the bowl. The floodway is a decision, not a decoration.
        </p>
        <button type="button" onClick={onManual} className="mt-5 h-12 border border-ink px-4 font-display text-lg tracking-wide">
          How to fight
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
            ? "Lower crest. A shorter line holds, and the floodway stays shut."
            : "Full crest. Oxbow and Port Amity fail unless the floodway runs across the peak."}
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
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-6">
      <button type="button" onClick={onBack} className="self-start font-display text-sm tracking-widest text-muted">
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
          ? "Easy freshet. The crest is lower, and the walkthrough stakes the short line."
          : "Hard crest. The walkthrough stakes the line that holds this storm, including the floodway where the crest requires it."}
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
        Civil works ${mission.budget} · Flood-fight reserve ${mission.reserve} · Levee ${COSTS.levee} · Sandbags ${COSTS.sandbag} · Pump ${COSTS.pump}
      </p>
      <button type="button" onClick={onManual} className="mt-6 h-12 border border-ink font-display text-lg tracking-wide">
        How to fight
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
    title: "Two clocks",
    body: "Open a district. A hand points at one cell. Tap it, then the next. Skip if you already know the line. Civil-works money only spends before Begin flood fight.",
  },
  {
    n: "02",
    title: "Where a levee goes",
    body: `Select Levee ($${COSTS.levee}) and tap a bank cell between the river and the town, lock, or hospital. On Millford the first banks pulse red. Sandbags ($${COSTS.sandbag}) are shorter. They blow out on a real crest. Save them for a high guide wall, not the town bank.`,
  },
  {
    n: "03",
    title: "The bowl needs a pump",
    body: `A levee stops the river and traps the rain. Select Pump ($${COSTS.pump}) and tap inside the town, the hospital, or the lock. One pump can drain a connected pair of town cells. Pull refunds a mistake back into the civil budget.`,
  },
  {
    n: "04",
    title: "Ask the model",
    body: "Model runs your current line through the storm. Model: gate opens assumes you open the floodway across the crest. If it names a town, a lock, or a hospital, change the plan before you start.",
  },
  {
    n: "05",
    title: "During the fight",
    body: `Watch the gauge. The scarlet tick is flood stage. The black tick is major. Repair sends the nearest section to a breach or a drowned pump. Bags ($${COSTS.emergency} from the reserve) throws an emergency line on an empty bank. They need a dry route. Hold pauses. 2× runs the clock faster.`,
  },
  {
    n: "06",
    title: "The floodway",
    body: "The gate dumps the river into the lower fields. Open it when the gauge goes major, and shut it once the limb says FALLING. Leave it open the whole fight and the grade drops. On Millford a built line should not need it. On Oxbow and Port Amity, a shut gate lets the crest over the levees.",
  },
  {
    n: "07",
    title: "The grade",
    body: "A means the critical works stayed dry and you did not waste the basin. B means you held, but the fields or a gate left open too long paid for it. Losing the town, the lock, or the hospital is C, D, or F. Grades stay on the desk.",
  },
];

function Manual({ onBack, overlay }: { onBack: () => void; overlay?: boolean }) {
  return (
    <div className={overlay ? "absolute inset-0 z-20 overflow-y-auto bg-paper" : "min-h-dvh overflow-y-auto bg-paper"}>
      <main className="mx-auto flex max-w-2xl flex-col px-4 py-6">
        <button type="button" onClick={onBack} className="self-start font-display text-sm tracking-widest text-muted">
          {overlay ? "← Back to the map" : "← Back"}
        </button>
        <p className="mt-6 font-display text-xs tracking-widest text-scarlet">FIELD MANUAL</p>
        <h1 className="mt-1 font-display text-5xl leading-none tracking-wide">HOW TO FIGHT</h1>
        <p className="mt-4 text-lg leading-snug">
          You are the district engineer. The river does not care about the budget. The grade cares about who stayed dry.
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
          Keys: 1 levee or repair · 2 bags · 3 pump · 4 pull · F floodway · M model · Space pause
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
    <div className="absolute inset-0 z-10 overflow-y-auto bg-paper">
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
          <Stat k="Crest" v={`${card.peakFeet.toFixed(1)} ft`} />
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
