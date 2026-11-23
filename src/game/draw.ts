import { cellAt, type Cell, type GameState } from "./sim";

export interface View {
  cell: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
}

export interface Fx {
  phase: number;
  trauma: number;
  shake: boolean;
  hover: { x: number; y: number } | null;
  floaters: Floater[];
  model: number[] | null;
  marks: { x: number; y: number }[];
  tool?: string;
  /** 0 = clear, 1 = darkest at the peak of the flood. Visual only. */
  storm?: number;
  rain?: boolean;
  breach?: { x: number; y: number; id: number } | null;
  pumpDrag?: { x: number; y: number } | null;
  helm?: "boat" | "truck" | null;
}

const INK = "#1b2418";
const PAPER = "#e4d5b8";
const SCARLET = "#9d1c1c";

export function computeView(w: number, h: number, cols: number, rows: number): View {
  const cell = Math.min((w - 20) / cols, (h - 20) / rows);
  const gw = cell * cols;
  const gh = cell * rows;
  return { cell, ox: (w - gw) / 2, oy: (h - gh) / 2, w, h };
}

function riverPaint(depth: number): string {
  const t = Math.max(0, Math.min(1, depth / 4.2));
  const r = Math.round(94 - t * 70);
  const g = Math.round(164 - t * 110);
  const b = Math.round(196 - t * 120);
  return `rgb(${r},${g},${b})`;
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, gap: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, s, s);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = -s; i < s * 2; i += gap) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + s, y + s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain(ctx: CanvasRenderingContext2D, c: Cell, x: number, y: number, s: number, phase: number) {
  switch (c.kind) {
    case "high":
      ctx.fillStyle = "#cbb98a";
      ctx.fillRect(x, y, s, s);
      hatch(ctx, x, y, s, "rgba(90,78,48,0.18)", 7);
      break;
    case "upland":
      ctx.fillStyle = "#d2c29a";
      ctx.fillRect(x, y, s, s);
      hatch(ctx, x, y, s, "rgba(90,110,70,0.16)", 6);
      break;
    case "river": {
      ctx.fillStyle = riverPaint(c.water);
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = "rgba(231,242,246,0.45)";
      ctx.lineWidth = Math.max(1, s * 0.04);
      const o = (phase * 36) % s;
      for (let i = 0; i < 3; i++) {
        const yy = y + ((o + (i * s) / 3) % s);
        ctx.beginPath();
        ctx.moveTo(x + s * 0.18, yy);
        ctx.lineTo(x + s * 0.82, yy);
        ctx.stroke();
      }
      if (c.bridge) {
        ctx.fillStyle = "#8d6840";
        ctx.fillRect(x, y + s * 0.32, s, s * 0.36);
        ctx.strokeStyle = "#3d2a16";
        ctx.strokeRect(x + 1, y + s * 0.32, s - 2, s * 0.36);
        ctx.strokeStyle = "#e7d7b0";
        ctx.beginPath();
        ctx.moveTo(x + 4, y + s * 0.5);
        ctx.lineTo(x + s - 4, y + s * 0.5);
        ctx.stroke();
      }
      break;
    }
    case "bank":
    case "road":
      ctx.fillStyle = c.kind === "road" ? "#b7a37a" : "#d7c4a0";
      ctx.fillRect(x, y, s, s);
      break;
    case "town":
      ctx.fillStyle = "#efe4cc";
      ctx.fillRect(x, y, s, s);
      drawBlocks(ctx, x, y, s, false);
      break;
    case "hospital":
      ctx.fillStyle = "#f4f0e4";
      ctx.fillRect(x, y, s, s);
      drawBlocks(ctx, x, y, s, true);
      break;
    case "lock":
      ctx.fillStyle = "#c5cbbf";
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = "#5c6560";
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.strokeRect(x + s * 0.22, y + s * 0.18, s * 0.56, s * 0.64);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.22, y + s * 0.4);
      ctx.lineTo(x + s * 0.5, y + s * 0.55);
      ctx.lineTo(x + s * 0.78, y + s * 0.4);
      ctx.stroke();
      break;
    case "farm":
      ctx.fillStyle = "#c6a84a";
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = "rgba(90,70,20,0.45)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 3, y + (s * i) / 5);
        ctx.lineTo(x + s - 3, y + (s * i) / 5);
        ctx.stroke();
      }
      break;
    case "wetland":
      ctx.fillStyle = "#6f9174";
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = "rgba(20,40,28,0.45)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const px = x + s * (0.2 + (i % 3) * 0.22);
        const py = y + s * (0.25 + (i % 2) * 0.35);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py - s * 0.22);
        ctx.stroke();
      }
      break;
    case "basin":
      ctx.fillStyle = c.water > 0.2 ? "#3d7c98" : "#cfc3a4";
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.strokeRect(x + s * 0.28, y + s * 0.2, s * 0.44, s * 0.6);
      break;
    case "depot":
      ctx.fillStyle = "#8f9a78";
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = "#5c4030";
      ctx.fillRect(x + s * 0.18, y + s * 0.38, s * 0.64, s * 0.36);
      ctx.fillStyle = "#9d1c1c";
      ctx.fillRect(x + s * 0.18, y + s * 0.28, s * 0.64, s * 0.12);
      break;
    default:
      ctx.fillStyle = PAPER;
      ctx.fillRect(x, y, s, s);
  }
}

function drawBlocks(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, hospital: boolean) {
  const colors = hospital ? ["#f7f4ea"] : ["#9d1c1c", "#7d1818", "#b08968"];
  const blocks: [number, number, number, number][] = [
    [0.16, 0.22, 0.28, 0.34],
    [0.5, 0.18, 0.3, 0.4],
    [0.22, 0.58, 0.24, 0.26],
    [0.52, 0.6, 0.28, 0.24],
  ];
  blocks.forEach((b, i) => {
    if (hospital && i > 1) return;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x + s * b[0], y + s * b[1], s * b[2], s * b[3]);
    ctx.strokeStyle = "rgba(27,36,24,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + s * b[0], y + s * b[1], s * b[2], s * b[3]);
  });
  if (hospital) {
    ctx.strokeStyle = SCARLET;
    ctx.lineWidth = Math.max(2, s * 0.06);
    const cx = x + s * 0.5;
    const cy = y + s * 0.48;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.16);
    ctx.lineTo(cx, cy + s * 0.16);
    ctx.moveTo(cx - s * 0.12, cy);
    ctx.lineTo(cx + s * 0.12, cy);
    ctx.stroke();
  }
}

function drawWall(ctx: CanvasRenderingContext2D, c: Cell, x: number, y: number, s: number) {
  const wall = c.wall;
  if (!wall) return;
  if (wall.breached) {
    ctx.fillStyle = "rgba(14, 40, 58, 0.55)";
    ctx.fillRect(x + s * 0.08, y + s * 0.2, s * 0.84, s * 0.6);
    ctx.strokeStyle = "#f2fbff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.15, y + s * 0.7);
    ctx.lineTo(x + s * 0.4, y + s * 0.35);
    ctx.lineTo(x + s * 0.62, y + s * 0.62);
    ctx.lineTo(x + s * 0.86, y + s * 0.28);
    ctx.stroke();
    return;
  }
  if (wall.kind === "levee") {
    ctx.fillStyle = "#b3873e";
    ctx.beginPath();
    ctx.moveTo(x + s * 0.08, y + s * 0.78);
    ctx.lineTo(x + s * 0.92, y + s * 0.78);
    ctx.lineTo(x + s * 0.74, y + s * 0.28);
    ctx.lineTo(x + s * 0.26, y + s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#6e5224";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "#ead7a2";
    ctx.beginPath();
    ctx.moveTo(x + s * 0.3, y + s * 0.34);
    ctx.lineTo(x + s * 0.7, y + s * 0.34);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#cbb88a";
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const shift = (row % 2) * s * 0.08;
        round(ctx, x + s * 0.12 + col * s * 0.24 + shift, y + s * 0.22 + row * s * 0.18, s * 0.22, s * 0.14, 2);
        ctx.fill();
        ctx.strokeStyle = "#6d5a32";
        ctx.stroke();
      }
    }
  }
  if (wall.hp < wall.maxHp * 0.75) {
    ctx.strokeStyle = "rgba(80, 30, 20, 0.8)";
    ctx.beginPath();
    ctx.moveTo(x + s * 0.35, y + s * 0.3);
    ctx.lineTo(x + s * 0.48, y + s * 0.55);
    ctx.lineTo(x + s * 0.4, y + s * 0.72);
    ctx.stroke();
  }
}

function drawPump(ctx: CanvasRenderingContext2D, c: Cell, x: number, y: number, s: number, phase: number) {
  if (!c.pump) return;
  const px = x + s * 0.62;
  const py = y + s * 0.58;
  ctx.fillStyle = c.pump.flooded ? "#5c4038" : "#2f3b34";
  ctx.fillRect(px, py, s * 0.28, s * 0.26);
  ctx.strokeStyle = c.pump.flooded ? SCARLET : "#d7e2cf";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px + s * 0.14, py - s * 0.02, s * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  if (!c.pump.flooded) {
    ctx.save();
    ctx.translate(px + s * 0.14, py - s * 0.02);
    ctx.rotate(phase * 6);
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, 0);
    ctx.lineTo(s * 0.08, 0);
    ctx.moveTo(0, -s * 0.08);
    ctx.lineTo(0, s * 0.08);
    ctx.stroke();
    ctx.restore();
  }
}

function labelFor(c: Cell, cell: number): string {
  if (!c.label || c.kind === "bank" || c.kind === "basin") return "";
  if (cell < 46 && c.kind !== "town" && c.kind !== "hospital" && c.kind !== "lock" && c.kind !== "depot") return "";
  return c.label;
}

function drawTapHand(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  cell: number,
  gx: number,
  gy: number,
  phase: number,
  motion: boolean,
) {
  const bob = motion ? Math.sin(phase * 5) * Math.max(3, cell * 0.06) : 0;
  const tipX = ox + (gx + 0.5) * cell;
  const tipY = oy + (gy + 0.78) * cell + bob;
  const s = Math.max(0.42, Math.min(0.85, cell / 88));

  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.scale(s, s);
  ctx.translate(0, -4);
  ctx.fillStyle = "#f7f1e4";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(27,36,24,0.5)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  round(ctx, -11, -58, 22, 58, 11);
  ctx.fill();
  ctx.stroke();
  round(ctx, -26, -98, 56, 46, 16);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(-24, -66);
  ctx.rotate(-0.7);
  round(ctx, -9, -4, 20, 30, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = SCARLET;
  round(ctx, -6, -16, 12, 10, 3);
  ctx.fill();
  ctx.restore();

  ctx.save();
  const font = Math.max(16, cell * 0.28);
  ctx.font = `700 ${font}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const label = "TAP";
  ctx.fillStyle = PAPER;
  ctx.strokeStyle = SCARLET;
  ctx.lineWidth = 3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(label).width;
  const chipW = tw + 14;
  const chipH = font + 6;
  const lx = ox + (gx + 0.5) * cell - chipW / 2;
  const ly = oy + gy * cell + 4;
  ctx.fillRect(lx, ly, chipW, chipH);
  ctx.strokeRect(lx, ly, chipW, chipH);
  ctx.fillStyle = SCARLET;
  ctx.fillText(label, lx + chipW / 2, ly + chipH / 2 + 1);
  ctx.restore();
}

export function drawMap(ctx: CanvasRenderingContext2D, state: GameState, view: View, fx: Fx, dpr: number) {
  const { cell, ox, oy, w, h } = view;
  const shake = fx.shake ? fx.trauma * fx.trauma : 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#d9c7a4";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(Math.sin(fx.phase * 41) * 7 * shake, Math.cos(fx.phase * 37) * 5 * shake);

  for (const c of state.cells) {
    drawTerrain(ctx, c, ox + c.x * cell, oy + c.y * cell, cell, fx.phase);
  }

  ctx.strokeStyle = "rgba(27,36,24,0.18)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= state.cols; x++) {
    ctx.beginPath();
    ctx.moveTo(ox + x * cell, oy);
    ctx.lineTo(ox + x * cell, oy + state.rows * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= state.rows; y++) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + y * cell);
    ctx.lineTo(ox + state.cols * cell, oy + y * cell);
    ctx.stroke();
  }

  for (const c of state.cells) {
    const x = ox + c.x * cell;
    const y = oy + c.y * cell;
    if (c.kind !== "river" && c.water > 0.04) {
      const a = Math.min(0.72, 0.18 + c.water / 2.4);
      ctx.fillStyle = `rgba(18, 74, 108, ${a})`;
      ctx.fillRect(x, y, cell, cell);
    }
    drawWall(ctx, c, x, y, cell);
    drawPump(ctx, c, x, y, cell, fx.phase);
    if (c.failed) {
      ctx.strokeStyle = SCARLET;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 6);
      ctx.lineTo(x + cell - 6, y + cell - 6);
      ctx.moveTo(x + cell - 6, y + 6);
      ctx.lineTo(x + 6, y + cell - 6);
      ctx.stroke();
    }
    const text = labelFor(c, cell);
    if (text) {
      ctx.fillStyle = c.kind === "wetland" || (c.kind !== "river" && c.water > 0.45) ? "#f4fbff" : INK;
      ctx.font = `600 ${Math.max(9, cell * 0.16)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(text.toUpperCase(), x + cell / 2, y + cell - 3);
    }
    if (fx.model && fx.model[c.y * state.cols + c.x] > 0.34 && c.kind !== "river" && c.kind !== "high" && c.kind !== "depot") {
      ctx.fillStyle = "rgba(30, 92, 122, 0.38)";
      ctx.fillRect(x, y, cell, cell);
    }
  }

  const built = state.cells.filter((c) => c.wall).length;
  if (fx.marks.length === 0 && state.missionId === "millford" && state.mode === "build" && built < 2) {
    const alpha = 0.35 + 0.35 * Math.sin(fx.phase * 3);
    ctx.strokeStyle = `rgba(157, 28, 28, ${alpha})`;
    ctx.lineWidth = 2;
    for (const c of state.cells) {
      if (c.kind !== "bank" || c.wall) continue;
      const n = cellAt(state, c.x - 1, c.y);
      const e = cellAt(state, c.x + 1, c.y);
      if (n?.kind !== "river" && e?.kind !== "river") continue;
      ctx.strokeRect(ox + c.x * cell + 2, oy + c.y * cell + 2, cell - 4, cell - 4);
    }
  }

  if (fx.marks.length === 1) {
    const m = fx.marks[0];
    const pulse = 0.28 + (fx.shake ? 0.16 * Math.sin(fx.phase * 4) : 0);
    ctx.fillStyle = `rgba(157, 28, 28, ${pulse})`;
    ctx.fillRect(ox + m.x * cell, oy + m.y * cell, cell, cell);
    ctx.strokeStyle = SCARLET;
    ctx.lineWidth = Math.max(4, cell * 0.1);
    ctx.strokeRect(ox + m.x * cell + 3, oy + m.y * cell + 3, cell - 6, cell - 6);
    drawTapHand(ctx, ox, oy, cell, m.x, m.y, fx.phase, fx.shake);
  } else if (fx.marks.length > 0) {
    const alpha = 0.45 + 0.4 * Math.sin(fx.phase * 3);
    ctx.strokeStyle = `rgba(157, 28, 28, ${alpha})`;
    ctx.lineWidth = 3;
    for (const m of fx.marks) {
      ctx.strokeRect(ox + m.x * cell + 2, oy + m.y * cell + 2, cell - 4, cell - 4);
    }
  }

  if (state.spillOpen) {
    ctx.fillStyle = "rgba(231,242,246,0.35)";
    for (const c of state.cells) {
      if (!c.spill) continue;
      const x = ox + c.x * cell;
      const y = oy + c.y * cell;
      const wave = Math.sin(fx.phase * 8 + c.x) * 3;
      ctx.fillRect(x + 4, y + cell * 0.45 + wave, cell - 8, 3);
    }
  }

  for (const crew of state.crews) {
    if (crew.path.length && crew.task === "move") {
      ctx.strokeStyle = "rgba(27,36,24,0.7)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ox + (crew.x + 0.5) * cell, oy + (crew.y + 0.5) * cell);
      for (const p of crew.path) ctx.lineTo(ox + (p.x + 0.5) * cell, oy + (p.y + 0.5) * cell);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const cx = ox + (crew.x + 0.5) * cell;
    const cy = oy + (crew.y + 0.5) * cell;
    const bob = crew.stranded > 0 ? 0 : Math.sin(fx.phase * 6 + crew.id) * 1.5;
    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = crew.stranded > 0 ? "#7a6248" : "#243024";
    const d = Math.max(8, cell * 0.18);
    ctx.fillRect(-d / 2, -d / 2, d, d);
    ctx.restore();
    ctx.fillStyle = PAPER;
    ctx.font = `700 ${Math.max(9, cell * 0.16)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(crew.id), cx, cy + bob);
  }

  if (fx.hover) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + fx.hover.x * cell + 1.5, oy + fx.hover.y * cell + 1.5, cell - 3, cell - 3);
  }

  for (const f of fx.floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = INK;
    ctx.font = `700 ${Math.max(12, cell * 0.22)}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(f.text, ox + f.x * cell, oy + f.y * cell);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = INK;
  ctx.font = `600 ${Math.max(11, cell * 0.2)}px "Barlow Condensed", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("N", ox + 4, oy + 2);
  ctx.beginPath();
  ctx.moveTo(ox + 10, oy + 16);
  ctx.lineTo(ox + 10, oy + 28);
  ctx.moveTo(ox + 7, oy + 20);
  ctx.lineTo(ox + 10, oy + 16);
  ctx.lineTo(ox + 13, oy + 20);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  const shade = ctx.createLinearGradient(0, 0, 0, 18);
  shade.addColorStop(0, "rgba(80,60,30,0.18)");
  shade.addColorStop(1, "rgba(80,60,30,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, 18);
}
