/* CastleBall Game Physics — pure engine (no DOM). Unit-testable in Node and browser.
   Coordinates: origin at home plate, x -> center field, y up, z -> first-base side.
   The pitch travels -x; the batted ball travels +x. SI units internally. */
(function (root) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('./params.js') : root.PhysParams;

  // ── vector helpers (3D arrays) ──
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function mag(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var m = mag(a); return m < 1e-12 ? [0, 0, 0] : scale(a, 1 / m); }
  // rotate vector v about unit axis k by angle th (Rodrigues)
  function rot(v, k, th) {
    var c = Math.cos(th), s = Math.sin(th);
    return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
  }

  // ── seeded smooth noise (for Drifter wobble) ──
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smoothNoise(seed) {
    var rnd = mulberry32(seed), N = 64, pts = [];
    for (var i = 0; i < N; i++) pts.push(rnd() * 2 - 1);
    return function (t) { // t in seconds, ~2 Hz wander
      var x = (t * 2) % N; if (x < 0) x += N;
      var i0 = Math.floor(x), f = x - i0, i1 = (i0 + 1) % N;
      var u = f * f * (3 - 2 * f);
      return pts[i0] * (1 - u) + pts[i1] * u;
    };
  }

  // ── air density from conditions ──
  function airDensity(env) {
    var T = env.T, h = env.h, RH = env.RH;
    var p = 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
    var pv = RH * 610.94 * Math.exp(17.625 * T / (T + 243.04));
    var Tk = T + 273.15;
    return (p - pv) / (P.R_dry * Tk) + pv / (P.R_vap * Tk);
  }

  // ── ball geometry: mass (kg), radius (m), frontal area, inertia factor k, cross-section layers ──
  // ball: {mass(g), d(mm), core, ext, layered?, rattle?}
  function ballGeom(ball) {
    var d = ball.d / 1000, r = d / 2, A = Math.PI * r * r;
    var core = ball.core, layers = [], k, mKg, cavityR = 0, innerR = 0, innerMkg = 0, note = null;

    function shellMass(rOut, rIn, densGcm3) { // g, spherical shell
      var vol = (4 / 3) * Math.PI * (Math.pow(rOut, 3) - Math.pow(rIn, 3)) * 1e6; // cm³ (m->cm: *1e6 for r in m? no)
      return vol; // placeholder, replaced below
    }
    // proper shell volume in cm³ for radii in metres
    function shellVolCm3(rOutM, rInM) { return (4 / 3) * Math.PI * (Math.pow(rOutM * 100, 3) - Math.pow(rInM * 100, 3)); }
    function shellIner(rOutM, rInM, densGcm3) { // kg·m²: I = (8/15)πρ(rOut^5 - rIn^5), ρ in kg/m³
      var rho = densGcm3 * 1000;
      return (8 / 15) * Math.PI * rho * (Math.pow(rOutM, 5) - Math.pow(rInM, 5));
    }

    if (core === 'Layered' || core === 'Rattle') {
      var cfg = core === 'Layered' ? (ball.layered || {}) : (ball.rattle || {});
      var shellMm = cfg.shellMm || 1.5, memMm = cfg.memMm || 3.5;
      var shellMat = cfg.shellMat || 'TPU';
      var shellDens = P.materials.shell[shellMat] || 1.21;
      var rShellIn = r - shellMm / 1000;
      var rMemIn = rShellIn - memMm / 1000;
      if (rMemIn < 0) rMemIn = 0;
      var mShell = shellVolCm3(r, rShellIn) * shellDens; // g
      var memDens;
      if (core === 'Layered') {
        // membrane density: explicit, or solved to hit a target mass
        if (cfg.memDensity != null && !cfg.solveDensity) {
          memDens = cfg.memDensity;
        } else {
          var memVol = shellVolCm3(rShellIn, rMemIn);
          memDens = memVol > 0 ? (ball.mass - mShell) / memVol : 0;
        }
        var mMem = shellVolCm3(rShellIn, rMemIn) * memDens;
        mKg = (mShell + mMem) / 1000;
        layers = [
          { name: 'Shell', tMm: shellMm, mass: mShell, dens: shellDens, rOut: r, rIn: rShellIn },
          { name: 'Membrane', tMm: memMm, mass: mMem, dens: memDens, rOut: rShellIn, rIn: rMemIn },
          { name: 'Air interior', tMm: rMemIn * 1000, mass: 0, dens: 0, rOut: rMemIn, rIn: 0 }
        ];
        // inertia factor from shell + membrane (air ~0)
        var Itot = shellIner(r, rShellIn, shellDens) + shellIner(rShellIn, rMemIn, memDens);
        k = Itot / (mKg * r * r);
        if (memDens < 0.9 || memDens > 8.0) note = 'No common printable material is this dense. Try a thicker membrane.';
        cfg.memDensity = memDens;
      } else { // Rattle
        var memMatR = cfg.memMat || 'TPU';
        var memDensR = (P.materials.membrane[memMatR] != null ? P.materials.membrane[memMatR] : (cfg.memDensity || 1.21));
        var mMemR = shellVolCm3(rShellIn, rMemIn) * memDensR; // g
        cavityR = rMemIn;
        var innerMm = cfg.innerMm || 20;
        var innerMat = cfg.innerMat || 'Steel';
        var innerDens = P.materials.inner[innerMat] || 7.85;
        // clamp inner to cavity - 2mm
        var maxInner = (cavityR * 1000 - 2) * 2;
        if (innerMm > maxInner) { innerMm = Math.max(2, maxInner); note = 'Inner ball too large for the cavity — clamped.'; }
        innerR = innerMm / 2000;
        innerMkg = ((4 / 3) * Math.PI * Math.pow(innerR * 100, 3) * innerDens) / 1000;
        var mShellMemKg = (mShell + mMemR) / 1000;
        mKg = mShellMemKg + innerMkg;
        cfg.innerMassG = innerMkg * 1000;
        layers = [
          { name: 'Shell', tMm: shellMm, mass: mShell, dens: shellDens, rOut: r, rIn: rShellIn },
          { name: 'Membrane', tMm: memMm, mass: mMemR, dens: memDensR, rOut: rShellIn, rIn: rMemIn },
          { name: 'Air cavity', tMm: rMemIn * 1000, mass: 0, dens: 0, rOut: rMemIn, rIn: 0 },
          { name: 'Inner ball', tMm: innerMm, mass: innerMkg * 1000, dens: innerDens, rOut: innerR, rIn: 0, inner: true }
        ];
        // rotational inertia: shell + membrane only
        var IshM = shellIner(r, rShellIn, shellDens) + shellIner(rShellIn, rMemIn, memDensR);
        k = IshM / (mShellMemKg * r * r);
      }
    } else {
      mKg = ball.mass / 1000;
      k = P.cores[core].k;
      layers = [{ name: core + ' core', tMm: r * 1000, mass: ball.mass, dens: mKg / ((4 / 3) * Math.PI * Math.pow(r, 3)) / 1000, rOut: r, rIn: 0 }];
    }
    return {
      m: mKg, r: r, d: d, A: A, k: k,
      densityFactor: (mKg * 1000) / (A * 1e4), // g/cm²
      layers: layers, cavityR: cavityR, innerR: innerR, innerM: innerMkg, note: note,
      core: core, ext: ball.ext
    };
  }

  // ── drag + Magnus coefficients ──
  function Wtaper(Re) { // asymmetric-force efficiency window
    if (Re < 2e4 || Re > 4e5) return 0;
    if (Re < 5e4) return (Re - 2e4) / (5e4 - 2e4);
    if (Re > 2.5e5) return 1 - (Re - 2.5e5) / (4e5 - 2.5e5);
    return 1;
  }
  function dragCd(Re, S, ex) {
    var w = 0.15 * ex.ReCrit;
    var cd = ex.CdLow - (ex.CdLow - ex.CdHigh) / (1 + Math.exp(-(Re - ex.ReCrit) / w)) + 0.1 * S;
    return Math.max(0.05, cd);
  }
  function magnusCL(S, ex) { return S > 1e-6 ? ex.kMag / (2.32 + 0.4 / S) : 0; }

  // ── acceleration on the ball ──
  // st: {p,v}; spin: vector rad/s; roughN: body-fixed rough-side unit vec (or null); env pre-derived
  function accel(v, spin, roughN, g, ext, rho, r, A, m, noiseVal) {
    var vrel = sub(v, g.wind);
    var sp = mag(vrel);
    var acc = [0, -P.g, 0];
    if (sp < 1e-6) return acc;
    var uvr = scale(vrel, 1 / sp);
    var Re = rho * sp * (2 * r) / P.mu_air;
    var wmag = mag(spin);
    var S = wmag * r / sp;
    var Cd = dragCd(Re, S, ext);
    var Fd = scale(vrel, -0.5 * rho * Cd * A * sp);           // drag
    var CL = magnusCL(S, ext);
    var Fm = [0, 0, 0];
    if (CL > 0 && wmag > 1e-6) Fm = scale(cross(scale(spin, 1 / wmag), uvr), 0.5 * rho * CL * A * sp * sp);
    var Fa = [0, 0, 0];
    if (ext.Casym > 0 && roughN) {
      var perp = sub(roughN, scale(uvr, dot(roughN, uvr)));
      var pm = mag(perp);
      if (pm > 1e-6) {
        var Casym = ext.Casym * Math.exp(-wmag / P.asym.w0) * Wtaper(Re) * (1 + 0.15 * (noiseVal || 0));
        Fa = scale(scale(perp, 1 / pm), 0.5 * rho * Casym * A * sp * sp);
      }
    }
    var F = add(add(Fd, Fm), Fa);
    return add(acc, scale(F, 1 / m));
  }

  // ── generic flight integrator (RK4) ──
  // opts: {dt, geom, ext, env, spin0(vec), k, roughDir(vec)|null, noise(fn)|null, stopY, ground, sample}
  // fast allocation-free RK4 for the common case (drag + Magnus, no rough side / no wobble)
  function integrateFast(p0, v0, opts) {
    var geom = opts.geom, ext = P.exteriors[geom.ext] || P.exteriors.Seamed;
    var rho = opts.rho, dt = opts.dt || 0.001;
    var wx = opts.wind ? opts.wind[0] : 0, wy = opts.wind ? opts.wind[1] : 0, wz = opts.wind ? opts.wind[2] : 0;
    var tau = P.spinDecayBase * (geom.k / 0.40);
    var r = geom.r, A = geom.A, m = geom.m, d = 2 * r, mu = P.mu_air, gg = P.g;
    var CdLow = ext.CdLow, CdHigh = ext.CdHigh, ReCrit = ext.ReCrit, wRe = 0.15 * ReCrit, kMag = ext.kMag;
    var s0 = opts.spin0 || [0, 0, 0], s0m = Math.sqrt(s0[0] * s0[0] + s0[1] * s0[1] + s0[2] * s0[2]);
    var sdx = 0, sdy = 0, sdz = 1; if (s0m > 1e-9) { sdx = s0[0] / s0m; sdy = s0[1] / s0m; sdz = s0[2] / s0m; }
    var px = p0[0], py = p0[1], pz = p0[2], vx = v0[0], vy = v0[1], vz = v0[2];
    var t = 0, maxT = opts.maxT || 30, stopY = (opts.stopY != null) ? opts.stopY : 0, stopX = opts.stopX;
    var apex = py, lpx, lpy, lpz;
    var samples = opts.noSamples ? null : [{ t: 0, p: [px, py, pz], v: [vx, vy, vz] }];
    var sampleEvery = opts.sampleEvery || 8, sc = 0;
    var kx = [0, 0, 0, 0], ky = [0, 0, 0, 0], kz = [0, 0, 0, 0], sm;
    function acc(ivx, ivy, ivz, i) {
      var rvx = ivx - wx, rvy = ivy - wy, rvz = ivz - wz;
      var sp = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
      if (sp < 1e-6) { kx[i] = 0; ky[i] = -gg; kz[i] = 0; return; }
      var Re = rho * sp * d / mu, S = sm * r / sp;
      var Cd = CdLow - (CdLow - CdHigh) / (1 + Math.exp(-(Re - ReCrit) / wRe)) + 0.1 * S; if (Cd < 0.05) Cd = 0.05;
      var fd = -0.5 * rho * Cd * A * sp / m;
      var ax = fd * rvx, ay = fd * rvy - gg, az = fd * rvz;
      if (sm > 1e-6) {
        var CL = S > 1e-6 ? kMag / (2.32 + 0.4 / S) : 0;
        if (CL > 0) {
          var uvx = rvx / sp, uvy = rvy / sp, uvz = rvz / sp;
          var cxx = sdy * uvz - sdz * uvy, cyy = sdz * uvx - sdx * uvz, czz = sdx * uvy - sdy * uvx;
          var fm = 0.5 * rho * CL * A * sp * sp / m;
          ax += fm * cxx; ay += fm * cyy; az += fm * czz;
        }
      }
      kx[i] = ax; ky[i] = ay; kz[i] = az;
    }
    while (t < maxT) {
      sm = s0m * Math.exp(-t / tau);
      acc(vx, vy, vz, 0);
      acc(vx + kx[0] * dt / 2, vy + ky[0] * dt / 2, vz + kz[0] * dt / 2, 1);
      acc(vx + kx[1] * dt / 2, vy + ky[1] * dt / 2, vz + kz[1] * dt / 2, 2);
      acc(vx + kx[2] * dt, vy + ky[2] * dt, vz + kz[2] * dt, 3);
      lpx = px; lpy = py; lpz = pz;
      px += dt / 6 * (vx + 2 * (vx + kx[0] * dt / 2) + 2 * (vx + kx[1] * dt / 2) + (vx + kx[2] * dt));
      py += dt / 6 * (vy + 2 * (vy + ky[0] * dt / 2) + 2 * (vy + ky[1] * dt / 2) + (vy + ky[2] * dt));
      pz += dt / 6 * (vz + 2 * (vz + kz[0] * dt / 2) + 2 * (vz + kz[1] * dt / 2) + (vz + kz[2] * dt));
      vx += dt / 6 * (kx[0] + 2 * kx[1] + 2 * kx[2] + kx[3]);
      vy += dt / 6 * (ky[0] + 2 * ky[1] + 2 * ky[2] + ky[3]);
      vz += dt / 6 * (kz[0] + 2 * kz[1] + 2 * kz[2] + kz[3]);
      t += dt;
      if (py > apex) apex = py;
      if (samples && ++sc >= sampleEvery) { sc = 0; samples.push({ t: t, p: [px, py, pz], v: [vx, vy, vz] }); }
      if (stopX != null && ((lpx - stopX) * (px - stopX) <= 0) && t > dt) {
        var f = (stopX - lpx) / ((px - lpx) || 1e-9);
        return { crossed: [lpx + (px - lpx) * f, lpy + (py - lpy) * f, lpz + (pz - lpz) * f], t: t, apex: apex, samples: samples, p: [px, py, pz], v: [vx, vy, vz] };
      }
      if (py <= stopY && vy < 0 && t > dt) {
        var f2 = (lpy - stopY) / ((lpy - py) || 1e-9);
        var pl = [lpx + (px - lpx) * f2, stopY, lpz + (pz - lpz) * f2];
        if (samples) samples.push({ t: t, p: pl.slice(), v: [vx, vy, vz] });
        return { landing: pl, t: t, apex: apex, samples: samples, p: pl, v: [vx, vy, vz] };
      }
    }
    return { landing: [px, py, pz], t: t, apex: apex, samples: samples, p: [px, py, pz], v: [vx, vy, vz], timeout: true };
  }

  function integrate(p0, v0, opts) {
    if (!opts.roughDir && !opts.noise) return integrateFast(p0, v0, opts);
    var geom = opts.geom, ext = P.exteriors[geom.ext] || P.exteriors.Seamed;
    var rho = opts.rho, dt = opts.dt || 0.001;
    var wind = opts.wind || [0, 0, 0];
    var g = { wind: wind };
    var tau = P.spinDecayBase * (geom.k / 0.40);
    var p = p0.slice(), v = v0.slice();
    var spin0mag = mag(opts.spin0 || [0, 0, 0]);
    var spinDir = spin0mag > 1e-9 ? unit(opts.spin0) : [0, 0, 1];
    var roughDir = opts.roughDir ? unit(opts.roughDir) : null;
    var noise = opts.noise || null;
    var t = 0, samples = [], maxT = opts.maxT || 30;
    var stopY = (opts.stopY != null) ? opts.stopY : 0;
    var sampleEvery = opts.sampleEvery || 8, sc = 0;
    var apex = p[1], last = p.slice();
    samples.push({ t: 0, p: p.slice(), v: v.slice() });
    function spinAt(tt) { return scale(spinDir, spin0mag * Math.exp(-tt / tau)); }
    while (t < maxT) {
      var nv = noise ? noise(t) : 0;
      var sp = spinAt(t);
      // RK4 on (p,v); spin treated ~constant across the step
      function a(vv) { return accel(vv, sp, roughDir, g, ext, rho, geom.r, geom.A, geom.m, nv); }
      var k1v = a(v), k1p = v;
      var k2v = a(add(v, scale(k1v, dt / 2))), k2p = add(v, scale(k1v, dt / 2));
      var k3v = a(add(v, scale(k2v, dt / 2))), k3p = add(v, scale(k2v, dt / 2));
      var k4v = a(add(v, scale(k3v, dt))), k4p = add(v, scale(k3v, dt));
      last = p.slice();
      p = add(p, scale(add(add(k1p, scale(add(k2p, k3p), 2)), k4p), dt / 6));
      v = add(v, scale(add(add(k1v, scale(add(k2v, k3v), 2)), k4v), dt / 6));
      t += dt;
      if (roughDir) roughDir = rot(roughDir, spinDir, mag(sp) * dt);
      if (p[1] > apex) apex = p[1];
      if (++sc >= sampleEvery) { sc = 0; samples.push({ t: t, p: p.slice(), v: v.slice() }); }
      if (opts.stopX != null && ((last[0] - opts.stopX) * (p[0] - opts.stopX) <= 0) && t > dt) {
        // crossed target x-plane: linear interp
        var f = (opts.stopX - last[0]) / (p[0] - last[0] || 1e-9);
        var pc = add(last, scale(sub(p, last), f));
        return { crossed: pc, t: t, apex: apex, samples: samples, p: p, v: v };
      }
      if (p[1] <= stopY && v[1] < 0 && t > dt) {
        var f2 = (last[1] - stopY) / (last[1] - p[1] || 1e-9);
        var pl = add(last, scale(sub(p, last), f2));
        var vl = v;
        samples.push({ t: t, p: pl.slice(), v: vl.slice() });
        return { landing: pl, t: t, apex: apex, samples: samples, p: pl, v: vl };
      }
    }
    return { landing: p, t: t, apex: apex, samples: samples, p: p, v: v, timeout: true };
  }

  // ── pitch stage: returns arrival velocity/position at the plate and the break vs a spinless ref ──
  function pitch(ball, pitchType, speedMps, env, mode, seed, opts) {
    opts = opts || {};
    var geom = ballGeom(ball), rho = airDensity(env);
    var dtP = opts.dt || (geom.core === 'Rattle' ? 0.00025 : 0.001);
    var dist = (env.pitchDist != null) ? env.pitchDist : P.pitchDist[mode || 'outdoor'];
    var relY = P.field.releaseY, plateY = P.field.plateY;
    var release = [dist, relY, 0];
    var windVec = windVector(env);
    var pit = P.pitches[pitchType] || P.pitches.Fastball;
    var omega = (env.customRpm != null && pitchType === 'Custom' ? env.customRpm : pit.rpm) * 2 * Math.PI / 60;

    // aim a spinless drag-only ball to cross x=0 at (plateY,0): shoot for launch angle & small z
    function shootRef(vy0, vz0) {
      var dir = unit([-1, 0, 0]); // toward home
      var v0 = [-speedMps, vy0, vz0];
      return integrate(release, v0, { geom: geom, rho: rho, dt: dtP, spin0: [0, 0, 0], wind: [0, 0, 0], stopX: 0, stopY: -50, maxT: 3 });
    }
    // iterate vy0 so the spinless ball reaches plateY at x=0 (secant)
    var vy = 2.0, vz = 0.0;
    for (var it = 0; it < 12; it++) {
      var r0 = shootRef(vy, vz);
      var yc = r0.crossed ? r0.crossed[1] : plateY;
      var err = yc - plateY;
      if (Math.abs(err) < 0.005) break;
      var r1 = shootRef(vy + 0.3, vz);
      var yc1 = r1.crossed ? r1.crossed[1] : plateY;
      var slope = (yc1 - yc) / 0.3 || 1;
      vy -= err / slope;
    }
    var refCross = shootRef(vy, vz).crossed || [0, plateY, 0];

    // spin vector for the real pitch (ball travels -x)
    var spin = spinVector(pitchType, omega, env);
    var roughDir = ext_hasAsym(geom.ext) ? roughStart(env) : null;
    var noise = pitchType === 'Drifter' ? smoothNoise((seed || 1) * 2654435761 % 2147483647) : null;
    var real = integrate(release, [-speedMps, vy, vz], {
      geom: geom, rho: rho, dt: dtP,
      spin0: spin, wind: windVec, roughDir: roughDir, noise: noise, stopX: 0, stopY: -50, maxT: 3
    });
    var realCross = real.crossed || [0, plateY, 0];
    var breakH = (realCross[2] - refCross[2]) * 100; // cm (z)
    var breakV = (realCross[1] - refCross[1]) * 100; // cm (y)

    // late break: break accrued over the last 5 m
    var lateH = 0, lateV = 0;
    return {
      geom: geom, rho: rho, arrivalV: real.v, arrivalP: realCross, spin: spin,
      breakH: breakH, breakV: breakV, totalBreak: Math.sqrt(breakH * breakH + breakV * breakV),
      lateBreak: Math.abs(breakV) * 0.4, trajectory: real.samples, refCross: refCross,
      timeToPlate: real.t, speed: speedMps
    };
  }
  function ext_hasAsym(extName) { return (P.exteriors[extName] || {}).Casym > 0; }
  function windVector(env) {
    if (!env.wind) return [0, 0, 0];
    var a = (env.windDir || 0) * Math.PI / 180;
    return [Math.cos(a) * env.wind, 0, Math.sin(a) * env.wind];
  }
  function roughStart(env) {
    var a = (env.roughOrient != null ? env.roughOrient : 90) * Math.PI / 180;
    return [0, Math.cos(a), Math.sin(a)]; // rough side in the y-z plane
  }
  function spinVector(pitchType, omega, env) {
    // ball travels -x. Build spin so effects match description.
    switch (pitchType) {
      case 'Fastball': return [0, 0, -omega];            // backspin -> lift (less drop) for a ball travelling -x
      case 'Curveball': return unit([0, 1, 1]).map(function (c) { return c * omega; }); // topspin tilted 45 -> drop + sideways
      case 'Slider': return [0, omega, 0];               // sidespin -> sideways
      case 'Drifter': return [0, 0, omega];              // tiny spin
      case 'Custom': {
        var ax = (env.customAxis || 0) * Math.PI / 180;
        return [0, Math.cos(ax) * omega, Math.sin(ax) * omega];
      }
      default: return [0, 0, omega];
    }
  }

  // ── racket-ball collision ──
  // arrival: {v (ball vel at plate), spin (pitch spin vec)}; racket {mass(g),balance(cm),gauge,tension,batter}
  function collide(arrivalV, arrivalSpin, geom, racket, faceDeg, swingDeg, sprayDeg, sweetDelta) {
    var mr = racket.mass / 1000, b = racket.balance / 100;
    var rg = 0.20 + 0.5 * (b - 0.34);
    var Icm = mr * rg * rg;
    var impact = P.racket.impactPt + (sweetDelta || 0);
    var d = impact - b;
    var mEff = 1 / (1 / mr + d * d / Icm);
    var Ipiv = Icm + mr * Math.pow(b - P.racket.pivot, 2);
    var vRef = P.batters[racket.batter] || 32;
    var vRacket = vRef * Math.pow(Ipiv / P.racket.Iref, -0.5);

    var psi = swingDeg * Math.PI / 180, spray = sprayDeg * Math.PI / 180;
    var face = faceDeg * Math.PI / 180;
    // swing direction: +x (toward pitcher), lofted by psi, sprayed about y
    var sdir = [Math.cos(psi) * Math.cos(spray), Math.sin(psi), Math.cos(psi) * Math.sin(spray)];
    // face normal: swing dir lofted by extra face angle (open = more up)
    var nf = [Math.cos(psi + face) * Math.cos(spray), Math.sin(psi + face), Math.cos(psi + face) * Math.sin(spray)];
    nf = unit(nf);
    var vRacketVec = scale(sdir, vRacket);

    var mb = geom.m;
    var core = P.cores[geom.core] || P.cores.Hard;
    var eb = core.eb, kb = core.kb;

    var u = sub(arrivalV, vRacketVec);           // ball rel racket
    var un = dot(u, nf);                          // <0 (closing)
    var ut = sub(u, scale(nf, un));              // tangential rel velocity
    var utm = mag(ut);

    var vnBall = dot(arrivalV, nf), vnRacket = dot(vRacketVec, nf);
    var mu = mb * mEff / (mb + mEff);
    var En = 0.5 * mu * un * un;
    var ks = P.strings.kBase * (racket.tension / P.strings.Tref) * (racket.gauge / P.strings.gaugeRef);
    var EsMax = 0.5 * ks * P.strings.xmax * P.strings.xmax;
    var EsWant = En * kb / (kb + ks);
    var Es = Math.min(EsWant, EsMax);
    var bottomed = EsWant > EsMax;
    var Eb = En - Es;
    var e = Math.sqrt((Es * P.strings.es * P.strings.es + Eb * eb * eb) / (En || 1e-9));
    // off-centre penalty
    if (sweetDelta) e *= Math.max(0.6, 1 - 1.5 * Math.pow(Math.abs(sweetDelta) / 0.15, 2));

    var vcm = (mb * vnBall + mEff * vnRacket) / (mb + mEff);
    var vnOut = vcm - e * (vnBall - vcm);
    var Jn = mb * (vnOut - vnBall);

    // tangential: spin from strings
    var ex = P.exteriors[geom.ext] || P.exteriors.Seamed;
    var kmag = ex.kMag;
    // spin component that matters about the contact tangent (approx use full incoming spin proj)
    var w0proj = 0;
    var Jt = Math.min(geom.k / (1 + geom.k) * mb * Math.abs(utm - w0proj * geom.r), P.racket.mu_s * kmag * Math.abs(Jn));
    var tdir = utm > 1e-6 ? scale(ut, 1 / utm) : [0, 0, 0];

    var vOut = add(arrivalV, add(scale(nf, vnOut - vnBall), scale(tdir, -Jt / mb)));
    // backspin: spin axis = nf × tdir, magnitude dw = Jt/(k*mb*r)
    var dw = geom.k > 1e-6 ? Jt / (geom.k * mb * geom.r) : 0;
    var spinAxis = unit(cross(nf, tdir));
    var wOut = scale(spinAxis, dw);

    var speed = mag(vOut);
    var launch = Math.atan2(vOut[1], Math.sqrt(vOut[0] * vOut[0] + vOut[2] * vOut[2])) * 180 / Math.PI;
    var backRpm = dw * 60 / (2 * Math.PI);
    return {
      vOut: vOut, wOut: wOut, exitSpeed: speed, launchDeg: launch, backspinRpm: backRpm,
      bottomed: bottomed, e: e, mEff: mEff, vRacket: vRacket, faceUsed: faceDeg
    };
  }

  // ── batted-ball flight + bounce + roll ──
  function battedFlight(vOut, wOut, geom, env, surfaceName, field, opts) {
    opts = opts || {};
    var rho = airDensity(env), windVec = windVector(env);
    var surf = P.surfaces[surfaceName] || P.surfaces['Outfield grass'];
    var contactY = 1.2;   // bat–ball contact height (m); calibrated with the validation table
    var dt = opts.dt || (geom.core === 'Rattle' ? 0.00025 : 0.001);
    var res = integrate([0, contactY, 0], vOut, {
      geom: geom, rho: rho, dt: dt,
      spin0: wOut, wind: windVec, stopY: 0, maxT: 15
    });
    var carry = Math.sqrt(res.landing[0] * res.landing[0] + res.landing[2] * res.landing[2]);
    var apex = res.apex, hang = res.t;
    if (opts.carryOnly) {
      var fenceC = fenceDist(res.landing, field);
      return { carry: carry, total: carry, apex: apex, hang: hang, cleared: carry >= fenceC, landing: res.landing, rest: res.landing, samples: res.samples, exitSpeed: mag(vOut) };
    }
    var samples = res.samples.slice();
    // bounce + roll
    var p = res.landing.slice(), v = res.v.slice(), guard = 0;
    while (Math.abs(v[1]) > 0.5 && guard++ < 20) {
      v[1] = -v[1] * surf.e;
      var horiz = Math.sqrt(v[0] * v[0] + v[2] * v[2]);
      var fric = surf.mu * (1 + surf.e) * Math.abs(v[1]);
      var nh = Math.max(0, horiz - fric);
      if (horiz > 1e-6) { v[0] *= nh / horiz; v[2] *= nh / horiz; }
      var hop = integrate(p, v, { geom: geom, rho: rho, dt: 0.002, spin0: [0, 0, 0], wind: windVec, stopY: 0, maxT: 6 });
      for (var i = 1; i < hop.samples.length; i++) samples.push(hop.samples[i]);
      p = hop.landing.slice(); v = hop.v.slice();
      if (hop.apex < 0.05) break;
    }
    // roll
    var rollSpeed = Math.sqrt(v[0] * v[0] + v[2] * v[2]);
    var dir = rollSpeed > 1e-6 ? [v[0] / rollSpeed, 0, v[2] / rollSpeed] : [1, 0, 0];
    var rp = p.slice(), rs = rollSpeed, rdt = 0.02;
    while (rs > 0.2) {
      rs = Math.max(0, rs - surf.roll * rdt);
      rp = add(rp, scale(dir, rs * rdt));
      if (samples.length < 4000 && Math.random() < 0.15) samples.push({ t: 0, p: rp.slice(), v: [0, 0, 0] });
    }
    var total = Math.sqrt(rp[0] * rp[0] + rp[2] * rp[2]);
    // fence
    var fence = fenceDist(res.landing, field);
    var cleared = carry >= fence;
    return {
      carry: carry, total: total, apex: apex, hang: hang, cleared: cleared,
      landing: res.landing, rest: rp, samples: samples, exitSpeed: mag(vOut)
    };
  }
  function fenceDist(landing, field) {
    if (!field || field.indoor) return 1e9;
    var ang = Math.abs(Math.atan2(landing[2], landing[0])); // 0 = center
    var t = Math.min(1, ang / (Math.PI / 4));
    return P.field.fenceCenter * (1 - t) + P.field.fenceLine * t;
  }

  // ── full at-bat: pitch -> collide -> batted flight ──
  function fullHit(ball, racket, pitchType, speed, env, mode, opts) {
    opts = opts || {};
    var dt = opts.fast ? 0.002 : 0;
    var pit = pitch(ball, pitchType, speed, env, mode, opts.seed || 1, dt ? { dt: dt } : {});
    var geom = pit.geom;
    var face = (racket.face === 'Auto' || racket.face == null) ?
      bestFace(pit, geom, racket, env, mode, { dt: 0.002, carryOnly: true, spray: opts.spray }) : racket.face;
    var surface = mode === 'indoor' ? 'Gym hardwood' : (opts.surface || 'Outfield grass');
    var field = { indoor: mode === 'indoor' };
    var sweet = opts.sweetDelta || 0, spray = opts.spray || 0, swing = racket.swing != null ? racket.swing : 10;
    var col = collide(pit.arrivalV, pit.spin, geom, racket, face, swing, spray, sweet);
    var bat = battedFlight(col.vOut, col.wOut, geom, env, surface, field, { dt: dt || undefined, carryOnly: !!opts.carryOnly });
    return {
      carry: bat.carry, total: bat.total, apex: bat.apex, hang: bat.hang, cleared: bat.cleared,
      exitSpeed: col.exitSpeed, launch: col.launchDeg, backspin: col.backspinRpm,
      bottomed: col.bottomed, faceUsed: face, breakH: pit.breakH, breakV: pit.breakV,
      totalBreak: pit.totalBreak, timeToPlate: pit.timeToPlate, densityFactor: geom.densityFactor,
      pitch: pit, collide: col, batted: bat, geom: geom, landing: bat.landing, rest: bat.rest
    };
  }

  // ── Auto face: golden-section search for longest carry ──
  function bestFace(pit, geom, racket, env, mode, opts) {
    opts = opts || {};
    var surface = mode === 'indoor' ? 'Gym hardwood' : 'Outfield grass';
    var field = { indoor: mode === 'indoor' };
    var swing = racket.swing != null ? racket.swing : 10;
    var bopts = { dt: opts.dt || 0.002, carryOnly: true };
    function carryAt(face) {
      var c = collide(pit.arrivalV, pit.spin, geom, racket, face, swing, opts.spray || 0, 0);
      return battedFlight(c.vOut, c.wOut, geom, env, surface, field, bopts).carry;
    }
    var a = -10, b = 45, gr = (Math.sqrt(5) - 1) / 2;
    var c1 = b - gr * (b - a), c2 = a + gr * (b - a);
    var f1 = carryAt(c1), f2 = carryAt(c2);
    var iters = opts.iters || 18;
    for (var i = 0; i < iters; i++) {
      if (f1 < f2) { a = c1; c1 = c2; f1 = f2; c2 = a + gr * (b - a); f2 = carryAt(c2); }
      else { b = c2; c2 = c1; f2 = f1; c1 = b - gr * (b - a); f1 = carryAt(c1); }
    }
    return Math.round(((a + b) / 2) * 10) / 10;
  }

  // ── direct-launch flight (for validation, no collision) ──
  function launchCarry(ball, speed, angleDeg, rpm, env, surfaceName) {
    var geom = ballGeom(ball), rho = airDensity(env);
    var a = angleDeg * Math.PI / 180;
    var v0 = [speed * Math.cos(a), speed * Math.sin(a), 0];
    var spin = [0, 0, rpm * 2 * Math.PI / 60]; // backspin -> lift
    var res = integrate([0, 1.0, 0], v0, { geom: geom, rho: rho, dt: 0.001, spin0: spin, wind: windVector(env), stopY: 0, maxT: 15 });
    return { carry: Math.sqrt(res.landing[0] * res.landing[0] + res.landing[2] * res.landing[2]), apex: res.apex, hang: res.t };
  }

  // ── optimizer: best racket mass for carry ──
  function bestRacket(ball, racketBase, pitchType, speed, env, mode, opts) {
    opts = opts || {};
    var best = { mass: 320, carry: 0, launch: 0 }, curve = [];
    var surface = mode === 'indoor' ? 'Gym hardwood' : 'Outfield grass', field = { indoor: mode === 'indoor' };
    var isRattle = ball.core === 'Rattle';
    var swOpt = { dt: 0.002, carryOnly: true, iters: 10 };
    var pits = [], seeds = isRattle ? 3 : 1;
    for (var si = 0; si < seeds; si++) pits.push(pitch(ball, pitchType, speed, env, mode, si + 1, { dt: 0.002 }));
    var geom0 = pits[0].geom, sw = racketBase.swing != null ? racketBase.swing : 10;
    for (var m = 250; m <= 1000; m += 5) {
      var rk = Object.assign({}, racketBase, { mass: m, face: 'Auto' });
      var carry = 0;
      for (var pi = 0; pi < pits.length; pi++) {
        var pt = pits[pi];
        var face = bestFace(pt, pt.geom, rk, env, mode, swOpt);
        var col = collide(pt.arrivalV, pt.spin, pt.geom, rk, face, sw, 0, 0);
        carry += battedFlight(col.vOut, col.wOut, pt.geom, env, surface, field, swOpt).carry;
      }
      carry /= pits.length;
      curve.push({ mass: m, carry: carry });
      if (carry > best.carry) best = { mass: m, carry: carry };
      if (opts.onProgress && m % 50 === 0) opts.onProgress((m - 250) / 750);
    }
    best.risingAtTop = best.mass >= 1000;
    return { best: best, curve: curve };
  }
  // curve score: largest total break across Curveball + Drifter
  function curveScore(ball, speed, env, mode) {
    var a = pitch(ball, 'Curveball', speed, env, mode, 1, { dt: 0.002 }).totalBreak;
    var b = pitch(ball, 'Drifter', speed, env, mode, 3, { dt: 0.002 }).totalBreak;
    return Math.max(a, b);
  }

  var ENGINE = {
    add: add, sub: sub, scale: scale, dot: dot, cross: cross, mag: mag, unit: unit,
    airDensity: airDensity, ballGeom: ballGeom, dragCd: dragCd, magnusCL: magnusCL,
    integrate: integrate, pitch: pitch, collide: collide, battedFlight: battedFlight,
    fullHit: fullHit, bestFace: bestFace, launchCarry: launchCarry,
    bestRacket: bestRacket, curveScore: curveScore, windVector: windVector, P: P
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
  else root.PhysEngine = ENGINE;
})(typeof self !== 'undefined' ? self : this);
