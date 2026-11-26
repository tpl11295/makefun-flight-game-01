# Dawn Run — a flight game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/tpl11295/makefun-flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/tpl11295/makefun-flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Take off at dawn in a little red prop plane. Thread six glowing rings
over a river valley, mind your fuel, and bring her home to the far
runway. A complete flight game in plain static files — no build step,
no network request, no library.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

- **↑ / ↓** pitch, **← / →** bank and turn, **W / S** or **Shift / Ctrl** throttle
- **Mouse** steers too — point where you want to go
- **G** landing gear, **M** mute, **R** fly again, **Enter** start

## The flight

1. **Takeoff** — spool up on the home strip and rotate at 66 kt.
2. **Ring run** — six rings over the valley, each worth 500 points. The
   route bends over the river, past the town, and climbs between hills.
3. **Landing** — come home to the far runway, gear down, gentle and slow.
   Fuel and time bonuses reward a clean sortie; a hard landing, a
   terrain strike, or an empty tank ends it.

## What you see

A chase view over recognisable terrain — dawn sky, a river and a road
winding through fields, a town, and two lit runways — with the aircraft
in frame, a compass tape, speed and altitude tapes, an artificial
horizon, and fuel and throttle gauges, all lit.

## Layout

- `game/index.html` — the page, one canvas
- `game/src/config.js` — tuning and world layout
- `game/src/random.js` — seeded randomness
- `game/src/world.js` — state, terrain and the flight model
- `game/src/render.js` — perspective terrain, plane and HUD
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised engine, wind and chimes
- `game/src/shots.js` — deterministic autopilot screenshot scenes
- `game/src/main.js` — the game loop
- `main.ts` — hands the game in; `serve.ts` serves it locally

Entry for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057).
