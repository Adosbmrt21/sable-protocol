// SABLE PROTOCOL — Foundry Nine, the map. One original layout: a dusk
// foundry yard with two plant sites (the Furnace in the north, the Vault in
// the south), a mid crossing, two long lanes and short connectors, so every
// round offers at least three routes to each site. The same wall list drives
// three things — the three.js geometry, circle collision for movers, and the
// ray tests for bullets and bot eyes — so what you see is exactly what blocks
// you and what stops a bullet.
//
// Walls are axis-aligned boxes: { x0, z0, x1, z1, h, kind }. kind picks the
// material: 'wall' slate block, 'dark' shadowed block, 'crate' half-height
// wooden cover (1.15 m: blocks movement and crouched bodies, not sightlines
// over it), 'furnace' the hot heart of site A, 'vault' the sealed heart of B.

import * as THREE from 'three';
import { PALETTE } from './config.js';

export const WALLS = [
  // Boundary shell.
  { x0: -32, z0: -24, x1: 32, z1: -22.8, h: 7, kind: 'dark' },
  { x0: -32, z0: 22.8, x1: 32, z1: 24, h: 7, kind: 'dark' },
  { x0: -32, z0: -24, x1: -30.8, z1: 24, h: 7, kind: 'dark' },
  { x0: 30.8, z0: -24, x1: 32, z1: 24, h: 7, kind: 'dark' },

  // West divider: separates the Jackal yard from the lanes. Gaps at the two
  // lanes (z -18..-13 and 13..18) and at mid (z -2.5..2.5).
  { x0: -20, z0: -22.8, x1: -18.8, z1: -18, h: 4.4, kind: 'wall' },
  { x0: -20, z0: -13, x1: -18.8, z1: -2.5, h: 4.4, kind: 'wall' },
  { x0: -20, z0: 2.5, x1: -18.8, z1: 13, h: 4.4, kind: 'wall' },
  { x0: -20, z0: 18, x1: -18.8, z1: 22.8, h: 4.4, kind: 'wall' },

  // North divider between mid and the A side. Gaps: A main (-2..2), A short
  // (6..10), A heaven (18..22, from the Wardens' link into the site).
  { x0: -20, z0: -8.4, x1: -2, z1: -7.2, h: 4.4, kind: 'wall' },
  { x0: 2, z0: -8.4, x1: 6, z1: -7.2, h: 4.4, kind: 'wall' },
  { x0: 10, z0: -8.4, x1: 18, z1: -7.2, h: 4.4, kind: 'wall' },
  { x0: 22, z0: -8.4, x1: 30.8, z1: -7.2, h: 4.4, kind: 'wall' },
  // South divider, mirrored. Gaps: B main, B short, B heaven.
  { x0: -20, z0: 7.2, x1: -2, z1: 8.4, h: 4.4, kind: 'wall' },
  { x0: 2, z0: 7.2, x1: 6, z1: 8.4, h: 4.4, kind: 'wall' },
  { x0: 10, z0: 7.2, x1: 18, z1: 8.4, h: 4.4, kind: 'wall' },
  { x0: 22, z0: 7.2, x1: 30.8, z1: 8.4, h: 4.4, kind: 'wall' },

  // Site west walls: A long leaves the lane into the site through z -17..-13;
  // B tunnels likewise through z 13..17.
  { x0: 13, z0: -22.8, x1: 14.2, z1: -17, h: 4.4, kind: 'wall' },
  { x0: 13, z0: -13, x1: 14.2, z1: -8.4, h: 4.4, kind: 'wall' },
  { x0: 13, z0: 8.4, x1: 14.2, z1: 13, h: 4.4, kind: 'wall' },
  { x0: 13, z0: 17, x1: 14.2, z1: 22.8, h: 4.4, kind: 'wall' },

  // A long house: a block in the north lane that splits it into two paths.
  { x0: -8, z0: -19.5, x1: -2, z1: -15.5, h: 4.2, kind: 'dark' },
  // B tunnels house, mirrored.
  { x0: -8, z0: 15.5, x1: -2, z1: 19.5, h: 4.2, kind: 'dark' },

  // Mid shoulders: pinch the short connectors where they leave mid.
  { x0: 6, z0: -6.5, x1: 10, z1: -3, h: 4.2, kind: 'dark' },
  { x0: 6, z0: 3, x1: 10, z1: 6.5, h: 4.2, kind: 'dark' },
  // Mid block: full cover in the centre of the crossing.
  { x0: -2, z0: -1.8, x1: 3, z1: 1.8, h: 2.2, kind: 'metal' },

  // West yard corners.
  { x0: -26, z0: -12, x1: -22, z1: -9, h: 4.2, kind: 'dark' },
  { x0: -26, z0: 9, x1: -22, z1: 12, h: 4.2, kind: 'dark' },

  // The hearts of the sites: plant cover and the visual anchor of each site.
  { x0: 18.5, z0: -18, x1: 23.5, z1: -15, h: 2.6, kind: 'furnace' },
  { x0: 18.5, z0: 15, x1: 23.5, z1: 18, h: 2.6, kind: 'vault' },

  // Half-height crates: movement cover you can shoot over.
  { x0: 16, z0: -12.5, x1: 17.2, z1: -11.3, h: 1.15, kind: 'crate' },
  { x0: 25, z0: -19.5, x1: 26.2, z1: -18.3, h: 1.15, kind: 'crate' },
  { x0: 24, z0: -10.5, x1: 25.2, z1: -9.3, h: 1.15, kind: 'crate' },
  { x0: 16, z0: 11.3, x1: 17.2, z1: 12.5, h: 1.15, kind: 'crate' },
  { x0: 25, z0: 18.3, x1: 26.2, z1: 19.5, h: 1.15, kind: 'crate' },
  { x0: 24, z0: 9.3, x1: 25.2, z1: 10.5, h: 1.15, kind: 'crate' },
  { x0: -8, z0: -1.2, x1: -6.8, z1: 0, h: 1.15, kind: 'crate' },
  { x0: 8, z0: -0.6, x1: 9.2, z1: 0.6, h: 1.15, kind: 'crate' },
  { x0: -14, z0: -6, x1: -12.8, z1: -4.8, h: 1.15, kind: 'crate' },
  { x0: -14, z0: 4.8, x1: -12.8, z1: 6, h: 1.15, kind: 'crate' },
  { x0: 4, z0: -20.5, x1: 5.2, z1: -19.3, h: 1.15, kind: 'crate' },
  { x0: 4, z0: 19.3, x1: 5.2, z1: 20.5, h: 1.15, kind: 'crate' },
  { x0: -24.5, z0: -1.5, x1: -23.3, z1: -0.3, h: 1.15, kind: 'crate' },
  { x0: 18, z0: -1.2, x1: 19.2, z1: 0, h: 1.15, kind: 'crate' },
];

export const SITES = [
  { id: 'A', name: 'Furnace', x: 21, z: -13.5, r: 5.2, color: PALETTE.siteA },
  { id: 'B', name: 'Vault', x: 21, z: 13.5, r: 5.2, color: PALETTE.siteB },
];

export const SPAWNS = {
  jackal: [
    { x: -28, z: -3 }, { x: -28, z: 0 }, { x: -28, z: 3 }, { x: -26, z: -1.5 }, { x: -26, z: 1.5 },
  ],
  warden: [
    { x: 28, z: -3 }, { x: 28, z: 0 }, { x: 28, z: 3 }, { x: 26, z: -1.5 }, { x: 26, z: 1.5 },
  ],
};

// Waypoint graph: bots travel only along these edges, so their routes are
// readable and tactical — lanes, connectors and site holds, never wandering.
export const WAYPOINTS = [
  { id: 'jSpawn', x: -27, z: 0 },
  { id: 'yardN', x: -24, z: -8 },
  { id: 'yardS', x: -24, z: 8 },
  { id: 'westMid', x: -16, z: 0 },
  { id: 'aLongIn', x: -16, z: -15.5 },
  { id: 'aLongMid', x: -11, z: -16.5 },
  { id: 'aLongHouseN', x: -5, z: -20.9 },
  { id: 'aLongHouseS', x: -5, z: -13.6 },
  { id: 'aLongOut', x: 8, z: -15 },
  { id: 'aSiteIn', x: 15.5, z: -15 },
  { id: 'aSite', x: 21, z: -11.8 },
  { id: 'aSiteBack', x: 26.5, z: -19.5 },
  { id: 'aHeaven', x: 20, z: -6 },
  { id: 'aMain', x: 0, z: -9.8 },
  { id: 'aMainIn', x: 0, z: -5.5 },
  { id: 'aShort', x: 8, z: -9.8 },
  { id: 'aShortIn', x: 8, z: -5.8 },
  { id: 'aLobby', x: 11, z: -11 },
  { id: 'midW', x: -10, z: 0 },
  { id: 'midN', x: 0.5, z: -4.6 },
  { id: 'midS', x: 0.5, z: 4.6 },
  { id: 'midE', x: 5.5, z: 0 },
  { id: 'link', x: 20, z: 0 },
  { id: 'wSpawn', x: 27, z: 0 },
  { id: 'bHeaven', x: 20, z: 6 },
  { id: 'bSite', x: 21, z: 11.8 },
  { id: 'bSiteBack', x: 26.5, z: 19.5 },
  { id: 'bSiteIn', x: 15.5, z: 15 },
  { id: 'bLobby', x: 11, z: 11 },
  { id: 'bShort', x: 8, z: 9.8 },
  { id: 'bShortIn', x: 8, z: 5.8 },
  { id: 'bMain', x: 0, z: 9.8 },
  { id: 'bMainIn', x: 0, z: 5.5 },
  { id: 'bTunOut', x: 8, z: 15 },
  { id: 'bTunHouseS', x: -5, z: 13.6 },
  { id: 'bTunHouseN', x: -5, z: 20.9 },
  { id: 'bTunMid', x: -11, z: 16.5 },
  { id: 'bTunIn', x: -16, z: 15.5 },
];
export const WP_INDEX = new Map(WAYPOINTS.map((w, i) => [w.id, i]));
export const WP_EDGES = [
  ['jSpawn', 'yardN'], ['jSpawn', 'yardS'], ['jSpawn', 'westMid'],
  ['yardN', 'aLongIn'], ['yardN', 'westMid'],
  ['yardS', 'bTunIn'], ['yardS', 'westMid'],
  ['westMid', 'midW'],
  ['aLongIn', 'aLongMid'],
  ['aLongMid', 'aLongHouseN'], ['aLongMid', 'aLongHouseS'],
  ['aLongHouseN', 'aLongOut'], ['aLongHouseS', 'aLongOut'],
  ['aLongOut', 'aSiteIn'], ['aLongOut', 'aLobby'],
  ['aSiteIn', 'aSite'], ['aSiteIn', 'aLobby'],
  ['aSite', 'aSiteBack'], ['aSite', 'aHeaven'],
  ['aHeaven', 'link'],
  ['aMain', 'aMainIn'], ['aMain', 'aLobby'],
  ['aMainIn', 'midN'],
  ['aShort', 'aShortIn'], ['aShort', 'aLobby'],
  ['aShortIn', 'midE'],
  ['aLobby', 'aSiteIn'],
  ['midW', 'midN'], ['midW', 'midS'],
  ['midN', 'midE'], ['midS', 'midE'],
  ['midN', 'aMainIn'], ['midS', 'bMainIn'],
  ['midE', 'link'],
  ['link', 'wSpawn'], ['link', 'bHeaven'], ['link', 'aHeaven'],
  ['bHeaven', 'bSite'],
  ['bSite', 'bSiteBack'], ['bSite', 'bSiteIn'],
  ['bSiteIn', 'bLobby'], ['bSiteIn', 'bTunOut'],
  ['bLobby', 'bShort'], ['bLobby', 'bTunOut'],
  ['bShort', 'bShortIn'], ['bShortIn', 'midE'],
  ['bMain', 'bMainIn'], ['bMain', 'bLobby'],
  ['bTunOut', 'bTunHouseS'], ['bTunOut', 'bTunHouseN'],
  ['bTunHouseS', 'bTunMid'], ['bTunHouseN', 'bTunMid'],
  ['bTunMid', 'bTunIn'],
];
export const WP_GRAPH = WAYPOINTS.map(() => []);
for (const [a, b] of WP_EDGES) {
  const ia = WP_INDEX.get(a);
  const ib = WP_INDEX.get(b);
  WP_GRAPH[ia].push(ib);
  WP_GRAPH[ib].push(ia);
}

// A* over the waypoint graph. Returns an array of waypoint indices from the
// nearest node to `from` to the nearest node to `to`, or null.
export function findPath(from, to) {
  const start = nearestWaypoint(from.x, from.z);
  const goal = nearestWaypoint(to.x, to.z);
  if (start === goal) return [start];
  const open = [start];
  const came = new Map([[start, -1]]);
  const cost = new Map([[start, 0]]);
  const goalPos = WAYPOINTS[goal];
  const h = (i) => Math.hypot(WAYPOINTS[i].x - goalPos.x, WAYPOINTS[i].z - goalPos.z);
  const score = new Map([[start, h(start)]]);
  const closed = new Set();
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (score.get(open[i]) < score.get(open[best])) best = i;
    const cur = open.splice(best, 1)[0];
    if (cur === goal) {
      const path = [];
      let n = cur;
      while (n !== -1) { path.push(n); n = came.get(n); }
      return path.reverse();
    }
    closed.add(cur);
    for (const next of WP_GRAPH[cur]) {
      if (closed.has(next)) continue;
      const step = Math.hypot(WAYPOINTS[next].x - WAYPOINTS[cur].x, WAYPOINTS[next].z - WAYPOINTS[cur].z);
      const c = cost.get(cur) + step;
      if (c < (cost.get(next) ?? Infinity)) {
        cost.set(next, c);
        came.set(next, cur);
        score.set(next, c + h(next));
        if (!open.includes(next)) open.push(next);
      }
    }
  }
  return null;
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Circle-vs-walls collision on the ground plane. Mutates pos ({x,z}) so the
// circle of the given radius no longer overlaps any wall footprint. Walls of
// every height block movement: a 1.15 m crate is cover, not a step.
export function collideCircle(pos, radius) {
  for (let iter = 0; iter < 2; iter++) {
    for (const w of WALLS) {
      const nx = Math.max(w.x0, Math.min(pos.x, w.x1));
      const nz = Math.max(w.z0, Math.min(pos.z, w.z1));
      let dx = pos.x - nx;
      let dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const left = pos.x - w.x0;
        const right = w.x1 - pos.x;
        const top = pos.z - w.z0;
        const bottom = w.z1 - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = w.x0 - radius;
        else if (m === right) pos.x = w.x1 + radius;
        else if (m === top) pos.z = w.z0 - radius;
        else pos.z = w.z1 + radius;
        dx = 0; dz = 0;
      }
    }
  }
}

// Ray vs every wall box (3D: a wall stands from y=0 to y=h), slab test.
// Returns the nearest hit distance along dir, or Infinity when nothing is
// hit within maxDist. Used for bullets and sightlines alike.
export function rayHitWall(origin, dir, maxDist) {
  let best = Infinity;
  for (const w of WALLS) {
    let t0 = 0;
    let t1 = best === Infinity ? maxDist : best;
    let ok = true;
    const o = [origin.x, origin.y, origin.z];
    const d = [dir.x, dir.y, dir.z];
    const lo = [w.x0, 0, w.z0];
    const hi = [w.x1, w.h, w.z1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; }
      } else {
        let ta = (lo[a] - o[a]) / d[a];
        let tb = (hi[a] - o[a]) / d[a];
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok && t0 < best && t0 <= maxDist) best = t0;
  }
  return best;
}

export function lineOfSight(ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  const origin = { x: ax, y: ay, z: az };
  return rayHitWall(origin, dir, dist) >= dist - 0.05;
}

// ---------------------------------------------------------------------------
// Geometry. Built once from the same WALLS list: floors, walls with trim,
// site markers, the furnace's glow, distant foundry silhouettes and lights.
// ---------------------------------------------------------------------------

function canvasTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 70, 175);

  // A gradient sky dome: deep blue overhead melting to a pale horizon.
  const skyTex = canvasTexture((g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#4f97d4');
    grad.addColorStop(0.55, '#9cc8ec');
    grad.addColorStop(1, '#eaf4fc');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }, 32, 256);
  skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 24, 14),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(PALETTE.lightCool, 0x3a3128, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.lightWarm, 1.9);
  sun.position.set(-30, 42, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(PALETTE.lightCool, 0.35);
  fill.position.set(24, 20, 30);
  scene.add(fill);

  // Ground: warm sand-concrete on a one-metre baseplate grid, tiled.
  const groundTex = canvasTexture((g, w, h) => {
    g.fillStyle = '#b59a6b';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
      g.fillRect(Math.random() * w, Math.random() * h, 2.5, 2.5);
    }
    g.strokeStyle = 'rgba(70,56,36,0.28)';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo((w / 4) * i, 0); g.lineTo((w / 4) * i, h); g.stroke();
      g.beginPath(); g.moveTo(0, (h / 4) * i); g.lineTo(w, (h / 4) * i); g.stroke();
    }
  });
  groundTex.repeat.set(16, 12);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 48),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Near-white detail textures: the palette colour tints them, so walls read
  // as seamed, riveted panels and crates as framed planks instead of flat
  // blocks — the geometry and UVs stay exactly as they were.
  const panelTex = canvasTexture((g, w, h) => {
    g.fillStyle = '#d8dde2';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
      g.fillRect(Math.random() * w, Math.random() * h, 2.5, 2.5);
    }
    g.strokeStyle = 'rgba(28,34,42,0.55)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    g.fillStyle = 'rgba(28,34,42,0.5)';
    for (const [x, y] of [[15, 15], [w - 15, 15], [15, h - 15], [w - 15, h - 15]]) {
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
  });
  const crateTex = canvasTexture((g, w, h) => {
    g.fillStyle = '#dec49c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(90,64,30,0.06)' : 'rgba(255,255,255,0.05)';
      g.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    }
    g.strokeStyle = 'rgba(90,64,30,0.7)';
    g.lineWidth = 12;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.lineWidth = 3;
    for (const y of [h * 0.37, h * 0.63]) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
  });
  const mats = {
    wall: new THREE.MeshStandardMaterial({ map: panelTex, color: PALETTE.wall, roughness: 0.7, metalness: 0.08 }),
    dark: new THREE.MeshStandardMaterial({ map: panelTex, color: PALETTE.wallDark, roughness: 0.75, metalness: 0.08 }),
    crate: new THREE.MeshStandardMaterial({ map: crateTex, color: PALETTE.crate, roughness: 0.8, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ map: panelTex, color: PALETTE.metal, roughness: 0.4, metalness: 0.5 }),
    furnace: new THREE.MeshStandardMaterial({ color: 0x5d4a3a, roughness: 0.6, metalness: 0.4, emissive: 0xd95f1e, emissiveIntensity: 0.55 }),
    vault: new THREE.MeshStandardMaterial({ color: 0x39585c, roughness: 0.4, metalness: 0.65, emissive: 0x1e6f6a, emissiveIntensity: 0.4 }),
  };
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.trim, roughness: 0.7, metalness: 0.2 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  for (const w of WALLS) {
    const sx = w.x1 - w.x0;
    const sz = w.z1 - w.z0;
    const mesh = new THREE.Mesh(boxGeo, mats[w.kind] || mats.wall);
    mesh.scale.set(sx, w.h, sz);
    mesh.position.set(w.x0 + sx / 2, w.h / 2, w.z0 + sz / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // A rust trim line along the top of full-height walls reads as structure.
    if (w.h > 2) {
      const trim = new THREE.Mesh(boxGeo, trimMat);
      trim.scale.set(sx + 0.06, 0.14, sz + 0.06);
      trim.position.set(mesh.position.x, w.h - 0.07, mesh.position.z);
      scene.add(trim);
    }
  }

  // Site markers: a painted ring, a soft disc and a floating letter.
  for (const site of SITES) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 40),
      new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    scene.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(site.r - 0.35, 40),
      new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.13, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(site.x, 0.015, site.z);
    scene.add(disc);
    const letterTex = canvasTexture((g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.font = 'bold 150px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(site.id, w / 2, h / 2 + 6);
    }, 192, 192);
    letterTex.wrapS = letterTex.wrapT = THREE.ClampToEdgeWrapping;
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: letterTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    letter.position.set(site.x, 3.4, site.z);
    scene.add(letter);
    scene.userData['letter' + site.id] = letter;
    const beacon = new THREE.PointLight(site.color, 12, 16, 1.8);
    beacon.position.set(site.x, 3.2, site.z);
    scene.add(beacon);
  }

  // Distant foundry silhouettes outside the shell, for a horizon.
  const silMat = new THREE.MeshBasicMaterial({ color: 0x232a33 });
  const silhouettes = [
    [-40, -34, 6, 26], [-18, -36, 4, 19], [8, -35, 5, 23], [30, -34, 7, 17],
    [-38, 30, 5, 15], [16, 34, 6, 21], [38, 26, 4, 26], [-42, 2, 5, 18], [42, -6, 6, 14],
  ];
  for (const [x, z, r, hgt] of silhouettes) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.32, r * 0.4, hgt, 10), silMat);
    cyl.position.set(x, hgt / 2, z);
    scene.add(cyl);
  }
  return { sun };
}
