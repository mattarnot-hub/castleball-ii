/* CastleBall Game Physics — UI wiring, live readouts, animation, optimizer, persistence. */
(function () {
  'use strict';
  var E = window.PhysEngine, P = window.PhysParams, R = window.PhysRender;
  var $ = function (id) { return document.getElementById(id); };
  var OZ = 28.35, FT = 0.3048, MPH = 0.44704, IN = 25.4;

  // ── unit formatters ──
  function gOz(g) { return Math.round(g) + ' g · ' + (g / OZ).toFixed(1) + ' oz'; }
  function mFt(m) { return m.toFixed(m < 10 ? 1 : 0) + ' m · ' + (m / FT).toFixed(0) + ' ft'; }
  function msMph(v) { return v.toFixed(1) + ' m/s · ' + (v / MPH).toFixed(0) + ' mph'; }
  function mmIn(mm) { return mm.toFixed(0) + ' mm · ' + (mm / IN).toFixed(1) + ' in'; }
  function cmIn(cm) { return cm.toFixed(1) + ' cm · ' + (cm / 2.54).toFixed(1) + ' in'; }

  // ── state ──
  var S = {
    mode: 'outdoor', view: 'pitch',
    ball: { mass: 145, d: 74, core: 'Hard', ext: 'Seamed', roughOrient: 90,
      layered: { shellMm: 1.5, shellMat: 'TPU', memMm: 3.5, memMat: 'Custom', memDensity: 2.3 },
      rattle: { shellMm: 1.5, shellMat: 'TPU', memMm: 3.5, memMat: 'TPU', innerMm: 20, innerMat: 'Steel' } },
    racket: { mass: 320, balance: 34, gauge: 1.30, tension: 55, swing: 10, face: 'Auto', faceVal: 20, batter: 'Adult', realistic: true },
    pitch: 'Fastball', speed: 30,
    env: { T: 20, h: 0, RH: 0.5, wind: 0, windDir: 0, roughOrient: 90 },
    sfxOn: true, musicOn: false
  };
  try { var saved = JSON.parse(localStorage.getItem('castleball-physics-v2') || 'null'); if (saved) deepMerge(S, saved); } catch (e) {}
  function deepMerge(a, b) { for (var k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { a[k] = a[k] || {}; deepMerge(a[k], b[k]); } else a[k] = b[k]; } }
  var saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem('castleball-physics-v2', JSON.stringify(S)); } catch (e) {} }, 250); }

  // ── control factory ──
  function slider(parent, o) {
    var row = document.createElement('div'); row.className = 'row';
    var lab = document.createElement('div'); lab.className = 'lab';
    var name = document.createElement('span'); name.innerHTML = o.label + (o.help ? ' <span class="q" title="' + o.help + '">?</span>' : '');
    var val = document.createElement('span'); val.className = 'val';
    lab.appendChild(name); lab.appendChild(val); row.appendChild(lab);
    var inp = document.createElement('input'); inp.type = 'range'; inp.min = o.min; inp.max = o.max; inp.step = o.step;
    row.appendChild(inp);
    if (o.ticks) { var tk = document.createElement('div'); tk.className = 'ticks';
      o.ticks.forEach(function (t) { var s = document.createElement('span'); s.textContent = t.label; s.style.left = ((t.v - o.min) / (o.max - o.min) * 100) + '%'; tk.appendChild(s); });
      row.appendChild(tk); }
    parent.appendChild(row);
    function refresh() { var v = o.get(); inp.value = v; val.textContent = o.fmt(v); inp.style.setProperty('--pct', ((v - o.min) / (o.max - o.min) * 100) + '%'); }
    inp.addEventListener('input', function () { o.set(parseFloat(inp.value)); val.textContent = o.fmt(parseFloat(inp.value)); inp.style.setProperty('--pct', ((inp.value - o.min) / (o.max - o.min) * 100) + '%'); apply(o.heavy); });
    o.refresh = refresh; refresh(); return o;
  }
  function pills(parent, o) {
    var row = document.createElement('div'); row.className = 'row';
    if (o.label) { var lab = document.createElement('div'); lab.className = 'lab'; lab.innerHTML = '<span>' + o.label + (o.help ? ' <span class="q" title="' + o.help + '">?</span>' : '') + '</span>'; row.appendChild(lab); }
    var wrap = document.createElement('div'); wrap.className = 'pills';
    o.options.forEach(function (opt) {
      var b = document.createElement('button'); b.className = 'pill'; b.textContent = opt.label || opt; b.dataset.v = opt.value != null ? opt.value : opt;
      b.addEventListener('click', function () { o.set(b.dataset.v); mark(); apply(); });
      wrap.appendChild(b);
    });
    row.appendChild(wrap); parent.appendChild(row);
    function mark() { [].forEach.call(wrap.children, function (b) { b.classList.toggle('active', b.dataset.v === String(o.get())); }); }
    o.refresh = mark; mark(); return o;
  }
  function selector(parent, o) {
    var row = document.createElement('div'); row.className = 'row';
    var lab = document.createElement('div'); lab.className = 'lab'; lab.innerHTML = '<span>' + o.label + '</span>'; row.appendChild(lab);
    var sel = document.createElement('select');
    o.options.forEach(function (opt) { var op = document.createElement('option'); op.value = opt.value != null ? opt.value : opt; op.textContent = opt.label || opt; sel.appendChild(op); });
    sel.addEventListener('change', function () { o.set(sel.value); apply(); });
    row.appendChild(sel); parent.appendChild(row);
    o.refresh = function () { sel.value = String(o.get()); }; o.refresh(); return o;
  }
  function toggle(parent, o) {
    var row = document.createElement('div'); row.className = 'row'; row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center';
    var lab = document.createElement('span'); lab.style.fontSize = '11px'; lab.style.fontWeight = '700'; lab.innerHTML = o.label;
    var btn = document.createElement('button'); btn.className = 'pill';
    function mark() { btn.classList.toggle('active', !!o.get()); btn.textContent = o.get() ? 'ON' : 'OFF'; }
    btn.addEventListener('click', function () { o.set(!o.get()); mark(); apply(); });
    row.appendChild(lab); row.appendChild(btn); parent.appendChild(row); o.refresh = mark; mark(); return o;
  }

  // ── build panels ──
  var refreshers = [];
  function reg(c) { refreshers.push(c); return c; }
  function refreshAll() { refreshers.forEach(function (c) { c.refresh && c.refresh(); }); }

  function buildBall() {
    var c = $('ballControls'); c.innerHTML = ''; refreshers = refreshers.filter(function (x) { return x._panel !== 'ball'; });
    var regB = function (o) { o._panel = 'ball'; refreshers.push(o); return o; };
    regB(slider(c, { label: 'Mass', min: 15, max: 200, step: 1, help: 'Heavier balls hold speed and fly farther; lighter balls curve more.',
      get: function () { return S.ball.mass; }, set: function (v) { S.ball.mass = v; if (S.ball.core === 'Layered') S.ball.layered.memMat = 'Custom'; },
      fmt: gOz, ticks: [{ v: 26, label: 'pickle' }, { v: 57, label: 'tennis' }, { v: 145, label: 'baseball' }] }));
    regB(slider(c, { label: 'Diameter', min: 60, max: 90, step: 1, help: 'Bigger balls have more air drag for the same mass.',
      get: function () { return S.ball.d; }, set: function (v) { S.ball.d = v; }, fmt: mmIn }));
    regB(pills(c, { label: 'Core', options: ['Hard', 'Jelly', 'Air', 'Layered', 'Rattle'], help: 'How the ball is built inside — changes bounce, mass and how it flies.',
      get: function () { return S.ball.core; }, set: function (v) { S.ball.core = v; buildBall(); } }));
    if (S.ball.core === 'Layered' || S.ball.core === 'Rattle') {
      var cfg = S.ball.core === 'Layered' ? S.ball.layered : S.ball.rattle;
      regB(slider(c, { label: 'Shell thickness', min: 1.0, max: 3.0, step: 0.1, get: function () { return cfg.shellMm; }, set: function (v) { cfg.shellMm = v; }, fmt: function (v) { return v.toFixed(1) + ' mm'; } }));
      regB(selector(c, { label: 'Shell material', options: [{ value: 'TPU', label: 'TPU (1.21)' }, { value: 'PETG', label: 'PETG (1.27)' }], get: function () { return cfg.shellMat; }, set: function (v) { cfg.shellMat = v; } }));
      regB(slider(c, { label: 'Membrane thickness', min: 2, max: 6, step: 0.1, get: function () { return cfg.memMm; }, set: function (v) { cfg.memMm = v; }, fmt: function (v) { return v.toFixed(1) + ' mm'; } }));
      if (S.ball.core === 'Layered') {
        regB(selector(c, { label: 'Membrane material', options: [{ value: 'Custom', label: 'Custom density' }, { value: 'TPU', label: 'TPU (1.21)' }, { value: 'Sand-epoxy', label: 'Sand-epoxy (2.0)' }, { value: 'Metal-filled', label: 'Metal-filled (3.5)' }, { value: 'Steel-shot', label: 'Steel-shot (4.5)' }], get: function () { return cfg.memMat; }, set: function (v) { cfg.memMat = v; } }));
      } else {
        regB(selector(c, { label: 'Membrane material', options: [{ value: 'TPU', label: 'TPU (1.21)' }, { value: 'Sand-epoxy', label: 'Sand-epoxy (2.0)' }, { value: 'Metal-filled', label: 'Metal-filled (3.5)' }, { value: 'Steel-shot', label: 'Steel-shot (4.5)' }], get: function () { return cfg.memMat; }, set: function (v) { cfg.memMat = v; } }));
        regB(slider(c, { label: 'Inner ball diameter', min: 8, max: 40, step: 1, help: 'A loose heavy ball that rolls inside, making flight erratic.', get: function () { return cfg.innerMm; }, set: function (v) { cfg.innerMm = v; }, fmt: mmIn }));
        regB(selector(c, { label: 'Inner ball material', options: [{ value: 'Glass', label: 'Glass (2.5)' }, { value: 'Brass', label: 'Brass (8.5)' }, { value: 'Steel', label: 'Steel (7.85)' }, { value: 'Tungsten carbide', label: 'Tungsten (15.6)' }], get: function () { return cfg.innerMat; }, set: function (v) { cfg.innerMat = v; } }));
      }
    }
    regB(pills(c, { label: 'Exterior', options: ['Smooth', 'Dimpled', 'Seamed', 'Split-face', 'Holes (even)', 'Holes (one side)'], help: 'Surface texture — sets drag, spin grip and any sideways wander.',
      get: function () { return S.ball.ext; }, set: function (v) { S.ball.ext = v; buildBall(); } }));
    if (S.ball.ext === 'Split-face' || S.ball.ext === 'Holes (one side)') {
      regB(slider(c, { label: 'Rough-side orientation', min: 0, max: 360, step: 15, help: 'Which way the rough side faces — sets the direction of the sideways break.', get: function () { return S.env.roughOrient; }, set: function (v) { S.env.roughOrient = v; }, fmt: function (v) { return v + '°'; } }));
    }
  }

  function buildRacket() {
    var c = $('racketControls'); c.innerHTML = ''; refreshers = refreshers.filter(function (x) { return x._panel !== 'racket'; });
    var reg2 = function (o) { o._panel = 'racket'; refreshers.push(o); return o; };
    reg2(slider(c, { label: 'Racket mass', min: 250, max: 1000, step: 5, help: 'Heavier hits harder but swings slower — there is a best mass for each ball.',
      get: function () { return S.racket.mass; }, set: function (v) { S.racket.mass = v; }, fmt: gOz, ticks: [{ v: 935, label: '935 g target' }] }));
    reg2(slider(c, { label: 'Balance point', min: 30, max: 50, step: 0.5, help: 'How far the weight sits from the handle — head-heavy carries more punch.',
      get: function () { return S.racket.balance; }, set: function (v) { S.racket.balance = v; }, fmt: function (v) { return v.toFixed(1) + ' cm'; } }));
    reg2(selector(c, { label: 'String gauge', options: [{ value: 1.20, label: '1.20 mm' }, { value: 1.25, label: '1.25 mm' }, { value: 1.30, label: '1.30 mm' }, { value: 1.35, label: '1.35 mm' }, { value: 1.40, label: '1.40 mm' }, { value: 1.50, label: '1.50 mm' }], get: function () { return S.racket.gauge; }, set: function (v) { S.racket.gauge = parseFloat(v); } }));
    reg2(slider(c, { label: 'String tension', min: 40, max: 70, step: 1, help: 'Tighter strings feel firmer; looser strings trampoline more.', get: function () { return S.racket.tension; }, set: function (v) { S.racket.tension = v; }, fmt: function (v) { return v + ' lb'; } }));
    reg2(slider(c, { label: 'Swing path (up angle)', min: 0, max: 30, step: 1, help: 'How steeply up the racket is moving through contact.', get: function () { return S.racket.swing; }, set: function (v) { S.racket.swing = v; }, fmt: function (v) { return v + '°'; } }));
    reg2(toggle(c, { label: 'Face angle: Auto', get: function () { return S.racket.face === 'Auto'; }, set: function (v) { S.racket.face = v ? 'Auto' : S.racket.faceVal; buildRacket(); } }));
    if (S.racket.face !== 'Auto') reg2(slider(c, { label: 'Face angle', min: -10, max: 45, step: 1, help: 'Open (positive) tilts the face up for more loft and backspin.', get: function () { return S.racket.faceVal; }, set: function (v) { S.racket.faceVal = v; S.racket.face = v; }, fmt: function (v) { return v + '°'; } }));
    reg2(pills(c, { label: 'Batter strength', options: ['Kid', 'Teen', 'Adult', 'Pro'], get: function () { return S.racket.batter; }, set: function (v) { S.racket.batter = v; } }));
    reg2(toggle(c, { label: 'Realistic batter (timing/contact error)', get: function () { return S.racket.realistic; }, set: function (v) { S.racket.realistic = v; } }));
  }

  function buildPresets() {
    var c = $('ballPresets'); c.innerHTML = '';
    P.presets.forEach(function (pr) {
      var b = document.createElement('button'); b.className = 'preset'; b.textContent = pr.name;
      b.addEventListener('click', function () {
        S.ball.mass = pr.mass; S.ball.d = pr.d; S.ball.core = pr.core; S.ball.ext = pr.ext;
        if (pr.layered) { S.ball.layered = Object.assign({ memMat: 'Custom' }, pr.layered); }
        if (pr.rattle) { S.ball.rattle = Object.assign({}, pr.rattle); }
        buildBall(); apply();
      });
      c.appendChild(b);
    });
  }

  // ── engine input builders ──
  function normalizeBall() {
    var b = JSON.parse(JSON.stringify(S.ball)); b.roughOrient = S.env.roughOrient;
    if (b.core === 'Layered') {
      var L = b.layered;
      if (L.memMat && L.memMat !== 'Custom') { L.memDensity = P.materials.membrane[L.memMat]; L.solveDensity = false; var g = E.ballGeom(b); S.ball.mass = Math.round(g.m * 1000); b.mass = S.ball.mass; }
      else { L.solveDensity = true; var g2 = E.ballGeom(b); L.memDensity = g2.layers[1].dens; }
    } else if (b.core === 'Rattle') {
      var g3 = E.ballGeom(b); S.ball.mass = Math.round(g3.m * 1000); b.mass = S.ball.mass;
    }
    return b;
  }
  function racketObj() { return { mass: S.racket.mass, balance: S.racket.balance, gauge: S.racket.gauge, tension: S.racket.tension, batter: S.racket.batter, swing: S.racket.swing, face: S.racket.face === 'Auto' ? 'Auto' : S.racket.faceVal }; }
  function envObj() { var e = Object.assign({}, S.env); e.pitchDist = P.pitchDist[S.mode]; return e; }

  // ── live recompute (perfect swing) ──
  var rafPending = false, lastGeom = null;
  function apply() { save(); if (rafPending) return; rafPending = true; requestAnimationFrame(function () { rafPending = false; recompute(); }); }
  function recompute() {
    var ball = normalizeBall();
    var geom = E.ballGeom(ball); lastGeom = geom;
    // refresh mass slider text if derived
    refreshers.forEach(function (c) { if (c._panel === 'ball' && c.refresh && c.label === undefined) {} });
    R.crossSection($('xsec'), geom, [0, 0, 0]);
    var res;
    try { res = E.fullHit(ball, racketObj(), S.pitch, S.speed, envObj(), S.mode, { fast: true }); }
    catch (e) { res = null; }
    if (res) { lastResult = res; drawResults(res, geom); if (S.racket.face === 'Auto') updateAutoFaceLabel(res.faceUsed); }
    warnings(geom);
    refreshMassLabels();
    drawView();
  }
  function refreshMassLabels() {
    // re-render ball sliders' value labels (mass may be derived)
    refreshers.forEach(function (c) { if (c._panel === 'ball' && c.refresh) c.refresh(); });
  }
  function updateAutoFaceLabel() {}

  function drawResults(res, geom) {
    var meter = curveMeterVals(geom);
    var stats = [
      ['Carry', mFt(res.carry)], ['Total (w/ roll)', mFt(res.total)],
      ['Exit speed', msMph(res.exitSpeed)], ['Launch angle', res.launch.toFixed(0) + '°'],
      ['Backspin', Math.round(res.backspin) + ' rpm'], ['Pitch break', cmIn(res.totalBreak)],
      ['Time to plate', res.timeToPlate.toFixed(2) + ' s'], ['Density factor', geom.densityFactor.toFixed(2) + ' g/cm²']
    ];
    var html = stats.map(function (s) {
      var parts = s[1].split(' · ');
      return '<div class="stat"><div class="k">' + s[0] + '</div><div class="v">' + parts[0] + '</div>' + (parts[1] ? '<div class="v2">' + parts[1] + '</div>' : '') + '</div>';
    }).join('');
    $('results').innerHTML = html;
    var cPct = Math.min(100, res.carry / 150 * 100), kPct = Math.min(100, meter.curve / 60 * 100);
    $('dvcMeter').innerHTML = '<div class="k" style="font-size:9px;color:var(--muted)">DISTANCE vs CURVE</div>' +
      '<div class="bar"><div style="width:' + cPct + '%;background:var(--purple-lt)"></div></div>' +
      '<div style="font-size:9px">carry ' + res.carry.toFixed(0) + ' m</div>' +
      '<div class="bar"><div style="width:' + kPct + '%;background:var(--green-lt)"></div></div>' +
      '<div style="font-size:9px">max curve ' + meter.curve.toFixed(0) + ' cm' + (res.bottomed ? ' · <span style="color:var(--warn)">strings bottomed out</span>' : '') + '</div>';
  }
  function curveMeterVals(geom) { var c = E.curveScore(normalizeBall(), S.speed, envObj(), S.mode); return { curve: c }; }

  function warnings(geom) {
    var bw = [], rw = [];
    if (geom.note) bw.push(['warn', geom.note]);
    if (S.ball.mass > 100 && S.racket.gauge < 1.35) rw.push(['warn', 'Strings likely to break or notch quickly with this ball.']);
    else if ((S.ball.ext === 'Seamed' || S.ball.ext === 'Dimpled') && S.racket.gauge < 1.30) rw.push(['warn', 'Strings likely to break or notch quickly with this ball.']);
    if (S.racket.mass > 450) rw.push(['warn', 'Beyond normal tennis frames. Needs a purpose-built reinforced frame.']);
    if (S.ball.core === 'Air' && S.ball.mass > 90) bw.push(['warn', 'Air cores this heavy need a very thick shell. Consider the Layered core.']);
    $('ballWarnings').innerHTML = bw.map(function (n) { return '<div class="note-line ' + n[0] + '">' + n[1] + '</div>'; }).join('');
    $('racketWarnings').innerHTML = rw.map(function (n) { return '<div class="note-line ' + n[0] + '">' + n[1] + '</div>'; }).join('');
  }

  // ── views ──
  var lastResult = null, markers = [], sprayHits = null;
  function drawView() {
    var cv = $('sim');
    if (S.view === 'pitch') { if (lastResult) R.pitchView(cv, lastResult, 1, S.mode); else blank(cv); }
    else if (S.view === 'field') R.fieldView(cv, lastResult, S.mode, markers);
    else if (S.view === 'side') { if (lastResult) R.sideProfile(cv, lastResult); else blank(cv); }
    else if (S.view === 'spray') { if (sprayHits) R.sprayChart(cv, sprayHits, S.mode); else blank(cv); }
  }
  function blank(cv) { var f = R.fit(cv), g = f.g; g.fillStyle = '#04100a'; g.fillRect(0, 0, f.w, f.h); g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = "11px 'Space Mono'"; g.textAlign = 'center'; g.fillText('Press LAUNCH', f.w / 2, f.h / 2); }

  // ── realistic batter hit ──
  var seedCtr = 1;
  function rand(seed) { var x = Math.sin(seed * 99991) * 10000; return x - Math.floor(x); }
  function gauss(seed) { var u = rand(seed) || 1e-6, v = rand(seed + 7.13); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function hitOnce(ball, seed) {
    var geom = E.ballGeom(ball), env = envObj();
    var pit = E.pitch(ball, S.pitch, S.speed, env, S.mode, seed);
    var face = S.racket.face === 'Auto' ? E.bestFace(pit, geom, racketObj(), env, S.mode, {}) : S.racket.faceVal;
    var spray = 0, sweet = 0, faceTilt = 0, miss = false;
    if (S.racket.realistic) {
      var er = P.batterErr[S.racket.batter];
      var tMs = gauss(seed) * er.timing * 1000; spray = tMs * 1.5;               // 1.5° per ms
      var vErr = gauss(seed + 2.1) * (er.vert + 0.3 * (pit.lateBreak / 100));    // late break makes it harder
      sweet = gauss(seed + 3.3) * er.sweet / 100;                                // m
      if (Math.abs(vErr) > geom.r + 0.01) miss = true;
      faceTilt = Math.asin(Math.max(-1, Math.min(1, vErr / (geom.r + 0.01)))) * 180 / Math.PI;
    }
    if (miss) return { miss: true, pitch: pit, geom: geom };
    var col = E.collide(pit.arrivalV, pit.spin, geom, racketObj(), face + faceTilt, S.racket.swing, spray, sweet);
    var surface = S.mode === 'indoor' ? 'Gym hardwood' : 'Outfield grass';
    var bat = E.battedFlight(col.vOut, col.wOut, geom, env, surface, { indoor: S.mode === 'indoor' });
    return { carry: bat.carry, total: bat.total, apex: bat.apex, hang: bat.hang, cleared: bat.cleared,
      exitSpeed: col.exitSpeed, launch: col.launchDeg, backspin: col.backspinRpm, bottomed: col.bottomed,
      totalBreak: pit.totalBreak, timeToPlate: pit.timeToPlate, faceUsed: face, densityFactor: geom.densityFactor,
      pitch: pit, batted: bat, geom: geom, landing: bat.landing, rest: bat.rest };
  }

  // ── animation ──
  var anim = null;
  function stopAnim() { if (anim) { cancelAnimationFrame(anim); anim = null; } }
  function launch() {
    stopAnim();
    var ball = normalizeBall();
    var res = hitOnce(ball, seedCtr++);
    lastResult = res;
    if (res.miss) { beep(160, 0.18, 'sawtooth', 0.05); flash('SWING AND MISS'); S.view = 'pitch'; markTabs(); drawView(); return; }
    markers.push(res.landing); if (markers.length > 5) markers.shift();
    drawResults(res, res.geom);
    // play: pitch phase -> contact -> field phase
    S.view = 'pitch'; markTabs();
    var cv = $('sim'); var t0 = performance.now();
    var pitchDur = 1400, fieldDur = 2600;
    stopAnim();
    function frame(now) {
      var el = now - t0;
      try {
        if (el < pitchDur) { R.pitchView(cv, res, el / pitchDur, S.mode); anim = requestAnimationFrame(frame); }
        else if (el < pitchDur + 120) { R.pitchView(cv, res, 1, S.mode); contactFlash(cv); if (!res._beeped) { res._beeped = true; beep(520, 0.05, 'square', 0.06); if (res.cleared) cheer(); } anim = requestAnimationFrame(frame); }
        else { S.view = 'field'; markTabs(); var fp = Math.min(1, (el - pitchDur - 120) / fieldDur); drawFieldProgress(cv, res, fp); if (fp < 1) anim = requestAnimationFrame(frame); else anim = null; }
      } catch (e) { anim = null; drawView(); }
    }
    anim = requestAnimationFrame(frame);
  }
  function drawFieldProgress(cv, res, prog) {
    // draw base + partial track
    var full = res.batted.samples, n = Math.max(2, Math.floor(prog * full.length));
    var partial = { batted: { samples: full.slice(0, n) }, landing: res.landing, rest: res.rest, carry: res.carry, total: res.total, cleared: prog >= 1 ? res.cleared : false };
    R.fieldView(cv, prog >= 0.999 ? res : partial, S.mode, markers);
  }
  function contactFlash(cv) { var f = R.fit(cv), g = f.g; g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(0, 0, f.w, f.h); }
  function flash(msg) { var cv = $('sim'), f = R.fit(cv), g = f.g; R.pitchView(cv, lastResult, 1, S.mode); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, f.h / 2 - 22, f.w, 44); g.fillStyle = '#e8c84a'; g.font = "bold 16px 'Press Start 2P'"; g.textAlign = 'center'; g.fillText(msg, f.w / 2, f.h / 2 + 6); }

  function launch10() {
    stopAnim();
    var ball = normalizeBall(); sprayHits = [];
    for (var i = 0; i < 10; i++) sprayHits.push(hitOnce(ball, seedCtr++));
    S.view = 'spray'; markTabs(); drawView();
  }

  // ── optimizer (worker with inline fallback) ──
  var worker = null;
  function getWorker() {
    if (worker === false) return null;
    if (!worker) { try { worker = new Worker('physics/worker.js'); } catch (e) { worker = false; return null; } }
    return worker;
  }
  function findBest() {
    var ball = normalizeBall(), btn = $('findBest'); btn.textContent = 'OPTIMIZING… 0%';
    var w = getWorker();
    function done(o) {
      btn.textContent = '★ FIND BEST RACKET FOR DISTANCE';
      S.racket.mass = o.best.mass; buildRacket();
      R.racketChart($('racketChart'), o.curve, o.best.mass, o.best.mass);
      apply();
      var msg = 'Best racket ' + gOz(o.best.mass) + ' → ' + mFt(o.best.carry) + (o.best.risingAtTop ? ' · Distance still rising at 1000 g.' : '');
      $('racketWarnings').innerHTML = '<div class="note-line" style="background:rgba(75,40,130,0.2);color:#fff;border:1px solid var(--border)">' + msg + '</div>';
    }
    if (w) {
      w.onmessage = function (ev) { if (ev.data.cmd === 'progress') btn.textContent = 'OPTIMIZING… ' + Math.round(ev.data.pct * 100) + '%'; else if (ev.data.cmd === 'bestRacket') done(ev.data.result); };
      w.postMessage({ cmd: 'bestRacket', ball: ball, racket: racketObj(), pitchType: S.pitch, speed: S.speed, env: envObj(), mode: S.mode });
    } else { var o = E.bestRacket(ball, racketObj(), S.pitch, S.speed, envObj(), S.mode, {}); done(o); }
  }

  // ── audio (reuse simple beeps; gated by SOUND) ──
  var actx = null;
  function ac() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return actx; }
  function beep(f, d, type, v) { if (!S.sfxOn) return; try { var c = ac(); if (!c) return; var o = c.createOscillator(), a = c.createGain(); o.type = type || 'square'; o.frequency.value = f; o.connect(a); a.connect(c.destination); a.gain.setValueAtTime(v || 0.05, c.currentTime); a.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + d); o.start(); o.stop(c.currentTime + d); } catch (e) {} }
  function cheer() { if (!S.sfxOn) return; try { var c = ac(); if (!c) return; var n = c.sampleRate * 1.2, buf = c.createBuffer(1, n, c.sampleRate), dd = buf.getChannelData(0); for (var i = 0; i < n; i++) dd[i] = Math.random() * 2 - 1; var s = c.createBufferSource(); s.buffer = buf; var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; var g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2); s.connect(bp); bp.connect(g); g.connect(c.destination); s.start(); s.stop(c.currentTime + 1.2); } catch (e) {} }

  // ── tabs / mode / pitch controls ──
  function markTabs() { [].forEach.call($('viewTabs').children, function (b) { b.classList.toggle('on', b.dataset.view === S.view); }); }
  function markMode() { [].forEach.call($('modeSeg').children, function (b) { b.classList.toggle('on', b.dataset.mode === S.mode); }); }

  function buildSim() {
    var ps = $('pitchType'); ps.innerHTML = '';
    Object.keys(P.pitches).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = k + ' — ' + P.pitches[k].desc; ps.appendChild(o); });
    ps.value = S.pitch; ps.addEventListener('change', function () { S.pitch = ps.value; apply(); });
    $('pitchSel').style.display = 'none'; $('speedSel').style.display = 'none';
    var row = $('pitchSpeedRow'); row.innerHTML = '';
    reg(slider(row, { label: 'Pitch speed', min: 15, max: 50, step: 1, help: 'How hard the ball is thrown.', get: function () { return S.speed; }, set: function (v) { S.speed = v; }, fmt: msMph }));
    // conditions
    var cb = $('condBody'); cb.innerHTML = '';
    reg(slider(cb, { label: 'Temperature', min: -5, max: 40, step: 1, get: function () { return S.env.T; }, set: function (v) { S.env.T = v; }, fmt: function (v) { return v + ' °C · ' + Math.round(v * 9 / 5 + 32) + ' °F'; } }));
    reg(slider(cb, { label: 'Altitude', min: 0, max: 2500, step: 50, help: 'Thinner air at altitude means longer carry.', get: function () { return S.env.h; }, set: function (v) { S.env.h = v; }, fmt: function (v) { return v + ' m · ' + Math.round(v / FT) + ' ft'; } }));
    reg(slider(cb, { label: 'Humidity', min: 0, max: 100, step: 1, get: function () { return Math.round(S.env.RH * 100); }, set: function (v) { S.env.RH = v / 100; }, fmt: function (v) { return v + ' %'; } }));
    reg(slider(cb, { label: 'Wind speed', min: 0, max: 15, step: 0.5, get: function () { return S.env.wind; }, set: function (v) { S.env.wind = v; }, fmt: function (v) { return v.toFixed(1) + ' m/s · ' + (v / MPH).toFixed(0) + ' mph'; } }));
    reg(slider(cb, { label: 'Wind direction', min: 0, max: 360, step: 15, help: '0° blows out to centre; 180° blows in.', get: function () { return S.env.windDir; }, set: function (v) { S.env.windDir = v; }, fmt: function (v) { return v + '°'; } }));
  }

  function applyMode() {
    if (S.mode === 'indoor') { S.speed = P.pitchSpeed.indoor; $('condDrawer').style.display = 'none'; }
    else { $('condDrawer').style.display = ''; if (S.speed === P.pitchSpeed.indoor) S.speed = P.pitchSpeed.outdoor; }
  }

  // ── init ──
  function init() {
    buildBall(); buildRacket(); buildPresets(); buildSim();
    markMode(); markTabs(); applyMode();
    [].forEach.call($('modeSeg').children, function (b) { b.addEventListener('click', function () { S.mode = b.dataset.mode; markMode(); applyMode(); buildSim(); refreshAll(); apply(); }); });
    [].forEach.call($('viewTabs').children, function (b) { b.addEventListener('click', function () { stopAnim(); S.view = b.dataset.view; markTabs(); drawView(); }); });
    $('launch').addEventListener('click', function () { if (ac() && actx.state === 'suspended') actx.resume(); launch(); });
    $('launch10').addEventListener('click', launch10);
    $('findBest').addEventListener('click', findBest);
    var bm = $('mMusic'), bs = $('mSfx');
    function markAudio() { bs.classList.toggle('off', !S.sfxOn); bm.classList.toggle('off', !S.musicOn); }
    bs.addEventListener('click', function () { S.sfxOn = !S.sfxOn; markAudio(); save(); });
    bm.addEventListener('click', function () { S.musicOn = !S.musicOn; markAudio(); save(); });
    markAudio();
    window.addEventListener('resize', function () { if (lastGeom) R.crossSection($('xsec'), lastGeom, [0, 0, 0]); drawView(); });
    recompute();
    // expose for debugging / tests-in-browser
    window.__phys = { S: S, recompute: recompute, hitOnce: hitOnce };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
