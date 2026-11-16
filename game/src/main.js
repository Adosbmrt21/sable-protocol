// SABLE PROTOCOL — a round-based tactical FPS in three.js.
// Wardens defend two foundry sites; Jackals carry the Core and plant it.
// Money between rounds buys rifles, a sniper, armour and grenades; spread
// punishes firing on the move, so the game rewards stopping, aiming and
// trading angles. This module owns the match: the fixed-step simulation,
// round flow, the bomb, damage and deaths, effects, the camera and the
// deterministic screenshot modes the entry's screenshots are taken with.

import * as THREE from 'three';
import { TEAM, TEAM_NAME, RULES, WEAPONS, GRENADES, ARMOR_PRICE, BODY } from './config.js';
import { buildWorld, SITES, SPAWNS } from './map.js';
import { initInput, input, lockPointer, consumeEdges } from './input.js';
import { makePlayerActor, stepPlayer } from './player.js';
import { makeBot, buildBotMesh, assignPlans, stepBot } from './bots.js';
import {
  makeLoadout, giveWeapon, currentDef, stepWeapon, startReload, switchWeapon,
  throwGrenade, stepGrenades, buildViewmodel, eyeOf,
} from './weapons.js';
import { createHUD } from './hud.js';
import { sfx, unlockAudio } from './audio.js';

// --- Seeded RNG (shot modes are deterministic; live play seeds from time) --
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') ?? (Date.now() % 100000));

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 400);
scene.add(camera);
buildWorld(scene);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Effects ----------------------------------------------------------------
// Pooled, allocation-free effects: tracers, impact flashes, one muzzle light.
const fx = (() => {
  const tracerGeo = new THREE.BoxGeometry(0.016, 0.016, 1);
  const tracerMats = [
    new THREE.MeshBasicMaterial({ color: 0xbcd9ff, transparent: true, opacity: 0.9 }),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 }),
  ];
  const tracers = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(tracerGeo, tracerMats[0]);
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }
  let tracerIdx = 0;
  const flashGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const flashes = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0 }));
    m.visible = false;
    scene.add(m);
    flashes.push({ mesh: m, life: 0, max: 0.07, grow: 1 });
  }
  let flashIdx = 0;
  const muzzleLight = new THREE.PointLight(0xffc37a, 0, 10, 1.6);
  scene.add(muzzleLight);
  const boomLight = new THREE.PointLight(0xff7a3c, 0, 30, 1.4);
  scene.add(boomLight);
  const boomMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa04e, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  boomMesh.visible = false;
  scene.add(boomMesh);
  let boomLife = 0;
  let boomRadius = 3;
  const muzzleSprite = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0, depthWrite: false }),
  );
  muzzleSprite.visible = false;
  scene.add(muzzleSprite);

  function spawnFlash(pos, color, scale, life) {
    const f = flashes[flashIdx++ % flashes.length];
    f.mesh.position.copy(pos);
    f.mesh.material.color.setHex(color);
    f.mesh.scale.setScalar(scale);
    f.life = life;
    f.max = life;
    f.mesh.visible = true;
  }

  return {
    recoil: 0,
    shakeAmt: 0,
    tracer(from, to, team) {
      const t = tracers[tracerIdx++ % tracers.length];
      const full = from.distanceTo(to);
      if (full < 0.5) return;
      // Start at the muzzle, not the eye: a beam that begins at the camera
      // blooms into a wedge across the near plane.
      const dirv = to.clone().sub(from).normalize();
      const start = from.clone().addScaledVector(dirv, Math.min(0.9, full * 0.3));
      const len = start.distanceTo(to);
      t.mesh.material = tracerMats[team];
      t.mesh.position.copy(start).add(to).multiplyScalar(0.5);
      t.mesh.lookAt(to);
      t.mesh.scale.set(1, 1, len);
      t.mesh.visible = true;
      t.life = 0.05;
    },
    impact(pos) { spawnFlash(pos, 0xffb36b, 1, 0.06); },
    hitSpark(pos, head) { spawnFlash(pos, head ? 0xff6a5e : 0xffa08a, 1.5, 0.08); },
    flashBang(pos) {
      spawnFlash(pos, 0xffffff, 5, 0.1);
      muzzleLight.position.copy(pos);
      muzzleLight.intensity = 60;
    },
    explosionFx(pos, radius) {
      boomRadius = radius;
      boomMesh.position.copy(pos).y += 0.6;
      boomMesh.visible = true;
      boomLife = 0.38;
      boomLight.position.copy(pos).y += 1;
      boomLight.intensity = 260;
      this.shakeAmt = Math.min(1, this.shakeAmt + 0.5);
    },
    grenadeMesh(kind) {
      const g = new THREE.Group();
      const bodyM = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 10, 8),
        new THREE.MeshStandardMaterial({ color: kind === 'flash' ? 0xd8d4c4 : 0x74553a, roughness: 0.5, metalness: 0.4 }),
      );
      g.add(bodyM);
      return g;
    },
    kick(amount) { this.recoil = Math.min(0.09, this.recoil + amount); },
    blindPlayer(strength) {
      const p = game.player;
      p.blindPeak = Math.max(p.blindPeak ?? 0, strength);
    },
    update(dt) {
      for (const t of tracers) {
        if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false; }
      }
      for (const f of flashes) {
        if (f.life > 0) {
          f.life -= dt;
          f.mesh.material.opacity = Math.max(0, f.life / f.max) * 0.9;
          if (f.life <= 0) f.mesh.visible = false;
        }
      }
      muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 700);
      boomLight.intensity = Math.max(0, boomLight.intensity - dt * 900);
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - boomLife / 0.38;
        boomMesh.scale.setScalar(0.5 + k * boomRadius);
        boomMesh.material.opacity = 0.5 * (1 - k);
        if (boomLife <= 0) boomMesh.visible = false;
      }
      this.recoil = Math.max(0, this.recoil - dt * 0.55);
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.7);
      // Bot muzzle flashes + the shared light at the freshest shot.
      let freshest = null;
      for (const a of game.actors) {
        if (a.muzzle > 0) {
          a.muzzle -= dt;
          if (!a.isPlayer) freshest = a;
        }
      }
      if (freshest) {
        const dir = freshest.aimDir(new THREE.Vector3());
        muzzleSprite.position.copy(freshest.pos).addScaledVector(dir, 0.55);
        muzzleSprite.position.y += 1.02;
        muzzleSprite.lookAt(camera.position);
        muzzleSprite.material.opacity = 0.95;
        muzzleSprite.visible = true;
        muzzleLight.position.copy(muzzleSprite.position);
        muzzleLight.intensity = 22;
      } else {
        muzzleSprite.visible = false;
      }
    },
  };
})();

// --- The game object ----------------------------------------------------------
const game = {
  time: 0,
  rng: mulberry32(seed),
  scene,
  camera,
  fx,
  actors: [],
  player: null,
  grenades: [],
  sites: { A: SITES[0], B: SITES[1] },
  phase: 'menu', // menu | buy | live | roundEnd | matchEnd
  phaseTimeLeft: 0,
  round: 0,
  score: [0, 0],
  attackSite: 'A',
  bomb: null,
  playerInSite: false,
  playerSpread: 0,
  hud: null,
  weaponMoveScale(actor) { return currentDef(actor.loadout).moveSpeed; },
  onBuy: null,
};
window.__game = game;

// Actors: the player leads the Jackals; four Jackal bots, five Wardens.
const player = makePlayerActor(SPAWNS.jackal[1], TEAM.JACKAL);
game.player = player;
game.actors.push(player);
for (let i = 0; i < 4; i++) {
  const bot = makeBot(SPAWNS.jackal[i === 0 ? 0 : i + 1], TEAM.JACKAL, i);
  bot.mesh = buildBotMesh(TEAM.JACKAL);
  scene.add(bot.mesh);
  game.actors.push(bot);
}
for (let i = 0; i < 5; i++) {
  const bot = makeBot(SPAWNS.warden[i], TEAM.WARDEN, i);
  bot.mesh = buildBotMesh(TEAM.WARDEN);
  scene.add(bot.mesh);
  game.actors.push(bot);
}
for (const a of game.actors) {
  a.loadout = makeLoadout();
  a.money = RULES.startMoney;
  a.kills = 0;
  a.deaths = 0;
  a.spottedUntil = 0;
  a.blindPeak = 0;
}

// Viewmodels, one per weapon, parented to the camera.
const viewmodels = {};
for (const key of Object.keys(WEAPONS)) {
  viewmodels[key] = buildViewmodel(key);
  viewmodels[key].visible = false;
  camera.add(viewmodels[key]);
}
const muzzlePlane = new THREE.Mesh(
  new THREE.PlaneGeometry(0.08, 0.08),
  new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0, depthWrite: false }),
);
muzzlePlane.position.set(0.24, -0.215, -0.9);
camera.add(muzzlePlane);

game.hud = createHUD(game);

// --- Damage, death, the bomb --------------------------------------------------
game.onDamage = (shooter, target, dmg, head) => {
  if (!target.alive || game.phase !== 'live') return;
  target.hp -= dmg;
  target.channelReset = true;
  target.spottedUntil = game.time + 2.5;
  if (shooter.isPlayer) {
    game.hud.hitmark(head);
    sfx.hit(head);
  }
  if (target.isPlayer) {
    game.hud.damageFlash();
    sfx.hurt();
    fx.shakeAmt = Math.min(1, fx.shakeAmt + 0.18);
  }
  if (target.hp <= 0) killActor(shooter, target, head);
};

function killActor(shooter, target, head) {
  target.alive = false;
  target.hp = 0;
  target.deaths += 1;
  target.loadout.lostGun = true;
  if (target.mesh) target.mesh.visible = false;
  if (shooter && shooter !== target) {
    shooter.kills += 1;
    shooter.money = Math.min(RULES.maxMoney, shooter.money + RULES.rewardKill);
  }
  game.hud.killfeed(
    `<b>${shooter ? shooter.name : '—'}</b> ${head ? '⌖ headshot' : '▸'} <b>${target.name}</b>`,
  );
  if (shooter && shooter.isPlayer) sfx.kill();
  if (target.carryCore) {
    target.carryCore = false;
    game.bomb.state = 'dropped';
    game.bomb.carrier = null;
    game.bomb.pos.copy(target.pos);
    game.hud.killfeed('◆ The Core has been dropped');
  }
  if (target.isPlayer) game.hud.banner('YOU ARE DOWN', 'Your team fights on without you', 2200);
}

function inSite(actor) {
  for (const site of SITES) {
    if (Math.hypot(actor.pos.x - site.x, actor.pos.z - site.z) < site.r) return site;
  }
  return null;
}

// --- Round flow -----------------------------------------------------------------
function resetActor(a, spawn) {
  a.pos.set(spawn.x, 0, spawn.z);
  a.vel.set(0, 0, 0);
  a.hp = 100;
  a.alive = true;
  a.crouch = false;
  a.yaw = a.team === TEAM.JACKAL ? -Math.PI / 2 : Math.PI / 2;
  a.pitch = 0;
  a.blindUntil = -1;
  a.blindPeak = 0;
  a.target = null;
  a.path = null;
  a.atHold = false;
  a.pathFor = '';
  a.planting = false;
  a.defusing = false;
  if (a.loadout.lostGun) a.loadout = makeLoadout();
  else {
    // Survivors keep their kit; magazines refill, the gun stays.
    const lo = a.loadout;
    for (const key of Object.keys(lo.owned)) {
      lo.owned[key].mag = WEAPONS[key].mag;
      lo.owned[key].reserve = Math.max(lo.owned[key].reserve, WEAPONS[key].mag * 2);
    }
    lo.reloading = 0;
    lo.bloom = 0;
  }
  if (a.mesh) {
    a.mesh.visible = true;
    a.mesh.position.copy(a.pos);
    a.mesh.rotation.y = a.yaw + Math.PI;
  }
}

function nextRound() {
  game.round += 1;
  game.grenades.forEach((g) => scene.remove(g.mesh));
  game.grenades.length = 0;
  const jackalSpawns = SPAWNS.jackal;
  const wardenSpawns = SPAWNS.warden;
  let ji = 0;
  let wi = 0;
  for (const a of game.actors) {
    if (a.team === TEAM.JACKAL) resetActor(a, jackalSpawns[ji++ % jackalSpawns.length]);
    else resetActor(a, wardenSpawns[wi++ % wardenSpawns.length]);
    a.carryCore = false;
  }
  // The Core goes to a random Jackal — the player carries it about half the
  // time, so planting is regularly in the player's own hands.
  const jackals = game.actors.filter((a) => a.team === TEAM.JACKAL);
  const carrier = game.rng() < 0.5 ? player : jackals[1 + ((game.rng() * 4) | 0)];
  carrier.carryCore = true;
  game.bomb = {
    state: 'carried', carrier, pos: carrier.pos.clone(), site: null,
    plantedAt: 0, timeLeft: RULES.bombTime, plantProgress: 0, defuseProgress: 0, beepAt: 0,
  };
  assignPlans(game);
  game.phase = 'buy';
  game.phaseTimeLeft = RULES.buyTime;
  game.hud.showBuy(true);
  game.hud.banner(`ROUND ${game.round}`, `${TEAM_NAME[TEAM.JACKAL]} attack · plant the Core or eliminate the Wardens`, 2400);
}

function endRound(winner, reason) {
  game.phase = 'roundEnd';
  game.phaseTimeLeft = RULES.endTime;
  game.score[winner] += 1;
  for (const a of game.actors) {
    if (a.team === winner) a.money = Math.min(RULES.maxMoney, a.money + RULES.rewardWin);
    else a.money = Math.min(RULES.maxMoney, a.money + (game.bomb.state === 'exploded' || game.bomb.state === 'planted' ? RULES.rewardPlantedLoss : RULES.rewardLoss));
  }
  const playerWon = winner === player.team;
  game.hud.banner(playerWon ? 'ROUND WON' : 'ROUND LOST', reason, 3400);
  if (playerWon) sfx.roundWin(); else sfx.roundLose();
  game.hud.showBuy(false);
}

function checkMatchEnd() {
  const [w, j] = game.score;
  if (w >= RULES.winTarget || j >= RULES.winTarget || game.round >= RULES.maxRounds) {
    game.phase = 'matchEnd';
    const playerWon = game.score[player.team] > game.score[1 - player.team];
    game.hud.showEnd(
      playerWon ? 'MATCH WON' : 'MATCH LOST',
      `${TEAM_NAME[TEAM.WARDEN]} ${w} — ${j} ${TEAM_NAME[TEAM.JACKAL]}`,
    );
    document.exitPointerLock && document.exitPointerLock();
    return true;
  }
  return false;
}

// --- Buying -----------------------------------------------------------------------
game.onBuy = (key) => {
  if (game.phase !== 'buy') return;
  const p = player;
  const buy = (price) => {
    if (p.money < price) { sfx.denied(); return false; }
    p.money -= price;
    sfx.buy();
    return true;
  };
  if (key === 'armor') {
    if (!p.loadout.armor && buy(ARMOR_PRICE)) p.loadout.armor = true;
  } else if (key === 'flash' || key === 'shard') {
    if (p.loadout.grenades[key] < 2 && buy(GRENADES[key].price)) p.loadout.grenades[key] += 1;
  } else if (WEAPONS[key]) {
    if (!p.loadout.owned[key] && buy(WEAPONS[key].price)) giveWeapon(p.loadout, key);
  }
  // Bots shop with the same rules, simply: rifle if rich, SMG if not,
  // armour when they can, a grenade with the change.
  for (const bot of game.actors) {
    if (bot.isPlayer || !bot.alive) continue;
    const lo = bot.loadout;
    if (!lo.owned.longbow && bot.money >= WEAPONS.longbow.price + ARMOR_PRICE) {
      bot.money -= WEAPONS.longbow.price;
      giveWeapon(lo, 'longbow');
    } else if (!lo.owned.marauder && bot.money >= WEAPONS.marauder.price) {
      bot.money -= WEAPONS.marauder.price;
      giveWeapon(lo, 'marauder');
    }
    if (!lo.armor && bot.money >= ARMOR_PRICE) { bot.money -= ARMOR_PRICE; lo.armor = true; }
    if (bot.money >= 500 && lo.grenades.shard === 0) { bot.money -= GRENADES.shard.price; lo.grenades.shard = 1; }
    else if (bot.money >= 300 && lo.grenades.flash === 0) { bot.money -= GRENADES.flash.price; lo.grenades.flash = 1; }
  }
};

// --- The fixed-step simulation ------------------------------------------------------
const STEP = 1 / 120;

function step(dt) {
  game.time += dt;
  const phase = game.phase;
  if (phase !== 'buy' && phase !== 'live' && phase !== 'roundEnd') return;

  if (phase === 'buy' || phase === 'live') {
    // The player.
    if (player.alive) {
      player.triggerEdge = input.firePressed;
      input.firePressed = false;
      stepPlayer(game, player, dt);
      if (phase === 'buy') clampToSpawn(player, dt);
      if (input.reloadPressed) { startReload(game, player); input.reloadPressed = false; }
      if (input.slotPressed) { switchWeapon(player, input.slotPressed); input.slotPressed = 0; }
      if (input.grenadePressed) { throwGrenade(game, player, input.grenadePressed); input.grenadePressed = null; }
      if (phase === 'live') {
        const scopedKey = player.loadout.current === 'verdict';
        player.loadout.scoped = scopedKey && input.keys.has('MouseRight');
        stepWeapon(game, player, dt, input.firing && (input.locked || input.touchMode));
      }
    }
    // Bots hold still and shop during the buy phase; they play in live.
    if (phase === 'live') {
      for (const a of game.actors) if (!a.isPlayer) stepBot(game, a, dt);
      stepGrenades(game, dt);
      stepBomb(dt);
    }
    game.playerInSite = !!inSite(player);
  }

  // Phase clocks.
  game.phaseTimeLeft -= dt;
  if (phase === 'buy' && game.phaseTimeLeft <= 0) {
    game.phase = 'live';
    game.phaseTimeLeft = RULES.roundTime;
    game.hud.showBuy(false);
    game.hud.banner('ROUND LIVE', game.bomb.carrier === player ? 'You have the Core — plant it at A or B' : 'Eliminate the Wardens or plant the Core', 1800);
  } else if (phase === 'live' && game.bomb.state !== 'planted' && game.phaseTimeLeft <= 0) {
    endRound(TEAM.WARDEN, 'Time expired — the sites hold');
  } else if (phase === 'roundEnd' && game.phaseTimeLeft <= 0) {
    if (!checkMatchEnd()) nextRound();
  }

  // Elimination wins, checked every step (against the live phase value:
  // stepBomb may already have ended the round this step).
  if (game.phase === 'live') {
    const wardensAlive = game.actors.some((a) => a.team === TEAM.WARDEN && a.alive);
    const jackalsAlive = game.actors.some((a) => a.team === TEAM.JACKAL && a.alive);
    if (!wardensAlive && game.bomb.state !== 'planted') endRound(TEAM.JACKAL, 'Wardens eliminated');
    else if (!jackalsAlive && game.bomb.state !== 'planted') endRound(TEAM.WARDEN, 'Jackals eliminated');
    else if (!jackalsAlive && game.bomb.state === 'planted') {
      // A planted Core still ticks: the round ends on the bomb, not the bodies.
    }
  }
}

function clampToSpawn(actor) {
  const c = actor.team === TEAM.JACKAL ? { x: -27, z: 0 } : { x: 27, z: 0 };
  const dx = actor.pos.x - c.x;
  const dz = actor.pos.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d > 8) {
    actor.pos.x = c.x + (dx / d) * 8;
    actor.pos.z = c.z + (dz / d) * 8;
  }
}

function stepBomb(dt) {
  const bomb = game.bomb;
  if (!bomb) return;
  if (bomb.state === 'carried' && bomb.carrier) {
    bomb.pos.copy(bomb.carrier.pos);
    // Plant channel: the carrier stands in a site and channels.
    const carrier = bomb.carrier;
    const site = carrier.alive ? inSite(carrier) : null;
    const channeling = carrier.isPlayer
      ? input.useHeld && !!site
      : carrier.planting;
    if (channeling && site) {
      bomb.plantProgress += dt / RULES.plantTime;
      if (carrier.isPlayer) {
        game.hud.setChannel('PLANTING THE CORE', bomb.plantProgress);
        if ((game.time * 4 | 0) !== (((game.time - dt) * 4) | 0)) sfx.plantBeep((bomb.plantProgress * 4) | 0);
      }
      if (bomb.plantProgress >= 1) {
        bomb.state = 'planted';
        bomb.site = site.id;
        bomb.pos.set(carrier.pos.x, 0, carrier.pos.z);
        bomb.plantedAt = game.time;
        bomb.timeLeft = RULES.bombTime;
        carrier.carryCore = false;
        if (carrier.isPlayer) game.hud.setChannel(null);
        game.hud.banner('CORE PLANTED', `Site ${site.id} — defend it`, 2000);
        game.hud.killfeed(`◆ Core planted at site ${site.id}`);
        sfx.planted();
        for (const a of game.actors) {
          if (a.team === TEAM.JACKAL) a.money = Math.min(RULES.maxMoney, a.money + RULES.rewardPlant);
        }
      }
    } else {
      bomb.plantProgress = 0;
      if (carrier.isPlayer) game.hud.setChannel(null);
    }
    if (carrier.channelReset) { bomb.plantProgress = 0; carrier.channelReset = false; }
  }
  if (bomb.state === 'dropped') {
    for (const a of game.actors) {
      if (a.alive && a.team === TEAM.JACKAL && Math.hypot(a.pos.x - bomb.pos.x, a.pos.z - bomb.pos.z) < 1.15) {
        a.carryCore = true;
        bomb.state = 'carried';
        bomb.carrier = a;
        break;
      }
    }
  }
  if (bomb.state === 'planted') {
    bomb.timeLeft -= dt;
    // The beep quickens as the timer runs down.
    const interval = bomb.timeLeft > 20 ? 1 : bomb.timeLeft > 10 ? 0.5 : 0.25;
    if (game.time >= bomb.beepAt) { bomb.beepAt = game.time + interval; sfx.bombTick(); }
    // Defuse channel by any warden standing on the bomb.
    let defuser = null;
    for (const a of game.actors) {
      if (a.alive && a.team === TEAM.WARDEN && Math.hypot(a.pos.x - bomb.pos.x, a.pos.z - bomb.pos.z) < 1.3 && a.defusing) defuser = a;
    }
    if (defuser) {
      bomb.defuseProgress += dt / RULES.defuseTime;
      if (defuser.channelReset) { bomb.defuseProgress = 0; defuser.channelReset = false; }
      if (bomb.defuseProgress >= 1) {
        bomb.state = 'defused';
        endRound(TEAM.WARDEN, 'The Core was defused');
        return;
      }
    } else {
      bomb.defuseProgress = 0;
    }
    if (bomb.timeLeft <= 0) {
      bomb.state = 'exploded';
      fx.explosionFx(bomb.pos, 6);
      sfx.explosion();
      for (const a of game.actors) {
        if (!a.alive) continue;
        const d = a.pos.distanceTo(bomb.pos);
        if (d < 10) game.onDamage(null, a, 340 * (1 - d / 10), false);
      }
      endRound(TEAM.JACKAL, 'The Core detonated');
    }
  }
}

// --- Camera, viewmodel, render -------------------------------------------------------
const _camPos = new THREE.Vector3();
function poseCamera(frameDt) {
  let view = player;
  if (!player.alive && game.phase === 'live') {
    view = game.actors.find((a) => a.team === player.team && a.alive && !a.isPlayer) || player;
  }
  eyeOf(view, _camPos);
  if (view.isPlayer) _camPos.y = view.pos.y + view.eyeHeight;
  camera.position.copy(_camPos);
  const shake = fx.shakeAmt;
  if (shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * 0.05 * shake;
    camera.position.y += (Math.random() - 0.5) * 0.05 * shake;
  }
  camera.rotation.order = 'YXZ';
  camera.rotation.y = view.yaw;
  camera.rotation.x = view.pitch + fx.recoil + (shake > 0.01 ? (Math.random() - 0.5) * 0.01 * shake : 0);
  camera.rotation.z = 0;
  const targetFov = player.loadout.scoped && player.alive ? 74 / WEAPONS.verdict.zoom : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, frameDt * 14);
    camera.updateProjectionMatrix();
  }
  game.hud.setScope(player.loadout.scoped && player.alive);

  // Viewmodel: only the current gun, hidden while scoped. Bob follows the
  // player's stride; the reload dips the gun; recoil kicks it back.
  const showVm = view.isPlayer && player.alive && !player.loadout.scoped;
  for (const key of Object.keys(viewmodels)) viewmodels[key].visible = showVm && key === player.loadout.current;
  if (showVm) {
    const vm = viewmodels[player.loadout.current];
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const bob = Math.sin(player.stepCycle * Math.PI / 1.3) * 0.012 * Math.min(1, speed / 3);
    vm.position.set(0.24, -0.22 + bob - (player.loadout.reloading > 0 ? Math.sin((1 - player.loadout.reloading / currentDef(player.loadout).reloadTime) * Math.PI) * 0.13 : 0), -0.45 + fx.recoil * 0.7);
    vm.rotation.x = fx.recoil * 1.4;
    muzzlePlane.material.opacity = player.muzzle > 0 ? 0.9 : 0;
    if (player.muzzle > 0) muzzlePlane.rotation.z = Math.random() * Math.PI;
  } else {
    muzzlePlane.material.opacity = 0;
  }

  // Blindness: a white veil that peaks at the pop and drains over the blind.
  const p = player;
  if (p.blindUntil > game.time) {
    const remain = p.blindUntil - game.time;
    const strength = Math.min(1, (p.blindPeak || 0.6)) * Math.min(1, remain / 1.2);
    game.hud.setBlind(strength);
  } else {
    p.blindPeak = 0;
    game.hud.setBlind(0);
  }

  // Site letters always face the camera.
  for (const id of ['A', 'B']) {
    const letter = scene.userData['letter' + id];
    if (letter) letter.lookAt(camera.position.x, 3.4, camera.position.z);
  }
}

// --- Wiring: menu, pointer lock, keys ------------------------------------------------
initInput(renderer.domElement, unlockAudio);
document.getElementById('play').addEventListener('click', () => {
  unlockAudio();
  game.hud.showMenu(false);
  if (game.phase === 'menu') nextRound();
});
document.getElementById('deploy').addEventListener('click', () => {
  game.hud.showBuy(false);
  lockPointer(renderer.domElement);
});
document.getElementById('again').addEventListener('click', () => {
  game.hud.hideEnd();
  game.score = [0, 0];
  game.round = 0;
  for (const a of game.actors) { a.money = RULES.startMoney; a.loadout = makeLoadout(); a.kills = 0; a.deaths = 0; }
  nextRound();
});
renderer.domElement.addEventListener('mousedown', () => {
  if ((game.phase === 'live' || game.phase === 'buy') && !input.locked && game.hud.el.buyMenu.hidden && !shotMode) {
    lockPointer(renderer.domElement);
  }
});
window.addEventListener('keydown', (e) => {
  if (game.phase === 'buy' && (input.locked || input.touchMode)) {
    const map = { Digit1: 'marauder', Digit2: 'longbow', Digit3: 'verdict', Digit4: 'armor', Digit5: 'flash', Digit6: 'shard' };
    if (map[e.code]) game.onBuy(map[e.code]);
  }
  if (e.code === 'KeyB' && game.phase === 'buy') {
    const open = game.hud.el.buyMenu.hidden;
    game.hud.showBuy(open);
    if (!open) lockPointer(renderer.domElement);
  }
  if (e.code === 'Enter' && game.phase === 'buy') {
    game.hud.showBuy(false);
    lockPointer(renderer.domElement);
  }
});

// Right mouse = scope for the Verdict. Tracked as a held key code.
window.addEventListener('mousedown', (e) => { if (e.button === 2) input.keys.add('MouseRight'); });
window.addEventListener('mouseup', (e) => { if (e.button === 2) input.keys.delete('MouseRight'); });
window.addEventListener('contextmenu', (e) => e.preventDefault());

// --- Screenshot modes ------------------------------------------------------------------
// ?shot=start|buy|play|end&seed=N poses a deterministic scene with the real
// simulation state, so the entry's screenshots are honest renders of the
// game's own code: menu over the yard, the buy menu at spawn, a mid-round
// firefight at the crossing, and a planted-Core round end at the Furnace.
function setupShot(name) {
  game.hud.showMenu(false);
  game.score = [3, 2];
  nextRound();
  game.hud.showBuy(false);
  const P = player;
  const bots = game.actors.filter((a) => !a.isPlayer);
  const jackals = bots.filter((b) => b.team === TEAM.JACKAL);
  const wardens = bots.filter((b) => b.team === TEAM.WARDEN);
  const pose = (a, x, z, yawDeg) => {
    a.pos.set(x, 0, z);
    a.yaw = THREE.MathUtils.degToRad(yawDeg);
    a.pitch = 0;
    if (a.mesh) { a.mesh.position.copy(a.pos); a.mesh.rotation.y = a.yaw + Math.PI; }
  };
  if (name === 'start') {
    game.phase = 'live';
    pose(P, -24, 0, -90);
    pose(jackals[0], -22, -2.5, -90);
    pose(jackals[1], -22, 2.5, -90);
    pose(jackals[2], -20, -5, -80);
    pose(jackals[3], -20, 5, -100);
    wardens.forEach((w, i) => pose(w, 18 + i * 2, -11 + i * 3, 90));
    game.hud.showMenu(true);
  } else if (name === 'buy') {
    game.phase = 'buy';
    game.phaseTimeLeft = RULES.buyTime;
    P.money = 4350;
    giveWeapon(P.loadout, 'longbow');
    P.loadout.armor = true;
    pose(P, -27, 0, -90);
    jackals.forEach((b, i) => pose(b, -25 + (i % 2) * 2, -3 + i * 2, -90));
    game.hud.showBuy(true);
  } else if (name === 'play') {
    game.phase = 'live';
    game.phaseTimeLeft = 63;
    giveWeapon(P.loadout, 'longbow');
    P.loadout.armor = true;
    P.hp = 78;
    // North side of the crossing, trading shots down the A-main lane: the
    // mid block is clear of this sightline, two Wardens are in the open.
    pose(P, 5.5, -4.4, 82);
    P.pitch = -0.02;
    pose(jackals[0], 3, -6.8, 96);
    pose(jackals[1], 7.2, -1.2, 84);
    pose(jackals[2], -2, 6, 95);
    pose(jackals[3], -13, -5, 88);
    pose(wardens[0], -3.5, -5.2, -80);
    pose(wardens[1], -9, -2.2, -95);
    pose(wardens[2], 12, -8, 120);
    pose(wardens[3], 20, -12, 90);
    pose(wardens[4], 20, 12, 90);
    wardens[0].hp = 40;
    // A tracer mid-flight and a live muzzle, re-lit every frame by the
    // shot-mode loop below so they are still burning at capture time.
    game.shotTracer = {
      from: new THREE.Vector3(P.pos.x, 1.55, P.pos.z),
      to: new THREE.Vector3(wardens[0].pos.x, 1.15, wardens[0].pos.z),
      team: TEAM.JACKAL,
    };
    game.hud.killfeed('<b>You</b> ▸ <b>Hale</b>');
  } else if (name === 'end') {
    game.phase = 'live';
    giveWeapon(P.loadout, 'longbow');
    pose(P, 15.5, -9.5, -35);
    P.pitch = -0.03;
    pose(jackals[0], 18, -12, -60);
    pose(jackals[1], 23, -10, 140);
    jackals[2].alive = false; if (jackals[2].mesh) jackals[2].mesh.visible = false;
    wardens.forEach((w, i) => { if (i > 1) { w.alive = false; if (w.mesh) w.mesh.visible = false; } });
    pose(wardens[0], 26, -18, 120);
    pose(wardens[1], 12, -14, -120);
    game.bomb.state = 'planted';
    game.bomb.site = 'A';
    game.bomb.pos.set(20.5, 0, -12.5);
    game.bomb.timeLeft = 24;
    game.score = [3, 3];
    game.hud.banner('CORE PLANTED', 'Site A — defend it', 60000);
  }
  for (const a of game.actors) if (a.mesh && a.alive) { a.mesh.position.copy(a.pos); }
  poseCamera(0.016);
  renderer.render(scene, camera);
}

// --- Main loop -----------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let frameDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (shotMode) {
    fx.update(frameDt);
    if (game.shotTracer) {
      fx.tracer(game.shotTracer.from, game.shotTracer.to, game.shotTracer.team);
      player.muzzle = 0.05;
    }
    poseCamera(frameDt);
    game.hud.update(game, now);
    renderer.render(scene, camera);
    return;
  }
  acc += frameDt;
  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
  }
  consumeEdges();
  fx.update(frameDt);
  poseCamera(frameDt);
  game.hud.update(game, now);
  game.hud.showScoreboard(input.keys.has('Tab'));
  // The touch layer shows only while a match is running (see index.html).
  document.body.classList.toggle('playing', game.phase !== 'menu' && game.phase !== 'matchEnd');
  // Live spread estimate for the crosshair.
  const def = currentDef(player.loadout);
  const moveFactor = Math.min(1, Math.hypot(player.vel.x, player.vel.z) / BODY.walkSpeed);
  game.playerSpread = def.spread + def.moveSpread * moveFactor;
  renderer.render(scene, camera);
}

if (shotMode) {
  setupShot(shotMode);
  // Let textures and shadows settle, pose once more, then signal readiness.
  setTimeout(() => {
    poseCamera(0.016);
    renderer.render(scene, camera);
    window.__shotReady = true;
  }, 500);
}
requestAnimationFrame(frame);
