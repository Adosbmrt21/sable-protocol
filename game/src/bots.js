// SABLE PROTOCOL — the bots. Each bot is a body on the same physics as the
// player (circle collision, gravity, the same weapon code) driven by a small
// state machine: follow a waypoint route to an objective, hold a position and
// scan, or fight a seen enemy with bursts and strafes. Perception is honest:
// a bot must have line of sight inside its view cone, or hear a nearby shot
// or footstep, before it knows you are there — and it reacts a beat later,
// so a player who checks corners beats a bot that is already aiming.

import * as THREE from 'three';
import { BODY, TEAM, PALETTE } from './config.js';
import { collideCircle, lineOfSight, findPath, WAYPOINTS } from './map.js';
import { stepWeapon, startReload } from './weapons.js';

const NAMES = {
  [TEAM.WARDEN]: ['Hale', 'Okafor', 'Renn', 'Sato', 'Vik'],
  [TEAM.JACKAL]: ['Mara', 'Doss', 'Ivers', 'Kade'],
};

// The classic toy-figure face — two oval eyes and a grin — drawn once on a
// canvas and worn on the front (-Z) of every bot's head.
function faceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f5cd30';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#23262b';
  g.beginPath(); g.ellipse(42, 50, 9, 14, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(86, 50, 9, 14, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#23262b';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath(); g.arc(64, 72, 27, Math.PI * 0.18, Math.PI * 0.82); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A blocky toy soldier in the brick-figure tradition: yellow head and hands,
// a team-coloured torso, hinged arms and legs that swing as it walks, and a
// rifle held forward in the right hand. Built facing -Z, the way aimDir
// points. The head's hit sphere still sits at 1.52, inside the head block.
export function buildBotMesh(team) {
  const g = new THREE.Group();
  const teamColor = team === TEAM.WARDEN ? PALETTE.warden : PALETTE.jackal;
  const plastic = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.02 });
  const cloth = plastic(teamColor);
  const dark = plastic(0x33383f);
  const yellow = plastic(0xf5cd30);
  const legsMat = plastic(team === TEAM.WARDEN ? 0x2e4a73 : 0x74512a);
  const box = (parent, mat, sx, sy, sz, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const limb = (x, y) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    g.add(p);
    return p;
  };

  // Legs on hip pivots, with shoes.
  const legL = limb(-0.15, 0.64);
  const legR = limb(0.15, 0.64);
  for (const leg of [legL, legR]) {
    box(leg, legsMat, 0.25, 0.6, 0.27, 0, -0.3, 0);
    box(leg, dark, 0.25, 0.11, 0.37, 0, -0.585, -0.045);
  }
  // Torso and belt.
  box(g, cloth, 0.58, 0.6, 0.32, 0, 0.94, 0);
  box(g, dark, 0.6, 0.12, 0.34, 0, 0.66, 0);
  // Arms on shoulder pivots; yellow hands. The right arm aims its rifle.
  const armL = limb(-0.38, 1.2);
  const armR = limb(0.38, 1.2);
  for (const arm of [armL, armR]) {
    box(arm, cloth, 0.17, 0.56, 0.19, 0, -0.28, 0);
    box(arm, yellow, 0.16, 0.15, 0.17, 0, -0.62, 0);
  }
  armR.rotation.x = 1.3;
  const gun = new THREE.Group();
  gun.position.set(0, -0.64, -0.06);
  gun.rotation.x = -1.28; // counter the arm pitch: the rifle stays level
  armR.add(gun);
  box(gun, dark, 0.08, 0.11, 0.58, 0, 0, -0.2);
  box(gun, cloth, 0.086, 0.05, 0.2, 0, 0.075, -0.3);
  box(gun, dark, 0.05, 0.16, 0.08, 0, -0.11, 0.02);
  // Head: a yellow block with the face in front and a stud on top.
  const head = new THREE.Group();
  head.position.set(0, 1.24, 0);
  g.add(head);
  const face = new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.32, metalness: 0.02 });
  const skull = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.38, 0.4),
    [yellow, yellow, yellow, yellow, yellow, face],
  );
  skull.position.y = 0.19;
  skull.castShadow = true;
  head.add(skull);
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14), yellow);
  stud.position.y = 0.42;
  stud.castShadow = true;
  head.add(stud);

  g.userData = { legL, legR, armL, armR, head };
  return g;
}

export function makeBot(spawn, team, index) {
  const bot = {
    isPlayer: false,
    team,
    name: NAMES[team][index % NAMES[team].length],
    alive: true,
    hp: 100,
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    vel: new THREE.Vector3(),
    yaw: team === 1 ? -Math.PI / 2 : Math.PI / 2,
    pitch: 0,
    crouch: false,
    onGround: true,
    eyeHeight: BODY.standEye,
    mesh: null,
    // AI state.
    plan: null,          // { role, site, holdId, routeName }
    path: null,
    pathStep: 0,
    target: null,
    lastSeenAt: -99,
    lastSeenPos: new THREE.Vector3(),
    alertPos: null,
    thinkAt: Math.random() * 0.15,
    reactAt: 0,
    burstLeft: 0,
    burstPauseUntil: 0,
    strafeDir: 1,
    strafeUntil: 0,
    scanYaw: 0,
    planting: false,
    defusing: false,
    wantFire: false,
    triggerEdge: false,
    aimSpread: 1.55,
    stepCycle: 0,
    lastShotAt: -99,
    lastStepAt: -99,
    stepVolume: 0.85,
    blindUntil: -1,
    muzzle: 0,
    carryCore: false,
    atHold: false,
    pathFor: '',
    retakeFor: -1,
    holdOff: null,
    aimDir(out) {
      const cp = Math.cos(this.pitch);
      return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    },
  };
  return bot;
}

// Round plans. Jackals pick a site (weighted, sometimes split); the carrier
// leads, two push the site's main route, two come through the connector.
// Wardens hold both sites and the link, and rotate on information.
export function assignPlans(game) {
  const rng = game.rng;
  const site = rng() < 0.62 ? 'A' : 'B';
  const alt = site === 'A' ? 'B' : 'A';
  const jackals = game.actors.filter((a) => !a.isPlayer && a.team === TEAM.JACKAL);
  const routes = {
    A: ['aLongOut', 'aSiteIn', 'aMain', 'aShort'],
    B: ['bTunOut', 'bSiteIn', 'bMain', 'bShort'],
  };
  jackals.forEach((bot, i) => {
    const mine = i === 0 ? site : (i === 3 ? alt : site);
    bot.plan = {
      role: bot.carryCore ? 'carrier' : 'push',
      site: mine,
      via: routes[mine][i % routes[mine].length],
    };
  });
  if (game.player.carryCore) {
    // The player carries: bots push the chosen site ahead of them.
    jackals.forEach((bot, i) => { bot.plan = { role: 'push', site, via: routes[site][i % routes[site].length] }; });
  }
  const wardens = game.actors.filter((a) => a.team === TEAM.WARDEN);
  const holds = [
    { site: 'A', holdId: 'aSite' }, { site: 'A', holdId: 'aSiteBack' }, { site: 'A', holdId: 'aLobby' },
    { site: 'B', holdId: 'bSite' }, { site: 'B', holdId: 'bSiteBack' },
  ];
  if (site === 'B') holds.reverse();
  wardens.forEach((bot, i) => {
    bot.plan = { role: 'hold', site: holds[i].site, holdId: holds[i].holdId };
  });
  game.attackSite = site;
}

function setPath(bot, dest) {
  bot.path = findPath(bot.pos, dest);
  bot.pathStep = 0;
}

// Move along the current path toward a destination point; returns true when
// arrived (within arriveDist of the final point).
function followPath(bot, dt, speed, arriveDist = 0.7) {
  if (!bot.path || bot.pathStep >= bot.path.length) return true;
  const node = WAYPOINTS[bot.path[bot.pathStep]];
  const dx = node.x - bot.pos.x;
  const dz = node.z - bot.pos.z;
  const d = Math.hypot(dx, dz);
  const isLast = bot.pathStep === bot.path.length - 1;
  if (d < (isLast ? arriveDist : 0.9)) {
    bot.pathStep += 1;
    return isLast;
  }
  moveToward(bot, node.x, node.z, dt, speed);
  return false;
}

function moveToward(bot, x, z, dt, speed) {
  const dx = x - bot.pos.x;
  const dz = z - bot.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const desiredYaw = Math.atan2(-dx, -dz);
  turnToward(bot, desiredYaw, dt, 7);
  bot.vel.x = (dx / d) * speed;
  bot.vel.z = (dz / d) * speed;
}

function turnToward(bot, yaw, dt, rate = 9) {
  let diff = yaw - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = rate * dt;
  bot.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
}

const _eye = new THREE.Vector3();
const _tgt = new THREE.Vector3();

// Perception: refresh what the bot can see and hear. Runs on a stagger so
// ten bots do not all raycast on the same step.
function perceive(game, bot) {
  let seen = null;
  for (const other of game.actors) {
    if (other.team === bot.team || !other.alive) continue;
    const dx = other.pos.x - bot.pos.x;
    const dz = other.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 62) continue;
    // View cone: 105 degrees around facing, plus a whisper of proximity sense.
    const ang = Math.abs(angleDiff(Math.atan2(-dx, -dz), bot.yaw));
    if (ang > 1.85 && dist > 3.2) continue;
    _eye.set(bot.pos.x, bot.pos.y + BODY.standEye, bot.pos.z);
    _tgt.set(other.pos.x, other.pos.y + 1.15, other.pos.z);
    if (!lineOfSight(_eye.x, _eye.y, _eye.z, _tgt.x, _tgt.y, _tgt.z)) continue;
    if (!seen || dist < seen.dist) seen = { actor: other, dist };
  }
  if (seen) {
    if (bot.target !== seen.actor) bot.reactAt = game.time + 0.32 + Math.random() * 0.2;
    bot.target = seen.actor;
    seen.actor.spottedUntil = game.time + 2.5; // team intel for the minimap
    bot.lastSeenAt = game.time;
    bot.lastSeenPos.copy(seen.actor.pos);
    bot.alertPos = null;
    return;
  }
  // Hearing: a shot or a loud step nearby points the bot at the noise.
  for (const other of game.actors) {
    if (other.team === bot.team || !other.alive) continue;
    const dist = other.pos.distanceTo(bot.pos);
    const heardShot = game.time - (other.lastShotAt ?? -99) < 0.4 && dist < 30;
    const heardStep = game.time - (other.lastStepAt ?? -99) < 0.3 && dist < 11 * (other.stepVolume ?? 1);
    if (heardShot || heardStep) {
      bot.alertPos = other.pos.clone();
      if (!bot.target) bot.scanYaw = Math.atan2(-(other.pos.x - bot.pos.x), -(other.pos.z - bot.pos.z));
    }
  }
  if (bot.target && game.time - bot.lastSeenAt > 2.6) bot.target = null;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function stepBot(game, bot, dt) {
  if (!bot.alive) return;
  bot.wantFire = false;
  bot.triggerEdge = false;
  bot.planting = false;
  bot.defusing = false;

  if (game.time >= bot.thinkAt) {
    bot.thinkAt = game.time + 0.12;
    if (game.time >= bot.blindUntil) perceive(game, bot);
  }
  const blind = game.time < bot.blindUntil;
  const bomb = game.bomb;

  // --- Choose behaviour -------------------------------------------------
  let speed = 0;
  if (blind) {
    // Blinded: stop, turn away, do not fire.
    bot.vel.x *= 0.8;
    bot.vel.z *= 0.8;
  } else if (bot.target && game.time >= bot.reactAt) {
    fight(game, bot, dt);
    speed = -1; // fight() drives velocity itself
  } else if (bomb.state === 'planted' && bot.team === TEAM.WARDEN) {
    // Retake: converge on the bomb; the nearest warden defuses.
    const dest = { x: bomb.pos.x, z: bomb.pos.z };
    if (!bot.path || bot.retakeFor !== bomb.plantedAt) {
      setPath(bot, dest);
      bot.retakeFor = bomb.plantedAt;
    }
    const d = Math.hypot(bot.pos.x - dest.x, bot.pos.z - dest.z);
    if (d < 1.1) {
      bot.vel.set(0, 0, 0);
      bot.defusing = true;
      turnToward(bot, Math.atan2(-(dest.x - bot.pos.x), -(dest.z - bot.pos.z)), dt);
    } else if (followPath(bot, dt, BODY.walkSpeed * 0.96)) {
      bot.defusing = d < 1.6;
    }
    speed = -1;
  } else if (bot.plan) {
    speed = doPlan(game, bot, dt);
  }

  // If a target is visible but we are still reacting, face it.
  if (bot.target && game.time < bot.reactAt && !blind) {
    turnToward(bot, Math.atan2(-(bot.target.pos.x - bot.pos.x), -(bot.target.pos.z - bot.pos.z)), dt, 6);
  }

  // --- Integrate ---------------------------------------------------------
  if (speed >= 0) {
    // doPlan set a desired velocity direction through moveToward already.
  }
  bot.pos.x += bot.vel.x * dt;
  bot.pos.z += bot.vel.z * dt;
  bot.pos.y += bot.vel.y * dt;
  bot.vel.y -= 12.5 * dt;
  if (bot.pos.y <= 0) { bot.pos.y = 0; bot.vel.y = 0; bot.onGround = true; }
  collideCircle(bot.pos, BODY.radius);

  // Separation: bots do not stack inside each other.
  for (const other of game.actors) {
    if (other === bot || !other.alive) continue;
    const dx = bot.pos.x - other.pos.x;
    const dz = bot.pos.z - other.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.0001 && d2 < 0.64) {
      const d = Math.sqrt(d2);
      bot.pos.x += (dx / d) * (0.8 - d) * 0.5;
      bot.pos.z += (dz / d) * (0.8 - d) * 0.5;
    }
  }

  // Footsteps for the player's ears (and other bots' hearing uses lastStepAt).
  const spd = Math.hypot(bot.vel.x, bot.vel.z);
  if (bot.onGround && spd > 0.6) {
    bot.stepCycle += spd * dt;
    if (bot.stepCycle > 2.7) {
      bot.stepCycle = 0;
      bot.lastStepAt = game.time;
      bot.stepVolume = 0.85;
    }
  }

  // Fire control through the shared weapon code.
  if (!blind) stepWeapon(game, bot, dt, bot.wantFire);
  const state = bot.loadout.owned[bot.loadout.current];
  if (state && state.mag === 0) startReload(game, bot);

  // Pose the mesh, with a toy walk cycle on the limb pivots: legs and the
  // free arm swing against each other, the head bobs, and a crouch bends
  // the whole figure down on bent legs.
  if (bot.mesh) {
    bot.mesh.position.copy(bot.pos);
    bot.mesh.rotation.y = bot.yaw + Math.PI;
    const crouchDip = bot.crouch ? 0.34 : 0;
    bot.mesh.position.y = bot.pos.y - crouchDip;
    bot.mesh.visible = bot.alive;
    const u = bot.mesh.userData;
    if (u.legL) {
      const moving = Math.min(1, spd / 3.2);
      if (spd > 0.25) bot.walkPhase = (bot.walkPhase || 0) + dt * (3 + spd * 2.4);
      const swing = Math.sin(bot.walkPhase || 0) * 0.62 * moving;
      if (bot.crouch) {
        u.legL.rotation.x = -0.9;
        u.legR.rotation.x = 0.25;
        u.armL.rotation.x = 0.5;
      } else {
        u.legL.rotation.x = swing;
        u.legR.rotation.x = -swing;
        u.armL.rotation.x = -swing * 0.85;
      }
      u.head.position.y = 1.24 + Math.abs(Math.sin(bot.walkPhase || 0)) * 0.03 * moving;
    }
  }
}

// The plan follower: returns a speed hint (velocity is set by moveToward).
function doPlan(game, bot, dt) {
  const plan = bot.plan;
  const bomb = game.bomb;
  if (bot.team === TEAM.JACKAL) {
    const site = game.sites[plan.site];
    if (plan.role === 'carrier' && bomb.state === 'carried' && bomb.carrier === bot) {
      const d = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z);
      if (d < site.r - 1.6) {
        bot.vel.set(0, 0, 0);
        bot.planting = true;
        return 0;
      }
    }
    // Push: route via the named connector, then onto the site.
    const dest = plan.stage === 'site'
      ? { x: site.x + (bot.holdOff?.x ?? 0), z: site.z + (bot.holdOff?.z ?? 0) }
      : WAYPOINTS.find((w) => w.id === plan.via);
    if (!bot.path || bot.pathFor !== plan.via + (plan.stage ?? '')) {
      setPath(bot, dest);
      bot.pathFor = plan.via + (plan.stage ?? '');
    }
    if (followPath(bot, dt, BODY.walkSpeed * (plan.role === 'carrier' ? 0.94 : 0.99))) {
      if (plan.stage !== 'site') {
        plan.stage = 'site';
        bot.path = null;
      } else {
        bot.vel.multiplyScalar(0.6);
        scanAround(game, bot, dt);
      }
    }
    return 0;
  }
  // Wardens: go to the hold point, then hold it — scan likely approaches.
  const hold = WAYPOINTS.find((w) => w.id === plan.holdId);
  if (!bot.path && !bot.atHold) {
    setPath(bot, hold);
  }
  if (!bot.atHold) {
    if (followPath(bot, dt, BODY.walkSpeed * 0.97)) bot.atHold = true;
    return 0;
  }
  bot.vel.multiplyScalar(0.5);
  if (bot.alertPos) {
    turnToward(bot, Math.atan2(-(bot.alertPos.x - bot.pos.x), -(bot.alertPos.z - bot.pos.z)), dt, 5);
  } else {
    scanAround(game, bot, dt);
  }
  return 0;
}

function scanAround(game, bot, dt) {
  // Slow sweep across the approaches: Wardens watch west toward the lanes,
  // Jackals who have arrived watch east toward the Wardens' link.
  const sweep = Math.sin(game.time * 0.45 + bot.pos.x) * 0.5;
  const facing = bot.team === TEAM.WARDEN ? Math.PI / 2 : -Math.PI / 2;
  turnToward(bot, facing + sweep, dt, 2.2);
}

// Combat behaviour: track the target, fire bursts, strafe between them.
function fight(game, bot, dt) {
  const t = bot.target;
  const dx = t.pos.x - bot.pos.x;
  const dz = t.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  const aimYaw = Math.atan2(-dx, -dz);
  turnToward(bot, aimYaw, dt, 10);
  // Aim pitch at the chest; the weapon code adds spread.
  const dy = (t.pos.y + 1.1) - (bot.pos.y + BODY.standEye);
  bot.pitch = Math.max(-0.5, Math.min(0.5, Math.atan2(dy, dist)));

  const state = bot.loadout.owned[bot.loadout.current];
  const isVerdict = bot.loadout.current === 'verdict';
  if (game.time >= bot.burstPauseUntil && bot.burstLeft <= 0) {
    bot.burstLeft = isVerdict ? 1 : 2 + (Math.random() * 3 | 0);
  }
  if (bot.burstLeft > 0 && state.mag > 0) {
    bot.triggerEdge = true;
    bot.wantFire = true;
    // Spend the burst at roughly the weapon's own cadence.
    bot.burstLeft -= isVerdict ? 1 : dt * 9;
    if (bot.burstLeft <= 0) bot.burstPauseUntil = game.time + (isVerdict ? 1.05 : 0.38 + Math.random() * 0.5);
  }
  // Movement in a fight: strafe at mid range, push a weak target, back off
  // from a close one. Crouch for long shots.
  bot.crouch = dist > 26 && Math.random() < 0.01;
  if (game.time >= bot.strafeUntil) {
    bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
    bot.strafeUntil = game.time + 0.6 + Math.random() * 0.9;
  }
  const perpX = Math.cos(bot.yaw) * bot.strafeDir;
  const perpZ = -Math.sin(bot.yaw) * bot.strafeDir;
  let fwd = 0;
  if (dist > 20) fwd = 0.7;
  else if (dist < 6) fwd = -0.5;
  const fx = -Math.sin(bot.yaw);
  const fz = -Math.cos(bot.yaw);
  const sp = BODY.walkSpeed * 0.62;
  bot.vel.x = (perpX + fx * fwd) * sp;
  bot.vel.z = (perpZ + fz * fwd) * sp;
}
