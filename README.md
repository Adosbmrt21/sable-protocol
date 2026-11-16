# Goblok Openfire — a three.js tactical FPS

A round-based tactical first-person shooter in the browser, in the style
Counter-Strike made famous — but its own game throughout: its own map
(Foundry Nine), teams (Wardens vs Jackals), weapons, objective (plant the
Core at the Furnace or the Vault) and synthesized sound. Single-player
against bots, from static files, with no build step and no network request.

The lobby offers two modes: **Duel (1 vs 1)** — you against a single
Warden, first to 5 rounds with 60-second rounds — and **Strike (5 vs 5)**,
the full squad match, first to 9 with 100-second rounds. Both run the same
simulation; the duel simply benches the other nine fighters.

The fighters are blocky toy figures in the brick-toy tradition — yellow
heads with a grin, team-coloured torsos, hinged limbs that swing as they
walk — fighting across a bright midday foundry of seamed steel panels,
under a gradient sky, with ACES tone mapping. The interface matches:
chunky rounded panels, hard shadows, segmented health blocks and a banner
that pops.

## Play it

```sh
node serve.ts            # Node 22, standard library only
# open http://localhost:8080
```

Click **Play**, gear up in the buy phase, then **Deploy**. First team to 9
rounds wins the match.

On a phone or tablet the game is fully touch-playable: a virtual joystick
moves, dragging on the view looks, and every action has its own button —
FIRE, SCOPE, JUMP and CRCH around the right thumb, plus a strip with
reload, use/plant, both grenades, both weapon slots, walk, buy and scores.
The touch layer writes the same input state as the keyboard and mouse, so
the simulation cannot tell the difference.

| Key | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Click | Fire (right-click scopes the Verdict) |
| Shift / Ctrl | Walk quietly / crouch |
| R | Reload |
| 1 / 2 | Pistol / primary |
| E (hold) | Plant the Core inside a site |
| F / G | Flash Charge / Shard grenade |
| B | Buy menu · Tab Scoreboard |

Shots land true when you stop moving: spread grows with movement and
sustained fire, so counter-strafing and tapping beat spraying.

## How it works

- `game/` — the whole game as static ES modules. `game/index.html` maps the
  bare specifier `three` to the vendored three.js 0.187.0 in
  `game/vendor/three/` through one import map.
- `game/src/` — one module per job:
  - `config.js` — palette, teams, weapon table, economy, round rules.
  - `map.js` — Foundry Nine: one wall list drives the geometry, circle
    collision, bullet/sight ray tests and the waypoint graph bots travel.
  - `player.js` — the human's movement: acceleration, friction, crouch,
    jump, footsteps bots can hear.
  - `bots.js` — bot bodies and brains: waypoint routes, site holds,
    line-of-sight and hearing perception, burst fire and strafing.
  - `weapons.js` — hitscan gunfire against wall boxes and head/chest body
    spheres, recoil bloom, grenades that arc, bounce, blind and fragment.
  - `hud.js` — health, ammo, money, clock, kill feed, buy menu, scoreboard
    and a live minimap.
  - `input.js` — keyboard, pointer-lock mouse and the mobile touch layer
    (joystick, drag look, full button set) behind one state object.
  - `audio.js` — every sound synthesized in WebAudio; there are no audio
    files.
  - `main.js` — the match: a fixed-step (120 Hz) simulation kept apart from
    rendering, round flow, the Core's plant/defuse/detonation, damage and
    deaths, effects, the camera, and the deterministic `?shot=` screenshot
    modes.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the kit's library.
- `screenshots/` — four renders of the game itself, taken with the
  `?shot=start|buy|play|end` modes listed in `shots.json`.

The simulation runs at a fixed 120 Hz step; rendering interpolates nothing
and allocates nothing per frame in its hot loops (tracers, impact flashes
and grenades are pooled).

## License

MIT — see `LICENSE`. three.js is vendored under its own license in
`game/vendor/three/LICENSE`.
