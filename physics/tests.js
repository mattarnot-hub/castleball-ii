/* CastleBall Game Physics — validation suite. Runs in Node (node physics/tests.js) and in the browser. */
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.PhysEngine;
  var P = E.P;
  var ENV = { T: 20, h: 0, RH: 0.5, wind: 0, windDir: 0 };
  function preset(name) { for (var i = 0; i < P.presets.length; i++) if (P.presets[i].name === name) return JSON.parse(JSON.stringify(P.presets[i])); }
  function racket(o) { return Object.assign({ mass: 320, balance: 34, gauge: 1.30, tension: 55, batter: 'Adult', swing: 10, face: 'Auto' }, o || {}); }
  function std(arr) { var m = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; return Math.sqrt(arr.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / arr.length); }

  var tests = [];
  function T(name, fn) { tests.push({ name: name, fn: fn }); }
  function inRange(v, lo, hi) { return { pass: v >= lo && v <= hi, detail: v.toFixed(1) + ' (want ' + lo + '–' + hi + ')' }; }

  T('Baseball flight 119–125 m', function () {
    var c = E.launchCarry(preset('Baseball'), 45, 28, 2200, ENV).carry;
    return inRange(c, 119, 125);
  });
  T('Pickleball hit 35–45 m', function () {
    var h = E.fullHit(preset('Pickleball'), racket(), 'Fastball', 30, ENV, 'outdoor', {});
    return inRange(h.carry, 35, 45);
  });
  T('Tennis ball hit 73–90 m', function () {
    var h = E.fullHit(preset('Tennis ball'), racket(), 'Fastball', 30, ENV, 'outdoor', {});
    return inRange(h.carry, 73, 90);
  });
  T('Seamed optimum: best 500–900 g & 91–99 m', function () {
    var o = E.bestRacket(preset('CastleBall Seamed'), racket(), 'Fastball', 30, ENV, 'outdoor', {});
    var okMass = o.best.mass >= 500 && o.best.mass <= 900;
    var okCarry = o.best.carry >= 91 && o.best.carry <= 99;
    return { pass: okMass && okCarry, detail: 'best ' + o.best.mass + ' g, ' + o.best.carry.toFixed(1) + ' m' };
  });
  T('Power ball, 935 g racket 98–105 m + bottomed', function () {
    var h = E.fullHit(preset('CastleBall Power'), racket({ mass: 935, balance: 36 }), 'Fastball', 30, ENV, 'outdoor', {});
    return { pass: h.carry >= 98 && h.carry <= 105 && h.bottomed, detail: h.carry.toFixed(1) + ' m, bottomed=' + h.bottomed };
  });
  T('Emergent spin: 1500–3000 rpm, launch 18–32°', function () {
    var h = E.fullHit(preset('CastleBall Seamed'), racket(), 'Fastball', 30, ENV, 'outdoor', {});
    var okS = h.backspin >= 1500 && h.backspin <= 3000, okL = h.launch >= 18 && h.launch <= 32;
    return { pass: okS && okL, detail: h.backspin.toFixed(0) + ' rpm, ' + h.launch.toFixed(1) + '°' };
  });
  T('Layered mass 143–147 g, k 0.55–0.60', function () {
    var b = { mass: 145, d: 74, core: 'Layered', ext: 'Seamed', layered: { shellMm: 1.5, shellMat: 'TPU', memMm: 3.5, memDensity: 2.3 } };
    var g = E.ballGeom(b);
    var gmass = g.m * 1000;
    return { pass: gmass >= 143 && gmass <= 147 && g.k >= 0.55 && g.k <= 0.60, detail: gmass.toFixed(1) + ' g, k=' + g.k.toFixed(3) };
  });
  T('Rattle erratic: break std ≥ 2× Layered', function () {
    var rat = [], lay = [];
    for (var s = 1; s <= 10; s++) rat.push(E.pitch(preset('CastleBall Rattle'), 'Drifter', 30, ENV, 'outdoor', s).totalBreak);
    for (var s2 = 1; s2 <= 10; s2++) lay.push(E.pitch(preset('CastleBall Layered'), 'Drifter', 30, ENV, 'outdoor', s2).totalBreak);
    var rs = std(rat), ls = std(lay);
    return { pass: rs >= 2 * ls, detail: 'rattle σ=' + rs.toFixed(2) + ' vs layered σ=' + ls.toFixed(2) };
  });
  T('Repeatable seed: identical twice', function () {
    var a = E.fullHit(preset('CastleBall Split'), racket(), 'Drifter', 30, ENV, 'outdoor', { seed: 7 }).carry;
    var b = E.fullHit(preset('CastleBall Split'), racket(), 'Drifter', 30, ENV, 'outdoor', { seed: 7 }).carry;
    return { pass: Math.abs(a - b) < 1e-6, detail: a.toFixed(4) + ' vs ' + b.toFixed(4) };
  });
  T('Spin kills asymmetry: fastball asym < 20% Drifter', function () {
    var fast = Math.abs(E.pitch(preset('CastleBall Split'), 'Fastball', 30, Object.assign({}, ENV, { fastAsymRpm: 2000 }), 'outdoor', 1).breakH);
    var drift = Math.abs(E.pitch(preset('CastleBall Split'), 'Drifter', 30, ENV, 'outdoor', 1).breakH) || 1e-6;
    return { pass: fast < 0.2 * drift, detail: 'fast ' + fast.toFixed(2) + ' cm vs drifter ' + drift.toFixed(2) + ' cm' };
  });

  function run() {
    var pass = 0, out = [];
    for (var i = 0; i < tests.length; i++) {
      var r; try { r = tests[i].fn(); } catch (e) { r = { pass: false, detail: 'ERROR ' + e.message }; }
      if (r.pass) pass++;
      out.push({ name: tests[i].name, pass: r.pass, detail: r.detail });
    }
    return { pass: pass, total: tests.length, results: out };
  }

  if (typeof module !== 'undefined' && module.exports) {
    var res = run();
    res.results.forEach(function (r) { console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + '  ->  ' + r.detail); });
    console.log('\n' + res.pass + '/' + res.total + ' passing');
    module.exports = { run: run };
  } else { root.PhysTests = { run: run }; }
})(typeof self !== 'undefined' ? self : this);
