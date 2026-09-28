/* CastleBall Game Physics — parameter tables (v2).
   All coefficients live here so they can be recalibrated after real-world tests.
   Values are ESTIMATES tuned so familiar balls land near familiar results. */
(function (root) {
  'use strict';
  var P = {
    // ── physical constants (SI) ──
    g: 9.81,
    R_dry: 287.05, R_vap: 461.5,      // gas constants J/(kg·K)
    mu_air: 1.81e-5,                  // air viscosity Pa·s
    OZ: 28.35,                        // grams per ounce
    IN: 25.4,                         // mm per inch
    FT: 0.3048,                       // m per foot
    MPH: 0.44704,                     // m/s per mph

    // ── core types: restitution eb, ball stiffness kb (N/m), inertia factor k = I/(m r²) ──
    cores: {
      Hard:    { eb: 0.50, kb: 7.0e6, k: 0.40, analog: 'Baseball / solid printed ball' },
      Jelly:   { eb: 0.40, kb: 2.0e5, k: 0.40, analog: 'Gel or TPU-lattice core' },
      Air:     { eb: 0.75, kb: 3.0e4, k: 0.60, analog: 'Tennis ball / pickleball' },
      Layered: { eb: 0.70, kb: 6.0e4, k: 0.57, analog: 'Heavy-walled pressurized ball' },
      Rattle:  { eb: 0.65, kb: 6.0e4, k: 0.57, analog: 'Shell as Layered; inner ball simulated' }
    },

    // ── exterior surfaces: drag-crisis + spin-grip + asymmetric force ──
    exteriors: {
      'Smooth':           { CdLow: 0.47, CdHigh: 0.12, ReCrit: 3.0e5, kMag: 0.6, Casym: 0.00 },
      'Dimpled':          { CdLow: 0.45, CdHigh: 0.24, ReCrit: 7.0e4, kMag: 1.1, Casym: 0.00 },
      'Seamed':           { CdLow: 0.40, CdHigh: 0.30, ReCrit: 1.5e5, kMag: 1.0, Casym: 0.10 },
      'Split-face':       { CdLow: 0.44, CdHigh: 0.28, ReCrit: 1.2e5, kMag: 0.9, Casym: 0.25 },
      'Holes (even)':     { CdLow: 0.55, CdHigh: 0.55, ReCrit: 1e12,  kMag: 0.7, Casym: 0.00 },
      'Holes (one side)': { CdLow: 0.55, CdHigh: 0.55, ReCrit: 1e12,  kMag: 0.7, Casym: 0.35 }
    },

    // ── batter reference swing speed at the string-bed centre (m/s) ──
    batters: { Kid: 20, Teen: 26, Adult: 32, Pro: 38 },

    // ── batter timing / contact error (σ, SI: s and m) ──
    batterErr: {
      Kid:   { timing: 0.015, vert: 0.025, sweet: 0.040 },
      Teen:  { timing: 0.011, vert: 0.020, sweet: 0.035 },
      Adult: { timing: 0.008, vert: 0.015, sweet: 0.030 },
      Pro:   { timing: 0.005, vert: 0.010, sweet: 0.020 }
    },

    // ── pitch types ──
    pitches: {
      Fastball:  { rpm: 2200, axis: 'backspin',  desc: 'Magnus lift, less drop' },
      Curveball: { rpm: 2500, axis: 'topspin45', desc: 'Drop and sideways break' },
      Slider:    { rpm: 2400, axis: 'sidespin',  desc: 'Sideways break' },
      Drifter:   { rpm: 60,   axis: 'knuckle',   desc: 'Asymmetric wander' },
      Custom:    { rpm: 1500, axis: 'custom',    desc: 'Set spin + axis' }
    },

    // ── ground surfaces ──
    surfaces: {
      'Outfield grass': { e: 0.45, mu: 0.40, roll: 1.5 },
      'Infield dirt':   { e: 0.40, mu: 0.45, roll: 2.0 },
      'Gym hardwood':   { e: 0.75, mu: 0.25, roll: 0.3 }
    },

    // ── printable / fill material densities (g/cm³) ──
    materials: {
      shell:    { 'TPU': 1.21, 'PETG': 1.27 },
      membrane: { 'TPU': 1.21, 'Sand-epoxy': 2.0, 'Metal-filled': 3.5, 'Steel-shot': 4.5, 'Custom': null },
      inner:    { 'Glass': 2.5, 'Brass': 8.5, 'Steel': 7.85, 'Tungsten carbide': 15.6 }
    },

    // ── string bed ──
    strings: { es: 0.93, kBase: 30000, Tref: 55, gaugeRef: 1.30, xmax: 0.06 },

    // ── racket geometry / collision ──
    racket: { length: 0.686, impactPt: 0.52, pivot: 0.10, Iref: 0.032, mu_s: 0.4 },

    // ── rattle two-body ──
    rattle: { er: 0.30, mu_r: 0.30 },

    // ── asymmetric wake ──
    asym: { w0: 60 },               // rad/s: spin at which the rough-side force has faded to 1/e

    spinDecayBase: 5.0,             // s (at k = 0.4)

    // ── environment defaults ──
    env: { T: 20, h: 0, RH: 0.5, wind: 0, windDir: 0 },
    pitchDist: { outdoor: 18.44, indoor: 14.0 },
    pitchSpeed: { outdoor: 30, indoor: 20 },
    boxSize: 1.2,

    // ── field (m) ──
    field: { bases: 27.4, fenceLine: 99, fenceCenter: 122, gymX: 26, gymZ: 15, plateY: 0.8, releaseY: 1.8 }
  };

  // ── ball presets (fill every input at once) ──
  P.presets = [
    { name: 'Baseball',            mass: 145, d: 74, core: 'Hard',  ext: 'Seamed' },
    { name: 'Tennis ball',         mass: 57,  d: 67, core: 'Air',   ext: 'Smooth' },
    { name: 'Pickleball',          mass: 26,  d: 74, core: 'Air',   ext: 'Holes (even)' },
    { name: 'Wiffle ball',         mass: 21,  d: 73, core: 'Air',   ext: 'Holes (one side)' },
    { name: 'Golf ball',           mass: 46,  d: 43, core: 'Hard',  ext: 'Dimpled' },
    { name: 'CastleBall Power',    mass: 145, d: 74, core: 'Hard',  ext: 'Dimpled' },
    { name: 'CastleBall Seamed',   mass: 90,  d: 74, core: 'Hard',  ext: 'Seamed' },
    { name: 'CastleBall Split',    mass: 70,  d: 74, core: 'Jelly', ext: 'Split-face' },
    { name: 'CastleBall Layered',  mass: 145, d: 74, core: 'Layered', ext: 'Seamed',
      layered: { shellMm: 1.5, shellMat: 'TPU', memMm: 3.5, memDensity: 2.3 } },
    { name: 'CastleBall Rattle',   mass: 123, d: 74, core: 'Rattle', ext: 'Split-face',
      rattle: { shellMm: 1.5, shellMat: 'TPU', memMm: 3.5, memMat: 'TPU', innerMm: 20, innerMat: 'Steel' } },
    { name: 'CastleBall Indoor',   mass: 35,  d: 74, core: 'Air',   ext: 'Holes (one side)' }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else root.PhysParams = P;
})(typeof self !== 'undefined' ? self : this);
