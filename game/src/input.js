// SABLE PROTOCOL — input. Keyboard state, mouse look through pointer lock,
// and one-shot action edges (fire pressed, reload pressed, number keys) that
// the fixed-step simulation consumes exactly once. The sim never reads the
// DOM; it reads this object.

export const input = {
  keys: new Set(),
  lookDX: 0,
  lookDY: 0,
  firing: false,
  firePressed: false,
  reloadPressed: false,
  jumpPressed: false,
  useHeld: false,
  usePressed: false,
  buyPressed: false,
  scorePressed: false,
  grenadePressed: null, // 'flash' | 'shard' | null
  slotPressed: 0,       // 1..3 weapon slot edge
  locked: false,
};

const SLOT_KEYS = { Digit1: 1, Digit2: 2, Digit3: 3 };

export function initInput(canvas, onFirstGesture) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'KeyR') input.reloadPressed = true;
      if (e.code === 'Space') input.jumpPressed = true;
      if (e.code === 'KeyE') { input.useHeld = true; input.usePressed = true; }
      if (e.code === 'KeyB') input.buyPressed = true;
      if (e.code === 'Tab') input.scorePressed = true;
      if (e.code === 'KeyG') input.grenadePressed = 'shard';
      if (e.code === 'KeyF') input.grenadePressed = 'flash';
      if (SLOT_KEYS[e.code]) input.slotPressed = SLOT_KEYS[e.code];
    }
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyE') input.useHeld = false;
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.firing = false;
    input.useHeld = false;
  });

  canvas.addEventListener('mousedown', (e) => {
    onFirstGesture && onFirstGesture();
    if (!input.locked) return;
    if (e.button === 0) { input.firing = true; input.firePressed = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.lookDX += e.movementX || 0;
    input.lookDY += e.movementY || 0;
  });

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) input.firing = false;
  });
}

export function lockPointer(canvas) {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
}

export function moveAxes() {
  const k = input.keys;
  let x = 0;
  let z = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  return { x, z };
}

export function crouchHeld() {
  return input.keys.has('ControlLeft') || input.keys.has('ControlRight') || input.keys.has('KeyC');
}

export function walkHeld() {
  return input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
}

// Called at the end of every simulation step: edges are one-shot, axes and
// held state persist. Mouse deltas are consumed by the player each step.
export function consumeEdges() {
  input.firePressed = false;
  input.reloadPressed = false;
  input.jumpPressed = false;
  input.usePressed = false;
  input.buyPressed = false;
  input.scorePressed = false;
  input.grenadePressed = null;
  input.slotPressed = 0;
}
