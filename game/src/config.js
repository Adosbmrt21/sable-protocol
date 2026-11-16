// SABLE PROTOCOL — shared configuration.
// One place for the numbers the rest of the game reads: the palette, the two
// teams, the weapon table, the economy and the round rules. Nothing here
// touches the DOM or three.js, so the simulation and the HUD read the same
// values and can never drift apart.

// The look: a dusk foundry. Slate steel, rust, sand and one teal signal colour.
export const PALETTE = {
  sky: 0x2b3644,
  fog: 0x39434f,
  ground: 0x8a7a5f,
  groundDark: 0x6f6152,
  wall: 0x707a86,
  wallDark: 0x4d565f,
  trim: 0xb0562f,
  crate: 0x977950,
  crateDark: 0x77603c,
  metal: 0x59636d,
  siteA: 0xe07b39,
  siteB: 0x3fa7a0,
  warden: 0x7fa6c9,
  jackal: 0xd98a4a,
  lightWarm: 0xffd9a0,
  lightCool: 0xbcd3e6,
};

// Teams. The player always leads the Jackals (attack): they carry the Core
// and plant it; the Wardens defend the two sites and defuse.
export const TEAM = { WARDEN: 0, JACKAL: 1 };
export const TEAM_NAME = ['Wardens', 'Jackals'];
export const TEAM_SIZE = 5;

// Round and match rules.
export const RULES = {
  roundTime: 100,          // seconds on the round clock
  buyTime: 12,             // seconds of buy phase before the barriers drop
  endTime: 5,              // seconds the round-end banner holds
  bombTime: 40,            // seconds from plant to detonation
  plantTime: 3.2,          // hold-to-plant channel
  defuseTime: 8,           // hold-to-defuse channel
  winTarget: 9,            // rounds to win the match
  maxRounds: 16,
  startMoney: 800,
  maxMoney: 9000,
  rewardWin: 1400,
  rewardLoss: 1400,
  rewardKill: 300,
  rewardPlant: 300,        // extra for the planter's whole team
  rewardPlantedLoss: 800,  // attackers still earn this if a planted round is lost
};

// The arsenal. Damage is per pellet/bullet at point blank; falloff is applied
// by range in weapons.js. spread is in radians at rest; moveSpread is the
// extra cone while moving at full speed — standing still to shoot pays.
export const WEAPONS = {
  kestrel: {
    label: 'Kestrel Pistol', slot: 1, price: 0, auto: false,
    damage: 26, headMult: 3.2, rpm: 340, mag: 12, reserve: 96,
    reloadTime: 1.4, spread: 0.011, moveSpread: 0.05, recoil: 0.011,
    range: 60, falloff: 0.55, moveSpeed: 1.0, zoom: 1,
  },
  marauder: {
    label: 'Marauder SMG', slot: 2, price: 1400, auto: true,
    damage: 19, headMult: 2.6, rpm: 800, mag: 32, reserve: 128,
    reloadTime: 2.0, spread: 0.02, moveSpread: 0.075, recoil: 0.008,
    range: 45, falloff: 0.5, moveSpeed: 0.98, zoom: 1,
  },
  longbow: {
    label: 'Longbow Rifle', slot: 2, price: 2700, auto: true,
    damage: 34, headMult: 3.4, rpm: 620, mag: 30, reserve: 120,
    reloadTime: 2.3, spread: 0.008, moveSpread: 0.085, recoil: 0.014,
    range: 90, falloff: 0.7, moveSpeed: 0.94, zoom: 1.15,
  },
  verdict: {
    label: 'Verdict Sniper', slot: 2, price: 4300, auto: false,
    damage: 108, headMult: 2.2, rpm: 42, mag: 5, reserve: 30,
    reloadTime: 3.1, spread: 0.0015, moveSpread: 0.12, recoil: 0.06,
    range: 160, falloff: 0.92, moveSpeed: 0.9, zoom: 3.2,
  },
};
export const PRIMARY_ORDER = ['marauder', 'longbow', 'verdict'];

export const GRENADES = {
  flash: { label: 'Flash Charge', price: 200, key: 'flash' },
  shard: { label: 'Shard Grenade', price: 300, key: 'shard' },
};
export const ARMOR_PRICE = 650;

// Player and bot bodies: one capsule, tested as two spheres (see combat in
// weapons.js and bots.js). Eye height and radii are shared so a shot that
// looks right also lands right.
export const BODY = {
  radius: 0.36,
  standEye: 1.62,
  crouchEye: 1.08,
  headY: 1.52,
  headR: 0.21,
  chestY: 0.92,
  chestR: 0.37,
  walkSpeed: 4.6,
  crouchSpeed: 2.2,
  accel: 42,
  airAccel: 6,
  friction: 11,
  jumpSpeed: 4.6,
  gravity: 12.5,
};
