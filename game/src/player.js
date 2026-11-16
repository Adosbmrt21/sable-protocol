// SABLE PROTOCOL — the human player's body. Mouse look, acceleration-based
// movement with friction, crouching, jumping and wall collision, all stepped
// at the simulation's fixed rate so the feel does not depend on frame rate.
// The camera and viewmodel are posed by main.js from the state kept here.

import * as THREE from 'three';
import { BODY } from './config.js';
import { collideCircle } from './map.js';
import { input, moveAxes, crouchHeld, walkHeld } from './input.js';
import { sfx } from './audio.js';

const SENS = 0.0021;

export function makePlayerActor(spawn, team) {
  return {
    isPlayer: true,
    team,
    name: 'You',
    alive: true,
    hp: 100,
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    vel: new THREE.Vector3(),
    yaw: team === 1 ? -Math.PI / 2 : Math.PI / 2, // Jackals face east, Wardens west
    pitch: 0,
    crouch: false,
    onGround: true,
    eyeHeight: BODY.standEye,
    stepCycle: 0,
    wasAirborne: false,
    lastShotAt: -99,
    lastStepAt: -99,
    stepVolume: 1,
    blindUntil: -1,
    muzzle: 0,
    carryCore: false,
    aimDir(out) {
      const cp = Math.cos(this.pitch);
      return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    },
  };
}

export function stepPlayer(game, actor, dt) {
  // Look.
  actor.yaw -= input.lookDX * SENS;
  actor.pitch -= input.lookDY * SENS;
  actor.pitch = Math.max(-1.45, Math.min(1.45, actor.pitch));
  input.lookDX = 0;
  input.lookDY = 0;

  actor.crouch = crouchHeld();
  const targetEye = actor.crouch ? BODY.crouchEye : BODY.standEye;
  actor.eyeHeight += (targetEye - actor.eyeHeight) * Math.min(1, dt * 11);

  // Wish direction in world space from the camera yaw.
  const axes = moveAxes();
  const sin = Math.sin(actor.yaw);
  const cos = Math.cos(actor.yaw);
  const wishX = (-sin * -axes.z) + (cos * axes.x);
  const wishZ = (-cos * -axes.z) + (-sin * axes.x);
  const wishLen = Math.hypot(wishX, wishZ) || 1;
  const weaponSlow = game.weaponMoveScale(actor);
  let maxSpeed = BODY.walkSpeed * weaponSlow;
  if (actor.crouch) maxSpeed = BODY.crouchSpeed;
  else if (walkHeld()) maxSpeed = BODY.walkSpeed * 0.52;

  const hasInput = axes.x !== 0 || axes.z !== 0;
  const accel = actor.onGround ? BODY.accel : BODY.airAccel;
  if (hasInput) {
    actor.vel.x += (wishX / wishLen) * accel * dt;
    actor.vel.z += (wishZ / wishLen) * accel * dt;
  }

  // Friction (only with no input held: holding a key drives through it) and
  // the speed cap on the ground plane.
  if (actor.onGround) {
    if (!hasInput) {
      const f = Math.max(0, 1 - BODY.friction * dt);
      actor.vel.x *= f;
      actor.vel.z *= f;
    }
    const sp = Math.hypot(actor.vel.x, actor.vel.z);
    if (sp > maxSpeed) {
      actor.vel.x *= maxSpeed / sp;
      actor.vel.z *= maxSpeed / sp;
    }
  }

  // Jump and gravity.
  if (input.jumpPressed && actor.onGround && !actor.crouch) {
    actor.vel.y = BODY.jumpSpeed;
    actor.onGround = false;
    sfx.jump();
  }
  actor.vel.y -= BODY.gravity * dt;
  actor.pos.x += actor.vel.x * dt;
  actor.pos.z += actor.vel.z * dt;
  actor.pos.y += actor.vel.y * dt;
  if (actor.pos.y <= 0) {
    if (!actor.onGround && actor.wasAirborne) sfx.land();
    actor.pos.y = 0;
    actor.vel.y = 0;
    actor.onGround = true;
    actor.wasAirborne = false;
  } else {
    actor.wasAirborne = true;
  }
  collideCircle(actor.pos, BODY.radius);

  // Footsteps: distance-based, quieter walking or crouched (bots listen).
  const speed = Math.hypot(actor.vel.x, actor.vel.z);
  if (actor.onGround && speed > 0.6) {
    actor.stepCycle += speed * dt;
    const stride = walkHeld() || actor.crouch ? 3.4 : 2.6;
    if (actor.stepCycle > stride) {
      actor.stepCycle = 0;
      actor.lastStepAt = game.time;
      actor.stepVolume = actor.crouch || walkHeld() ? 0.3 : 1;
      sfx.step(actor.stepVolume >= 1);
    }
  }
}
