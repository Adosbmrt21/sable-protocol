// SABLE PROTOCOL — input. Keyboard state, mouse look through pointer lock,
// one-shot action edges (fire pressed, reload pressed, number keys) that the
// fixed-step simulation consumes exactly once, and a full touch layer for
// mobile: a virtual joystick, drag-to-look on the view, and a button for
// every desktop feature. Touch writes into the same fields the keyboard and
// mouse use, so the sim never reads the DOM and never knows the difference.

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
  // Touch state.
  touchMode: false,
  touchMove: { x: 0, z: 0 }, // joystick axes, -1..1, folded into moveAxes()
  touchCrouch: false,        // CRCH toggle
  touchWalk: false,          // WALK toggle
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

  initTouchControls(canvas, onFirstGesture);
}

export function lockPointer(canvas) {
  // Touch devices have no pointer lock: the drag-look layer replaces it.
  if (input.touchMode) return;
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
  x += input.touchMove.x;
  z += input.touchMove.z;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return { x, z };
}

export function crouchHeld() {
  return input.touchCrouch || input.keys.has('ControlLeft') || input.keys.has('ControlRight') || input.keys.has('KeyC');
}

export function walkHeld() {
  return input.touchWalk || input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
}

// --- Touch controls ---------------------------------------------------------
// The DOM layer lives in index.html (#touchui) and is only shown on touch
// devices during a match (body.touch.playing), but the handlers are wired
// unconditionally so a hybrid device can switch mid-session. Every handler
// writes the same input fields the keyboard and mouse use.
function initTouchControls(canvas, onFirstGesture) {
  const $ = (id) => document.getElementById(id);
  const enable = () => {
    if (!input.touchMode) {
      input.touchMode = true;
      document.body.classList.add('touch');
    }
  };
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) enable();
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') enable(); }, { passive: true });

  // Dragging on the view looks around, at a touch-tuned sensitivity.
  let lookId = null;
  let lookX = 0;
  let lookY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    enable();
    onFirstGesture && onFirstGesture();
    lookId = e.pointerId;
    lookX = e.clientX;
    lookY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    input.lookDX += (e.clientX - lookX) * 2.4;
    input.lookDY += (e.clientY - lookY) * 2.4;
    lookX = e.clientX;
    lookY = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  // Virtual joystick: a fixed base, the knob follows the thumb within it.
  const joy = $('joy');
  const knob = $('joy-knob');
  if (joy && knob) {
    let joyId = null;
    const R = 44;
    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };
    const steer = (e) => {
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      setKnob(dx, dy);
      input.touchMove.x = dx / R;
      input.touchMove.z = dy / R;
    };
    joy.addEventListener('pointerdown', (e) => {
      enable();
      joyId = e.pointerId;
      try { joy.setPointerCapture(e.pointerId); } catch (_) {}
      steer(e);
      e.preventDefault();
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) steer(e); });
    const endJoy = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      input.touchMove.x = 0;
      input.touchMove.z = 0;
      setKnob(0, 0);
    };
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);
  }

  // Buttons: hold = a level while pressed, tap = a one-shot edge,
  // toggle = flips a held state and lights the button.
  const hold = (id, down, up) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      enable();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      down();
      e.preventDefault();
    });
    const end = () => { if (up) up(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };
  const tap = (id, fn) => hold(id, fn, null);
  const toggle = (id, fn) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      enable();
      fn(el.classList.toggle('on'));
      e.preventDefault();
    });
  };

  hold('t-fire',
    () => { input.firing = true; input.firePressed = true; },
    () => { input.firing = false; });
  hold('t-use',
    () => { input.useHeld = true; input.usePressed = true; },
    () => { input.useHeld = false; });
  hold('t-score',
    () => input.keys.add('Tab'),
    () => input.keys.delete('Tab'));
  tap('t-jump', () => { input.jumpPressed = true; });
  tap('t-reload', () => { input.reloadPressed = true; });
  tap('t-flash', () => { input.grenadePressed = 'flash'; });
  tap('t-shard', () => { input.grenadePressed = 'shard'; });
  tap('t-slot1', () => { input.slotPressed = 1; });
  tap('t-slot2', () => { input.slotPressed = 2; });
  tap('t-buy', () => {
    // The buy toggle lives on a window keydown listener in main.js; a real
    // dispatched key event keeps one code path for keyboard and touch.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB' }));
  });
  toggle('t-scope', (on) => { if (on) input.keys.add('MouseRight'); else input.keys.delete('MouseRight'); });
  toggle('t-crouch', (on) => { input.touchCrouch = on; });
  toggle('t-walk', (on) => { input.touchWalk = on; });

  // Keep the page from scrolling or zooming under the player's thumbs.
  document.addEventListener('touchmove', (e) => { if (input.touchMode) e.preventDefault(); }, { passive: false });
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
