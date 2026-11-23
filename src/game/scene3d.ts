import * as THREE from "three";
import type { Fx } from "./draw";
import type { Cell, GameState } from "./sim";

const PAPER = 0xd9c7a4;
const INK = 0x1b2418;
const SCARLET = 0x9d1c1c;

const KIND: Record<string, number> = {
  high: 0xcbb98a,
  upland: 0xd2c29a,
  river: 0x5ea4c4,
  bank: 0xd7c4a0,
  road: 0xb7a37a,
  town: 0xefe4cc,
  hospital: 0xf4f0e4,
  lock: 0xc5cbbf,
  farm: 0xc6a84a,
  wetland: 0x6f9174,
  basin: 0xcfc3a4,
  depot: 0x8f9a78,
};

type Parcel = {
  cell: Cell;
  y: number;
  water: THREE.Mesh;
  wall: THREE.Mesh;
  pump: THREE.Group;
  pad: THREE.Mesh;
};

function cornerHeight(state: GameState, ix: number, iz: number): number {
  let h = 0;
  let n = 0;
  let river = false;
  for (const dx of [-1, 0]) {
    for (const dz of [-1, 0]) {
      const x = ix + dx;
      const z = iz + dz;
      if (x < 0 || z < 0 || x >= state.cols || z >= state.rows) continue;
      const cell = state.cells[z * state.cols + x];
      if (cell.kind === "river") river = true;
      h += groundHeight(cell);
      n++;
    }
  }
  if (!n) return 0.2;
  if (river) return -0.32;
  return h / n;
}

function centerHeight(state: GameState, cell: Cell): number {
  return (
    cornerHeight(state, cell.x, cell.y) +
    cornerHeight(state, cell.x + 1, cell.y) +
    cornerHeight(state, cell.x, cell.y + 1) +
    cornerHeight(state, cell.x + 1, cell.y + 1)
  ) / 4;
}

function bermGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.16, 0);
  shape.lineTo(0, 1);
  shape.lineTo(0.16, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.92, bevelEnabled: false });
  geo.translate(0, 0, -0.46);
  return geo;
}

type Pointer = { x: number; y: number; sx: number; sy: number; moved: boolean };

function groundHeight(cell: Cell): number {
  if (cell.kind === "river") return -0.32;
  const capped = Math.min(cell.elev, 1.9);
  return 0.22 + capped * 0.14;
}

function waterLine(cell: Cell): number | null {
  if (cell.kind === "river") {
    const t = Math.max(0, Math.min(1, (cell.water - 0.35) / 2.6));
    return -0.14 + t * 0.44;
  }
  if (cell.water < 0.05) return null;
  return groundHeight(cell) + Math.min(0.12, 0.03 + cell.water * 0.05);
}

function labelSprite(cell: Cell): THREE.Sprite | null {
  if (!cell.label) return null;
  if (cell.kind !== "town" && cell.kind !== "hospital" && cell.kind !== "lock" && cell.kind !== "depot") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(228,213,184,0.94)";
  ctx.fillRect(6, 16, 500, 64);
  ctx.strokeStyle = "#1b2418";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 16, 500, 64);
  ctx.fillStyle = "#1b2418";
  ctx.font = "700 42px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cell.label.toUpperCase(), 256, 48);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.45, 0.28, 1);
  sprite.position.set(cell.x + 0.5, groundHeight(cell) + 0.72, cell.y + 0.5);
  return sprite;
}

function wallFacing(state: GameState, cell: Cell): number {
  const at = (x: number, y: number) => state.cells.find((c) => c.x === x && c.y === y)?.kind === "river";
  if (at(cell.x, cell.y - 1) || at(cell.x, cell.y + 1)) return Math.PI / 2;
  return 0;
}

function paperTex(rows: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.CanvasTexture(canvas);
  g.fillStyle = "#f2f2f2";
  g.fillRect(0, 0, 128, 128);
  if (rows) {
    g.strokeStyle = "rgba(70,60,30,0.28)";
    g.lineWidth = 2;
    for (let y = 10; y < 128; y += 18) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y + 2);
      g.stroke();
    }
  }
  for (let i = 0; i < 90; i++) {
    const n = 150 + Math.floor(Math.random() * 80);
    g.fillStyle = `rgba(${n},${n - 8},${n - 16},0.45)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function waterTex(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.CanvasTexture(canvas);
  g.fillStyle = "#e7f4f8";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const y = 8 + i * 18;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(30, y - 6, 70, y + 6, 128, y - 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class Relief {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private parcels: Parcel[] = [];
  private crews: THREE.Mesh[] = [];
  private marker: THREE.Group;
  private ghost: THREE.Group;
  private builtFor = "";
  private pointers = new Map<number, Pointer>();
  private pinch: number | null = null;
  private orbitDrag = true;
  private azimuth = 0.7;
  private polar = 0.62;
  private distance = 14;
  private span = 12;
  private target = new THREE.Vector3();
  private extras: THREE.Object3D[] = [];
  private terrain: THREE.Mesh | null = null;
  private waterMesh: THREE.Mesh | null = null;
  private bed: Float32Array = new Float32Array(0);
  private cols = 1;
  private rows = 1;
  private landTex: THREE.CanvasTexture;
  private fieldTex: THREE.CanvasTexture;
  private ripple: THREE.CanvasTexture;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(PAPER, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.landTex = paperTex(false);
    this.fieldTex = paperTex(true);
    this.ripple = waterTex();
    this.scene.fog = new THREE.Fog(PAPER, 22, 48);

    const hemi = new THREE.HemisphereLight(0xf4efe4, 0x8a7048, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4df, 1.35);
    sun.position.set(8, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0008;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xd5e2ee, 0.4);
    fill.position.set(-8, 6, -5);
    this.scene.add(fill);

    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0xcbb892, roughness: 1 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.04;
    table.receiveShadow = true;
    this.scene.add(table);

    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.05, 8, 28),
      new THREE.MeshStandardMaterial({ color: SCARLET, emissive: SCARLET, emissiveIntensity: 0.55, roughness: 0.4 }),
    );
    ring.rotation.x = Math.PI / 2;
    const finger = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.48, 8),
      new THREE.MeshStandardMaterial({ color: 0xf7f1e4, roughness: 0.55 }),
    );
    finger.rotation.x = Math.PI;
    finger.position.y = 0.62;
    this.marker.add(ring, finger);
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.ghost = new THREE.Group();
    const ghostBerm = new THREE.Mesh(
      bermGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xb3873e, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    ghostBerm.name = "berm";
    const ghostPump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.26, 8),
      new THREE.MeshStandardMaterial({ color: 0x2f3b34, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    ghostPump.name = "pump";
    ghostPump.position.y = 0.13;
    this.ghost.add(ghostBerm, ghostPump);
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    for (let i = 0; i < 2; i++) {
      const crew = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.12, 0.32, 6),
        new THREE.MeshStandardMaterial({ color: 0x243024, roughness: 0.7 }),
      );
      crew.castShadow = true;
      crew.visible = false;
      this.crews.push(crew);
      this.scene.add(crew);
    }
  }

  resize(w: number, h: number, dpr: number) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(2, dpr));
    this.renderer.setSize(w, h, false);
  }

  frame() {
    this.azimuth = 0.7;
    this.polar = 0.62;
    this.distance = this.span * 1.55;
  }

  setDragOrbit(on: boolean) {
    this.orbitDrag = on;
  }

  zoom(delta: number) {
    this.distance = THREE.MathUtils.clamp(this.distance + delta * 0.01, 8, 42);
  }

  begin(id: number, x: number, y: number) {
    this.pointers.set(id, { x, y, sx: x, sy: y, moved: false });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  move(id: number, x: number, y: number): { x: number; y: number } | null {
    const p = this.pointers.get(id);
    if (!p) return this.pick(x, y);
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (Math.hypot(x - p.sx, y - p.sy) > 8) p.moved = true;
    if (this.pointers.size >= 2) {
      if (this.pinch) {
        const pts = [...this.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.distance = THREE.MathUtils.clamp(this.distance * (this.pinch / Math.max(8, dist)), 8, 42);
        this.pinch = dist;
      }
      this.azimuth -= dx * 0.008;
      this.polar = THREE.MathUtils.clamp(this.polar + dy * 0.006, 0.35, 1.2);
      return null;
    }
    if (this.orbitDrag && p.moved) {
      this.azimuth -= dx * 0.008;
      this.polar = THREE.MathUtils.clamp(this.polar + dy * 0.006, 0.35, 1.2);
      return null;
    }
    return this.pick(x, y);
  }

  end(id: number, x: number, y: number): { x: number; y: number } | null {
    const p = this.pointers.get(id);
    this.pointers.delete(id);
    if (this.pointers.size < 2) this.pinch = null;
    if (!p || p.moved) return null;
    if (Math.hypot(x - p.sx, y - p.sy) > 10) return null;
    return this.pick(x, y);
  }

  fingers() {
    return this.pointers.size;
  }

  private pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.terrain ? this.ray.intersectObject(this.terrain, false) : [];
    const point = hits[0]?.point;
    if (!point) return null;
    const x = Math.min(this.cols - 1, Math.max(0, Math.floor(point.x)));
    const y = Math.min(this.rows - 1, Math.max(0, Math.floor(point.z)));
    return { x, y };
  }

  private ensure(state: GameState) {
    if (this.builtFor === state.missionId && this.parcels.length === state.cells.length) return;
    for (const parcel of this.parcels) this.scene.remove(parcel.water, parcel.wall, parcel.pump, parcel.pad);
    for (const extra of this.extras) this.scene.remove(extra);
    if (this.terrain) this.scene.remove(this.terrain);
    if (this.waterMesh) this.scene.remove(this.waterMesh);
    this.extras = [];
    this.parcels = [];
    this.cols = state.cols;
    this.rows = state.rows;

    const sub = 4;
    const geo = new THREE.PlaneGeometry(state.cols, state.rows, state.cols * sub, state.rows * sub);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cw = state.cols + 1;
    const ch = new Float32Array(cw * (state.rows + 1));
    const cr = new Float32Array(ch.length);
    const cg = new Float32Array(ch.length);
    const cb = new Float32Array(ch.length);
    const tint = new THREE.Color();
    for (let iz = 0; iz <= state.rows; iz++) {
      for (let ix = 0; ix <= state.cols; ix++) {
        const k = iz * cw + ix;
        ch[k] = cornerHeight(state, ix, iz);
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        let river = false;
        for (const dx of [-1, 0]) {
          for (const dz of [-1, 0]) {
            const x = ix + dx;
            const z = iz + dz;
            if (x < 0 || z < 0 || x >= state.cols || z >= state.rows) continue;
            const kind = state.cells[z * state.cols + x].kind;
            if (kind === "river") river = true;
            tint.set(KIND[kind] ?? 0xe4d5b8);
            r += tint.r;
            g += tint.g;
            b += tint.b;
            n++;
          }
        }
        cr[k] = n ? r / n : 0.9;
        cg[k] = n ? g / n : 0.84;
        cb[k] = n ? b / n : 0.72;
        if (river) {
          cr[k] = cr[k] * 0.2 + 0.1;
          cg[k] = cg[k] * 0.2 + 0.42;
          cb[k] = cb[k] * 0.2 + 0.58;
        }
      }
    }
    const at = (ix: number, iz: number) => {
      const x = Math.max(0, Math.min(state.cols, ix));
      const z = Math.max(0, Math.min(state.rows, iz));
      return z * cw + x;
    };
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + state.cols / 2;
      const wz = pos.getZ(i) + state.rows / 2;
      const x0 = Math.max(0, Math.min(state.cols - 1, Math.floor(wx)));
      const z0 = Math.max(0, Math.min(state.rows - 1, Math.floor(wz)));
      const tx = Math.max(0, Math.min(1, wx - x0));
      const tz = Math.max(0, Math.min(1, wz - z0));
      const i00 = at(x0, z0);
      const i10 = at(x0 + 1, z0);
      const i01 = at(x0, z0 + 1);
      const i11 = at(x0 + 1, z0 + 1);
      const w00 = (1 - tx) * (1 - tz);
      const w10 = tx * (1 - tz);
      const w01 = (1 - tx) * tz;
      const w11 = tx * tz;
      pos.setY(i, ch[i00] * w00 + ch[i10] * w10 + ch[i01] * w01 + ch[i11] * w11);
      colors[i * 3] = cr[i00] * w00 + cr[i10] * w10 + cr[i01] * w01 + cr[i11] * w11;
      colors[i * 3 + 1] = cg[i00] * w00 + cg[i10] * w10 + cg[i01] * w01 + cg[i11] * w11;
      colors[i * 3 + 2] = cb[i00] * w00 + cb[i10] * w10 + cb[i01] * w01 + cb[i11] * w11;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.landTex.repeat.set(state.cols / 3, state.rows / 3);
    this.terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, map: this.landTex, roughness: 0.92 }),
    );
    this.terrain.position.set(state.cols / 2, 0, state.rows / 2);
    this.terrain.receiveShadow = true;
    this.terrain.castShadow = true;
    this.scene.add(this.terrain);
    this.bed = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) this.bed[i] = pos.getY(i);
    const waterGeo = new THREE.PlaneGeometry(state.cols, state.rows, state.cols * sub, state.rows * sub);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    this.waterMesh = new THREE.Mesh(
      waterGeo,
      new THREE.MeshStandardMaterial({
        color: 0x8ec8de,
        vertexColors: true,
        transparent: true,
        opacity: 0.96,
        roughness: 0.22,
        metalness: 0.02,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    this.waterMesh.position.copy(this.terrain.position);
    this.waterMesh.renderOrder = 2;
    this.ripple.repeat.set(state.cols * 0.7, state.rows * 0.7);
    this.scene.add(this.waterMesh);

    const sheet = new THREE.PlaneGeometry(0.92, 0.92);
    sheet.rotateX(-Math.PI / 2);
    const berm = bermGeometry();
    const padGeo = new THREE.RingGeometry(0.4, 0.46, 24);
    padGeo.rotateX(-Math.PI / 2);
    for (const cell of state.cells) {
      const y = centerHeight(state, cell);
      const water = new THREE.Mesh(
        sheet,
        new THREE.MeshStandardMaterial({
          color: cell.kind === "river" ? 0x3d86a8 : 0x1e5c7a,
          map: this.ripple,
          transparent: true,
          opacity: cell.kind === "river" ? 0.72 : 0.5,
          roughness: 0.15,
          depthWrite: false,
        }),
      );
      water.position.set(cell.x + 0.5, y + 0.03, cell.y + 0.5);
      water.visible = false;
      const wall = new THREE.Mesh(berm, new THREE.MeshStandardMaterial({ color: 0xb3873e, roughness: 0.75 }));
      wall.castShadow = true;
      wall.position.set(cell.x + 0.5, y, cell.y + 0.5);
      wall.visible = false;
      const pump = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 0.22, 8),
        new THREE.MeshStandardMaterial({ color: 0x2f3b34, roughness: 0.6 }),
      );
      const fan = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8),
        new THREE.MeshStandardMaterial({ color: 0xd7e2cf, roughness: 0.4 }),
      );
      fan.position.y = 0.14;
      pump.add(body, fan);
      pump.visible = false;
      pump.position.set(cell.x + 0.72, y, cell.y + 0.72);
      const pad = new THREE.Mesh(
        padGeo,
        new THREE.MeshBasicMaterial({ color: SCARLET, transparent: true, opacity: 0.9, depthWrite: false }),
      );
      pad.position.set(cell.x + 0.5, y + 0.04, cell.y + 0.5);
      pad.visible = false;
      this.scene.add(water, wall, pump, pad);
      this.addStructures(cell, y);
      const label = labelSprite(cell);
      if (label) {
        label.position.y = y + 0.7;
        this.extras.push(label);
        this.scene.add(label);
      }
      this.parcels.push({ cell, y, water, wall, pump, pad });
    }
    this.target.set(state.cols / 2, 0.2, state.rows / 2);
    this.span = Math.max(state.cols, state.rows);
    this.distance = this.span * 1.55;
    this.builtFor = state.missionId;
  }

  private addStructures(cell: Cell, y: number) {
    const x = cell.x + 0.5;
    const z = cell.y + 0.5;
    if (cell.kind === "town") {
      this.solid(x - 0.16, y + 0.16, z - 0.06, new THREE.CylinderGeometry(0.13, 0.15, 0.32, 6), 0x9d1c1c);
      this.solid(x - 0.16, y + 0.4, z - 0.06, new THREE.ConeGeometry(0.18, 0.18, 6), 0x6e1414);
      this.solid(x + 0.16, y + 0.2, z + 0.08, new THREE.CylinderGeometry(0.11, 0.13, 0.4, 6), 0x7d1818);
      this.solid(x + 0.16, y + 0.48, z + 0.08, new THREE.ConeGeometry(0.16, 0.16, 6), 0x5c1010);
    } else if (cell.kind === "hospital") {
      this.solid(x, y + 0.16, z, new THREE.CylinderGeometry(0.22, 0.24, 0.32, 8), 0xf7f4ea);
      this.solid(x, y + 0.4, z, new THREE.ConeGeometry(0.26, 0.16, 8), 0xe7e0d0);
      this.solid(x, y + 0.52, z, new THREE.BoxGeometry(0.06, 0.16, 0.06), SCARLET);
      this.solid(x, y + 0.56, z, new THREE.BoxGeometry(0.16, 0.05, 0.05), SCARLET);
    } else if (cell.kind === "lock") {
      const drum = new THREE.CylinderGeometry(0.16, 0.16, 0.7, 8);
      drum.rotateX(Math.PI / 2);
      this.solid(x, y + 0.16, z, drum, 0x5c6560);
    } else if (cell.kind === "depot") {
      this.solid(x, y + 0.16, z, new THREE.CylinderGeometry(0.22, 0.24, 0.32, 8), 0x5c4030);
      this.solid(x, y + 0.38, z, new THREE.ConeGeometry(0.28, 0.14, 8), SCARLET);
    } else if (cell.bridge) {
      const deck = new THREE.BoxGeometry(0.96, 0.05, 0.22);
      this.solid(x, y + 0.06, z, deck, 0x8d6840);
    }
  }

  private solid(x: number, y: number, z: number, geometry: THREE.BufferGeometry, color: number) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.extras.push(mesh);
    this.scene.add(mesh);
  }

  private raiseWater(state: GameState, phase: number) {
    if (!this.waterMesh) return;
    const pos = this.waterMesh.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.waterMesh.geometry.attributes.color as THREE.BufferAttribute;
    const lineAt = (x: number, z: number) => {
      if (x < 0 || z < 0 || x >= state.cols || z >= state.rows) return null;
      return waterLine(state.cells[z * state.cols + x]);
    };
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + state.cols / 2;
      const wz = pos.getZ(i) + state.rows / 2;
      const x0 = Math.max(0, Math.min(state.cols - 1, Math.floor(wx)));
      const z0 = Math.max(0, Math.min(state.rows - 1, Math.floor(wz)));
      const tx = Math.max(0, Math.min(1, wx - x0));
      const tz = Math.max(0, Math.min(1, wz - z0));
      const samples: [number, number, number][] = [
        [x0, z0, (1 - tx) * (1 - tz)],
        [x0 + 1, z0, tx * (1 - tz)],
        [x0, z0 + 1, (1 - tx) * tz],
        [x0 + 1, z0 + 1, tx * tz],
      ];
      let h = 0;
      let w = 0;
      for (const [x, z, weight] of samples) {
        const line = lineAt(x, z);
        if (line == null || weight <= 0) continue;
        h += line * weight;
        w += weight;
      }
      const bed = this.bed[i] ?? 0;
      if (w < 0.02) {
        pos.setY(i, bed - 0.4);
        col.setXYZ(i, 0.1, 0.3, 0.45);
        continue;
      }
      const surface = h / w;
      const bedCap = bed < 0.08 ? 0.3 : bed + 0.12;
      const ripple = Math.sin(phase * 1.7 + wx * 2.4 + wz * 1.3) * 0.008;
      const y = Math.min(surface, bedCap) + ripple;
      pos.setY(i, y);
      const depth = Math.max(0, y - bed);
      const wave = 0.5 + 0.5 * Math.sin(phase * 1.5 + wx * 2.6 + wz * 1.7);
      const deep = Math.max(0, Math.min(1, depth / 0.42));
      const foam = depth < 0.045 ? 1 - depth / 0.045 : 0;
      const r = 0.02 + (1 - deep) * 0.16 + foam * 0.55 + wave * 0.03;
      const g = 0.16 + (1 - deep) * 0.28 + foam * 0.32 + wave * 0.04;
      const b = 0.28 + (1 - deep) * 0.34 + foam * 0.12 + wave * 0.05;
      col.setXYZ(i, r, g, b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.waterMesh.geometry.computeVertexNormals();
  }

  sync(state: GameState, fx: Fx) {
    this.ensure(state);
    this.ripple.offset.x = fx.phase * 0.03;
    this.ripple.offset.y = Math.sin(fx.phase * 0.4) * 0.02;
    this.raiseWater(state, fx.phase);
    const marked = new Set(fx.marks.map((m) => `${m.x},${m.y}`));
    const single = fx.marks.length === 1 ? fx.marks[0] : null;
    for (const parcel of this.parcels) {
      const cell = state.cells[parcel.cell.y * state.cols + parcel.cell.x];
      if (!cell) continue;
      const y = parcel.y;
      const hovered = fx.hover?.x === cell.x && fx.hover?.y === cell.y;
      const isMark = marked.has(`${cell.x},${cell.y}`);
      parcel.pad.visible = Boolean(hovered || (isMark && !single) || cell.failed);
      (parcel.pad.material as THREE.MeshBasicMaterial).color.set(cell.failed || isMark ? SCARLET : INK);
      parcel.water.visible = false;
      if (cell.wall && !cell.wall.breached) {
        const h = cell.wall.kind === "levee" ? 0.38 : 0.18;
        parcel.wall.visible = true;
        parcel.wall.scale.y = h;
        parcel.wall.position.y = y;
        parcel.wall.rotation.y = wallFacing(state, cell);
        const wallMat = parcel.wall.material as THREE.MeshStandardMaterial;
        wallMat.color.set(cell.wall.kind === "levee" ? 0xb3873e : 0xcbb88a);
        wallMat.emissive.set(cell.wall.hp < cell.wall.maxHp * 0.75 ? SCARLET : 0x000000);
      } else if (cell.wall?.breached) {
        parcel.wall.visible = true;
        parcel.wall.scale.y = 0.08;
        parcel.wall.position.y = y;
        parcel.wall.rotation.y = wallFacing(state, cell);
        (parcel.wall.material as THREE.MeshStandardMaterial).color.set(0x1a4a64);
      } else {
        parcel.wall.visible = false;
      }
      parcel.pump.visible = Boolean(cell.pump);
      parcel.pump.position.y = y;
      if (cell.pump) {
        const fan = parcel.pump.children[1];
        if (!cell.pump.flooded) fan.rotation.y = fx.phase * 6;
        const bodyMat = (parcel.pump.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
        bodyMat.color.set(cell.pump.flooded ? 0x5c4038 : 0x2f3b34);
      }
    }

    if (single) {
      const cell = state.cells[single.y * state.cols + single.x];
      const parcel = this.parcels[single.y * state.cols + single.x];
      const top = (parcel?.y ?? 0.3) + (cell?.wall && !cell.wall.breached ? 0.38 : 0);
      const bob = fx.shake ? Math.sin(fx.phase * 5) * 0.06 : 0;
      this.marker.visible = true;
      this.marker.position.set(single.x + 0.5, top + 0.5 + bob, single.y + 0.5);
    } else {
      this.marker.visible = false;
    }

    this.crews.forEach((mesh, i) => {
      const crew = state.crews[i];
      if (!crew) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const gx = Math.round(crew.x);
      const gy = Math.round(crew.y);
      const under = this.parcels[gy * state.cols + gx];
      const y = under?.y ?? 0.2;
      mesh.position.set(crew.x + 0.5, y + 0.2, crew.y + 0.5);
      mesh.rotation.y = fx.phase * 0.4 + crew.id;
    });

    const hover = fx.hover;
    const tool = fx.tool;
    const showGhost = Boolean(hover && (tool === "levee" || tool === "sandbag" || tool === "pump"));
    this.ghost.visible = false;
    if (showGhost && hover) {
      const cell = state.cells[hover.y * state.cols + hover.x];
      const parcel = this.parcels[hover.y * state.cols + hover.x];
      if (cell && parcel && cell.kind !== "river" && cell.kind !== "high" && cell.kind !== "upland") {
        this.ghost.visible = true;
        this.ghost.position.set(hover.x + 0.5, parcel.y, hover.y + 0.5);
        const berm = this.ghost.getObjectByName("berm") as THREE.Mesh;
        const pump = this.ghost.getObjectByName("pump") as THREE.Mesh;
        berm.visible = tool !== "pump";
        pump.visible = tool === "pump";
        if (berm.visible) {
          berm.scale.y = tool === "levee" ? 0.38 : 0.18;
          berm.rotation.y = wallFacing(state, cell);
        }
      }
    }

    const dist = this.distance;
    this.camera.position.set(
      this.target.x + dist * Math.sin(this.polar) * Math.sin(this.azimuth),
      this.target.y + dist * Math.cos(this.polar),
      this.target.z + dist * Math.sin(this.polar) * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
    if (fx.trauma > 0 && fx.shake) {
      this.camera.position.x += Math.sin(fx.phase * 40) * fx.trauma * 0.08 * this.span;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.pointers.clear();
  }
}
