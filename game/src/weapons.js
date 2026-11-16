// GOBLOK OPENFIRE — weapons and combat. Hitscan gunfire resolved against the
// map's wall boxes and two body spheres per actor (head and chest), so a
// headshot is a place, not a dice roll. Spread grows with movement and with
// sustained fire; standing still and tapping is the accurate way to shoot,
// which is the whole tactical point. Grenades are physical: they arc, bounce
// off walls, then pop — the shard hurts through a radius, the flash blinds
// whoever is looking at it.

import * as THREE from 'three';
import { WEAPONS, BODY } from './config.js';
import { rayHitWall, WALLS } from './map.js';
import { sfx } from './audio.js';

export function makeLoadout() {
  return {
    current: 'kestrel',
    owned: { kestrel: { mag: WEAPONS.kestrel.mag, reserve: WEAPONS.kestrel.reserve } },
    grenades: { flash: 0, shard: 0 },
    armor: false,
    cooldown: 0,
    reloading: 0,
    bloom: 0,
    scoped: false,
    triggerHeld: false,
  };
}

export function giveWeapon(loadout, key) {
  const def = WEAPONS[key];
  loadout.owned[key] = { mag: def.mag, reserve: def.mag * 4 };
  if (def.slot === 2 || loadout.current === 'kestrel') loadout.current = key;
}

export function currentDef(loadout) {
  return WEAPONS[loadout.current];
}

// Eye position of an actor (feet position + eye height by stance).
export function eyeOf(actor, out) {
  const eye = actor.crouch ? BODY.crouchEye : BODY.standEye;
  return out.set(actor.pos.x, actor.pos.y + eye, actor.pos.z);
}

const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _to = new THREE.Vector3();

// Resolve one hitscan shot. Returns { kind: 'wall'|'head'|'body'|'none',
// target, dist } and calls game.fx for tracer/impact and game.onDamage.
export function fireHitscan(game, shooter, dir, spreadScale = 1) {
  const loadout = shooter.loadout;
  const def = currentDef(loadout);
  eyeOf(shooter, _origin);
  _dir.copy(dir);
  // Cone of inaccuracy: base spread + bloom from sustained fire + a heavy
  // penalty for moving or being airborne. Crouching tightens it.
  const speed = Math.hypot(shooter.vel.x, shooter.vel.z);
  const moveFactor = Math.min(1, speed / BODY.walkSpeed);
  let spread = (def.spread + loadout.bloom + def.moveSpread * moveFactor) * spreadScale;
  if (shooter.crouch) spread *= 0.72;
  if (shooter.pos.y > 0.02) spread *= 2.1;
  if (spread > 0.0004) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spread;
    const up = Math.abs(_dir.y) > 0.93 ? _to.set(1, 0, 0) : _to.set(0, 1, 0);
    const tx = new THREE.Vector3().crossVectors(_dir, up).normalize();
    const ty = new THREE.Vector3().crossVectors(tx, _dir).normalize();
    _dir.addScaledVector(tx, Math.cos(a) * r).addScaledVector(ty, Math.sin(a) * r).normalize();
  }

  const wallDist = rayHitWall(_origin, _dir, def.range);
  let bestT = wallDist;
  let hitActor = null;
  let hitPart = null;
  for (const other of game.actors) {
    if (other === shooter || !other.alive || other.team === shooter.team) continue;
    const headT = raySphere(_origin, _dir, other.pos.x, other.pos.y + BODY.headY, other.pos.z, BODY.headR);
    const chestT = raySphere(_origin, _dir, other.pos.x, other.pos.y + BODY.chestY, other.pos.z, BODY.chestR * (other.crouch ? 0.92 : 1));
    let t = Infinity;
    let part = null;
    if (headT !== null && headT < t) { t = headT; part = 'head'; }
    if (chestT !== null && chestT < t) { t = chestT; part = 'body'; }
    if (t < bestT) { bestT = t; hitActor = other; hitPart = part; }
  }

  const end = _origin.clone().addScaledVector(_dir, Math.min(bestT, def.range));
  game.fx.tracer(_origin, end, shooter.team);
  if (hitActor) {
    const falloff = bestT <= 12 ? 1 : Math.max(def.falloff, 1 - (bestT - 12) / def.range * (1 - def.falloff));
    let dmg = def.damage * falloff * (hitPart === 'head' ? def.headMult : 1);
    if (hitActor.loadout.armor && hitPart !== 'head') dmg *= 0.55;
    game.fx.hitSpark(end, hitPart === 'head');
    game.onDamage(shooter, hitActor, dmg, hitPart === 'head');
    return { kind: hitPart, target: hitActor, dist: bestT };
  }
  if (wallDist < Infinity) {
    game.fx.impact(end);
    return { kind: 'wall', dist: wallDist };
  }
  return { kind: 'none', dist: def.range };
}

function raySphere(origin, dir, cx, cy, cz, r) {
  const ox = cx - origin.x;
  const oy = cy - origin.y;
  const oz = cz - origin.z;
  const tca = ox * dir.x + oy * dir.y + oz * dir.z;
  if (tca < 0) return null;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return null;
  return tca - Math.sqrt(r2 - d2);
}

// One trigger step for an actor whose fire control says shoot. Handles
// cadence, magazine, reload prompting and recoil bloom. `wantFire` is the
// trigger state; semi-automatics need a fresh press (actor.triggerEdge).
export function stepWeapon(game, actor, dt, wantFire) {
  const loadout = actor.loadout;
  const def = currentDef(loadout);
  const state = loadout.owned[loadout.current];
  loadout.cooldown -= dt;
  loadout.bloom = Math.max(0, loadout.bloom - dt * 0.055);
  if (loadout.reloading > 0) {
    loadout.reloading -= dt;
    if (loadout.reloading <= 0) {
      const need = def.mag - state.mag;
      const take = Math.min(need, state.reserve);
      state.mag += take;
      state.reserve -= take;
      if (actor.isPlayer) sfx.reloadEnd();
    }
    return;
  }
  const trigger = def.auto ? wantFire : (wantFire && actor.triggerEdge);
  if (!trigger || loadout.cooldown > 0) return;
  if (state.mag <= 0) {
    if (actor.triggerEdge && actor.isPlayer) sfx.dryFire();
    loadout.cooldown = 0.28;
    startReload(game, actor);
    return;
  }
  state.mag -= 1;
  loadout.cooldown = 60 / def.rpm;
  loadout.bloom = Math.min(0.09, loadout.bloom + def.recoil);
  actor.lastShotAt = game.time;
  actor.muzzle = 0.05;
  const dir = actor.aimDir(_dir);
  fireHitscan(game, actor, dir, actor.isPlayer ? 1 : actor.aimSpread);
  sfx.shot(loadout.current, actor.pos, game.player.pos);
  if (actor.isPlayer) game.fx.kick(def.recoil * 2.4);
}

export function startReload(game, actor) {
  const loadout = actor.loadout;
  const def = currentDef(loadout);
  const state = loadout.owned[loadout.current];
  if (loadout.reloading > 0 || state.mag >= def.mag || state.reserve <= 0) return;
  loadout.reloading = def.reloadTime;
  if (actor.isPlayer) sfx.reloadStart();
}

export function switchWeapon(actor, slot) {
  const loadout = actor.loadout;
  const keys = Object.keys(loadout.owned);
  const target = keys.find((k) => WEAPONS[k].slot === slot);
  if (target && target !== loadout.current) {
    loadout.current = target;
    loadout.reloading = 0;
    loadout.cooldown = Math.max(loadout.cooldown, 0.32);
    loadout.scoped = false;
  }
}

// ---------------------------------------------------------------------------
// Grenades. Live grenades live in game.grenades; they fly with gravity,
// bounce off wall boxes (sphere vs the same AABBs) and pop on their fuse.
// ---------------------------------------------------------------------------

export function throwGrenade(game, actor, kind) {
  const loadout = actor.loadout;
  if (loadout.grenades[kind] <= 0) return false;
  loadout.grenades[kind] -= 1;
  eyeOf(actor, _origin);
  const dir = actor.aimDir(new THREE.Vector3());
  const vel = dir.multiplyScalar(13.5);
  vel.y += 2.4;
  game.grenades.push({
    kind,
    pos: _origin.clone().addScaledVector(dir, 0.4),
    vel,
    fuse: kind === 'flash' ? 1.35 : 1.55,
    owner: actor,
    mesh: game.fx.grenadeMesh(kind),
  });
  game.scene.add(game.grenades[game.grenades.length - 1].mesh);
  if (actor.isPlayer) sfx.throwWhoosh();
  return true;
}

export function stepGrenades(game, dt) {
  const list = game.grenades;
  for (let i = list.length - 1; i >= 0; i--) {
    const g = list[i];
    g.fuse -= dt;
    g.vel.y -= 14 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // Bounce: treat the grenade as a point against expanded wall boxes on
    // each axis in turn; reflect the velocity component, keep some energy.
    bounceAxis(g, 'x', 0.09);
    bounceAxis(g, 'z', 0.09);
    if (g.pos.y < 0.09) {
      g.pos.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * 0.42;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
      if (Math.abs(g.vel.y) < 0.8) g.vel.y = 0;
    }
    g.mesh.position.copy(g.pos);
    g.mesh.rotation.x += dt * 6;
    g.mesh.rotation.z += dt * 4;
    if (g.fuse <= 0) {
      list.splice(i, 1);
      game.scene.remove(g.mesh);
      popGrenade(game, g);
    }
  }
}

function bounceAxis(g, axis, r) {
  for (const w of WALLS) {
    if (g.pos.y > w.h + r) continue;
    const inX = g.pos.x > w.x0 - r && g.pos.x < w.x1 + r;
    const inZ = g.pos.z > w.z0 - r && g.pos.z < w.z1 + r;
    if (!inX || !inZ) continue;
    // Only bounce when moving into the box on this axis and inside on both.
    if (axis === 'x' && g.vel.x !== 0) {
      const face = g.vel.x > 0 ? w.x0 - r : w.x1 + r;
      if (Math.abs(g.pos.x - face) < Math.abs(g.pos.z - (w.z0 + w.z1) / 2) || true) {
        g.pos.x = face;
        g.vel.x = -g.vel.x * 0.45;
      }
    }
    if (axis === 'z' && g.vel.z !== 0) {
      const face = g.vel.z > 0 ? w.z0 - r : w.z1 + r;
      g.pos.z = face;
      g.vel.z = -g.vel.z * 0.45;
    }
  }
}

function popGrenade(game, g) {
  if (g.kind === 'flash') {
    sfx.flashPop();
    game.fx.flashBang(g.pos);
    for (const actor of game.actors) {
      if (!actor.alive) continue;
      const d = actor.pos.distanceTo(g.pos);
      if (d > 26) continue;
      // Blinded if the pop is in front of them and visible.
      eyeOf(actor, _origin);
      _to.copy(g.pos).sub(_origin).normalize();
      const facing = actor.aimDir(new THREE.Vector3()).dot(_to);
      if (facing < 0.15) continue;
      const blocked = rayHitWall(_origin, _to, d) < d - 0.1;
      if (blocked) continue;
      const strength = Math.max(0.35, 1 - d / 26) * (0.4 + 0.6 * facing);
      actor.blindUntil = Math.max(actor.blindUntil, game.time + 3.4 * strength);
      if (actor.isPlayer) game.fx.blindPlayer(strength);
    }
  } else {
    sfx.shardPop();
    game.fx.explosionFx(g.pos, 3.2);
    for (const actor of game.actors) {
      if (!actor.alive) continue; // the thrower is not exempt: watch your arc
      const centre = actor.pos.clone();
      centre.y += 0.9;
      const d = centre.distanceTo(g.pos);
      if (d > 6.5) continue;
      _to.copy(centre).sub(g.pos).normalize();
      if (rayHitWall(g.pos, _to, d) < d - 0.1) continue;
      const dmg = 92 * Math.max(0, 1 - d / 6.5);
      if (dmg > 2) game.onDamage(g.owner, actor, dmg, false);
    }
  }
}

// ---------------------------------------------------------------------------
// Viewmodels: low-poly guns built from boxes, one per weapon, parented to the
// camera by main.js. Bob, recoil kick and the reload dip are applied here.
// ---------------------------------------------------------------------------

export function buildViewmodel(key) {
  // Detailed display models in the Point Blank tradition: real silhouettes
  // assembled from machined-looking parts — barrels and suppressors as
  // cylinders, curved magazines, stocks, rails, posts and glass — instead
  // of the single slabs the first build shipped with. Purely cosmetic:
  // every number the simulation uses lives in config.js.
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.38, metalness: 0.65 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a727c, roughness: 0.3, metalness: 0.8 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.55, metalness: 0.2 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe07b39, roughness: 0.5, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0e2a33, roughness: 0.15, metalness: 0.4, emissive: 0x1e6f6a, emissiveIntensity: 0.7 });
  const hand = new THREE.MeshStandardMaterial({ color: 0xf5cd30, roughness: 0.32, metalness: 0.02 });
  const box = (mat, sx, sy, sz, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.rotation.z = rz;
    group.add(m);
    return m;
  };
  const cyl = (mat, r, len, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  if (key === 'kestrel') {
    // A service pistol: long slide, exposed barrel tip, railed frame.
    box(steel, 0.058, 0.05, 0.25, 0, 0.03, -0.06);
    box(metal, 0.06, 0.02, 0.03, 0, 0.032, 0.045);
    box(metal, 0.06, 0.02, 0.03, 0, 0.032, 0.028);
    cyl(steel, 0.013, 0.035, 0, 0.032, -0.195);
    box(metal, 0.05, 0.045, 0.21, 0, -0.012, -0.04);
    box(polymer, 0.042, 0.018, 0.11, 0, -0.042, -0.1);
    box(polymer, 0.045, 0.013, 0.1, 0, -0.055, -0.045); // trigger-guard bar
    box(polymer, 0.052, 0.15, 0.07, 0, -0.115, 0.05, 0.28);
    box(metal, 0.02, 0.028, 0.03, 0, 0.012, 0.078);      // hammer
    box(steel, 0.008, 0.026, 0.01, 0, 0.066, -0.168);    // front sight
    box(steel, 0.032, 0.02, 0.012, 0, 0.064, 0.052);     // rear sight
    box(accent, 0.059, 0.012, 0.05, 0, 0.058, -0.13);
    box(hand, 0.08, 0.085, 0.1, 0, -0.145, 0.055);
  } else if (key === 'marauder') {
    // A compact SMG: receiver, long suppressor, curved magazine, wire stock.
    box(metal, 0.06, 0.085, 0.34, 0, 0, -0.08);
    box(polymer, 0.056, 0.06, 0.15, 0, -0.012, -0.21);
    cyl(metal, 0.027, 0.21, 0, 0.006, -0.35);
    cyl(steel, 0.028, 0.02, 0, 0.006, -0.46);
    box(polymer, 0.04, 0.17, 0.055, 0, -0.14, -0.06, 0.18);
    box(polymer, 0.04, 0.1, 0.05, 0, -0.228, -0.032, 0.4);
    box(polymer, 0.048, 0.13, 0.06, 0, -0.105, 0.065, 0.25);
    box(steel, 0.012, 0.012, 0.13, -0.018, -0.002, 0.15);
    box(steel, 0.012, 0.012, 0.13, 0.018, -0.002, 0.15);
    box(polymer, 0.056, 0.11, 0.026, 0, -0.008, 0.225);
    box(steel, 0.04, 0.032, 0.02, 0, 0.058, 0.03);       // rear sight
    cyl(steel, 0.02, 0.014, 0, 0.052, -0.19);            // front ring sight
    box(steel, 0.008, 0.03, 0.008, 0, 0.03, -0.19);
    box(steel, 0.02, 0.016, 0.035, -0.04, 0.022, -0.15); // charging handle
    box(accent, 0.062, 0.02, 0.09, 0, 0.048, -0.16);
    box(hand, 0.08, 0.08, 0.095, 0, -0.14, 0.07);
    box(hand, 0.075, 0.06, 0.09, -0.005, -0.062, -0.22);
  } else if (key === 'verdict') {
    // A bolt-action sniper: heavy barrel, big glass, cheek riser, bipod.
    box(metal, 0.06, 0.085, 0.26, 0, 0, -0.02);
    box(polymer, 0.056, 0.07, 0.24, 0, -0.015, -0.24);
    cyl(steel, 0.017, 0.5, 0, 0.015, -0.45);
    cyl(metal, 0.027, 0.09, 0, 0.015, -0.72);
    cyl(steel, 0.028, 0.012, 0, 0.015, -0.685);
    cyl(steel, 0.028, 0.012, 0, 0.015, -0.755);
    box(steel, 0.02, 0.032, 0.03, 0, 0.058, -0.15);
    box(steel, 0.02, 0.032, 0.03, 0, 0.058, -0.02);
    cyl(metal, 0.021, 0.3, 0, 0.095, -0.085);
    cyl(metal, 0.031, 0.07, 0, 0.095, -0.255);
    cyl(glass, 0.026, 0.005, 0, 0.095, -0.292);
    cyl(metal, 0.026, 0.05, 0, 0.095, 0.09);
    box(polymer, 0.052, 0.09, 0.28, 0, -0.032, 0.17);
    box(polymer, 0.054, 0.04, 0.14, 0, 0.032, 0.19);     // cheek riser
    box(polymer, 0.054, 0.12, 0.02, 0, -0.03, 0.315);
    cyl(steel, 0.008, 0.05, 0.048, 0.005, 0.03);
    box(steel, 0.022, 0.022, 0.022, 0.072, -0.005, 0.03); // bolt knob
    box(polymer, 0.04, 0.09, 0.07, 0, -0.09, -0.05, 0.1);
    box(polymer, 0.046, 0.12, 0.055, 0, -0.1, 0.065, 0.25);
    box(steel, 0.011, 0.17, 0.011, -0.036, -0.1, -0.33, 0.55);
    box(steel, 0.011, 0.17, 0.011, 0.036, -0.1, -0.33, 0.55);
    box(accent, 0.062, 0.016, 0.1, 0, 0.05, -0.3);
    box(hand, 0.08, 0.08, 0.095, 0, -0.135, 0.07);
    box(hand, 0.075, 0.06, 0.09, -0.005, -0.07, -0.25);
    group.position.set(0.24, -0.22, -0.5);
    return group;
  } else {
    // longbow — an assault rifle: railed handguard, brake, curved magazine.
    box(metal, 0.062, 0.09, 0.3, 0, 0, -0.05);
    box(steel, 0.064, 0.03, 0.09, 0, 0.012, -0.02);
    box(steel, 0.03, 0.02, 0.3, 0, 0.056, -0.05);
    for (const z of [-0.17, -0.1, -0.03, 0.04]) box(steel, 0.036, 0.009, 0.016, 0, 0.07, z);
    box(polymer, 0.058, 0.075, 0.22, 0, -0.005, -0.27);
    for (const z of [-0.34, -0.27, -0.2]) box(steel, 0.034, 0.012, 0.02, 0, 0.04, z);
    cyl(steel, 0.013, 0.22, 0, 0.012, -0.47);
    cyl(metal, 0.02, 0.06, 0, 0.012, -0.6);
    cyl(steel, 0.014, 0.016, 0, 0.012, -0.64);
    box(steel, 0.016, 0.05, 0.016, 0, 0.045, -0.44);     // front sight post
    box(steel, 0.03, 0.036, 0.018, 0, 0.078, 0.03);      // rear sight
    box(polymer, 0.042, 0.16, 0.06, 0, -0.13, -0.03, 0.15);
    box(polymer, 0.042, 0.11, 0.055, 0, -0.218, -0.002, 0.36);
    box(polymer, 0.048, 0.13, 0.06, 0, -0.105, 0.08, 0.25);
    box(polymer, 0.05, 0.085, 0.17, 0, -0.015, 0.17);
    box(polymer, 0.052, 0.11, 0.02, 0, -0.02, 0.26);
    box(accent, 0.064, 0.02, 0.12, 0, 0.052, -0.3);
    box(hand, 0.08, 0.08, 0.095, 0, -0.14, 0.085);
    box(hand, 0.075, 0.06, 0.09, -0.005, -0.068, -0.27);
  }
  group.position.set(0.24, -0.22, -0.45);
  return group;
}
