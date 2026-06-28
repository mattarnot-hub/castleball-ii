# 🏰 Castle Ball II — Rules Configurator + 16-bit Game

> *"Hold the castle. Own the diamond."*

Castle Ball II is the sequel to [Castle Ball](https://github.com/mattarnot-hub/castleball). It keeps the original **interactive rules configurator** and adds a **playable stadium baseball-style game** — *Stadium Sim* — a console-baseball-styled simulation of the sport.

- **[`index.html`](index.html)** — the rules configurator (design your variant, tune scoring, export a spec).
- **[`game.html`](game.html)** — 🎮 **Stadium Sim**, the playable game (bat + field).

---

## What is Castle Ball?

Castle Ball is played on a standard baseball diamond with one key addition: a **soccer-sized Castle Gate net** installed behind home plate. The batter defends the net with a **tennis racket** while also trying to hit and run bases.

### Core mechanics
- **Pitcher** tries to throw past the batter and score through the Castle Gate
- **Batter** defends the net with a racket and hits into play
- **Base runners** can carry rackets and deflect teammate shots within a 6ft zone around each base (into the outfield only)
- **Defense** can smash the ball back through the Gate to end the inning
- **Mixed league**: 50% men / 50% women on the field at all times

### Scoring
| Event | Default Points |
|---|---|
| Score at Home (full circuit) | 1,000 |
| 3rd Base | 80 |
| 2nd Base | 40 |
| 1st Base | 10 |
| Home Run (stands) | 100 |
| No Man's Land hit | 50 |
| Gate Goal (defense) | 50 |

---

## 🎮 Stadium Sim — the playable game

A self-contained stadium sim in [`game.html`](game.html), rendered at **512×448** with gradient field/sky shading, a full crowd, scoreboards, and chiptune blips — a higher-fidelity take in the spirit of 16-bit/early-3D console baseball games. You play **both sides of the ball**, with a real baseball loop layered over Castle Ball:

- **Batting camera — behind the plate.** A stadium view looking out at the **CPU pitcher** on the mound, who throws toward the net at varied spots. Slide your **racket** across the **wide batter's box** (the center three lanes are the strike zone) and time your swing.
- **Fielding camera — the full field.** The moment you make contact, the view cuts to the whole diamond + outfield, and **you control all nine fielders moving together in unison** — one input shifts the entire formation around its general area (faithful to how the 16-bit originals did it). Cover the ball's landing spot to record the out; let it drop into a gap for a hit.

**Baseball functionality:** balls / strikes / outs tracked on a **B-S-O scoreboard**, **4 balls = walk**, **3 strikes = strikeout** (the ball reaches the **Castle Gate** for a +50 defensive Gate Goal), 3 outs per inning, **3 innings** per game.

**Controls**
| Phase | Keys |
|---|---|
| Bat — aim racket | `←` `→` / `A` `D` |
| Bat — swing | `Space` / `Z` / tap |
| Field — move whole defense in unison | `←` `→` `↑` `↓` / `WASD` |
| Start / continue | `Space` / tap |

**Scoring** — base hits award Castle Ball points by depth (single 10 / no-man's-land 50 / double 40 / triple 80 / home run 100) and each run home is worth **1,000**; strikeouts feed the **Gate** (+50 to the defense).

### A note on the inspiration & art

This game was requested in the style of *Nolan Ryan's Baseball* for the SNES. That ROM is **copyrighted commercial software** and can't be reprogrammed into a different sport (it's machine code with no source or API), so it is **not** included or redistributed here. *Castle Ball II* is an **original** game — its sprites, stadium, scoreboards, names, and UI are all drawn from scratch — that captures the genre's *look and feel* and functionality while implementing Castle Ball's own rules. Use the ROM + an emulator locally only as personal visual reference if you like.

---

## Deploy

Both pages are plain `.html` files — no build step, no dependencies, no framework.

### Cloudflare Pages (recommended)
1. Connect this repo in [Cloudflare Pages](https://pages.cloudflare.com)
2. Build settings: **leave everything blank**
3. Deploy → `index.html` is the configurator, `/game.html` is the game

### Local
Just open `index.html` or `game.html` in a browser.

```bash
start index.html       # Windows
open index.html        # macOS
xdg-open index.html    # Linux
```

---

## File structure
```
castleball-ii/
├── index.html    ← rules configurator
├── game.html     ← Stadium Sim game (bat + field)
├── _headers      ← Cloudflare Pages security headers
├── .gitignore    ← keeps ROMs / emulators out of the repo
└── README.md     ← this file
```

---

*Castle Ball is an original sport concept. All rights reserved. Stadium Sim is an original game with original art and is not affiliated with any commercial title.*
