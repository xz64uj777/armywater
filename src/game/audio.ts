export function createAudio() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let rainGain: GainNode | null = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    rainGain = ctx.createGain();
    sfx.connect(master);
    rainGain.connect(master);
    master.connect(ctx.destination);
    master.gain.value = 0.85;
    rainGain.gain.value = 0;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.985 * b0 + 0.015 * w;
      b1 = 0.97 * b1 + 0.03 * b0;
      b2 = 0.95 * b2 + 0.05 * b1;
      data[i] = b2 * 2.6;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(rainGain);
    src.start();
    return ctx;
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0) {
    if (!ctx || !sfx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    o.type = type;
    o.frequency.value = freq * (0.97 + Math.random() * 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.03);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  return {
    unlock() {
      const c = ensure();
      if (c.state === "suspended") void c.resume();
    },
    setMuted(v: boolean) {
      muted = v;
      if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 0.85, ctx.currentTime, 0.04);
    },
    setRain(on: boolean) {
      if (!rainGain || !ctx) return;
      rainGain.gain.setTargetAtTime(on && !muted ? 0.16 : 0, ctx.currentTime, 0.25);
    },
    ui() {
      tone(640, 0.05, "square", 0.03);
    },
    place() {
      tone(120, 0.14, "sine", 0.11);
      tone(78, 0.2, "triangle", 0.07);
    },
    breach() {
      tone(196, 0.35, "sawtooth", 0.05);
      tone(132, 0.5, "square", 0.035, 0.06);
    },
    win() {
      tone(392, 0.16, "sine", 0.06);
      tone(523, 0.28, "sine", 0.06, 0.14);
      tone(659, 0.34, "triangle", 0.04, 0.28);
    },
    fail() {
      tone(98, 0.55, "triangle", 0.08);
    },
  };
}

export type AudioBus = ReturnType<typeof createAudio>;
