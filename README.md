# 🏰 Castle Ball II — Rules Configurator + 16-bit Game

> *"Hold the castle. Own the diamond."*

Castle Ball II is the sequel to [Castle Ball](https://github.com/mattarnot-hub/castleball). It keeps the original **interactive rules configurator** and adds a **playable 16-bit arcade game** — *Gate Defense* — a SNES-styled simulation of the sport.

- **[`index.html`](index.html)** — the rules configurator (design your variant, tune scoring, export a spec).
- **[`game.html`](game.html)** — 🎮 **Gate Defense**, the 16-bit playable game.

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

## 🎮 Gate Defense — the 16-bit game

A self-contained arcade game in [`game.html`](game.html), rendered at **true SNES resolution (256×224)** with integer scaling, scanlines, a CRT vignette, and chiptune blips. It uses the classic SNES-baseball two-camera setup (à la *Nolan Ryan's Baseball*):

- **Batting camera — behind the catcher.** Low to the field, looking out at the pitcher on the mound. The pitch comes toward you down one of three lanes (inside / middle / outside), growing as it nears the plate, while you peer through the **Castle Gate** net in the foreground. Line up your **racket**, time the swing.
- **Fielding camera — the full field.** The moment you make contact, the view cuts to a wide aerial shot of the whole diamond and outfield, where **all 9 fielders break in unison** toward the ball (simplified, just like the SNES original) before the play resolves.

Whiff and the ball sails past you into the Gate for a **defensive Gate Goal**.

**Controls**
| Action | Keys |
|---|---|
| Move racket (lane) | `←` `→` / `A` `D` |
| Swing | `Space` / `Z` / tap the screen |
| Start / continue | `Space` / tap |

**How outcomes map to the rules** — swing quality is driven by lane match + timing precision: a golden center-lane hit can complete the full circuit (**1,000**), a clean hit is a **Home Run (100)**, tighter timing yields **3rd/2nd/1st**, an edge-of-racket bloop lands in **No Man's Land (50)**, and any miss feeds the **Gate (+50 to the defense)** and costs an out. Nine outs ends the game — hold the castle.

### A note on the SNES inspiration

This game was requested alongside *Nolan Ryan's Baseball* for the SNES. That ROM is **copyrighted commercial software** and its gameplay can't realistically be reprogrammed into a different sport (it's 1992 machine code with no source or API), so it is **not** included or redistributed here. Instead, *Gate Defense* is an **original** game built from scratch that captures the 16-bit sports-title *feel* while implementing Castle Ball's actual rules. Use the ROM + an emulator locally only as visual reference if you like.

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
├── game.html     ← 16-bit Gate Defense game
├── _headers      ← Cloudflare Pages security headers
├── .gitignore    ← keeps ROMs / emulators out of the repo
└── README.md     ← this file
```

---

*Castle Ball is an original sport concept. All rights reserved. Gate Defense is an original game and is not affiliated with any commercial title.*
