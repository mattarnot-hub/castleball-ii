/* CastleBall Game Physics — canvas rendering & animation (no physics; draws precomputed trajectories). */
(function (root) {
  'use strict';
  var COL = { bg: '#04100a', grass: '#12643c', grassLt: '#1c8a50', dirt: '#7a5535', line: '#ffffff',
    purple: '#4b2882', purpleLt: '#a98be6', ball: '#fbfbf4', ref: 'rgba(255,255,255,0.35)',
    text: '#ffffff', muted: 'rgba(255,255,255,0.55)', wood: '#b98a4a', wall: '#3d2470', warn: '#e8c84a' };
  var OZ = 28.35;
  function gOz(g) { return Math.round(g) + ' g · ' + (g / OZ).toFixed(1) + ' oz'; }

  function fit(cv) {
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var w = cv.clientWidth || cv.width, h = cv.clientHeight || (cv.width * (cv.height / cv.width));
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g: g, w: w, h: h };
  }

  // ── ball cross-section, to scale, labelled ──
  function crossSection(cv, geom, innerPos) {
    var f = fit(cv), g = f.g, w = f.w, h = f.h;
    g.clearRect(0, 0, w, h); g.fillStyle = COL.bg; g.fillRect(0, 0, w, h);
    var cx = w * 0.36, cy = h / 2;
    var R = Math.min(h * 0.42, w * 0.30);
    var scale = R / geom.r;
    var pal = ['#5a3aa0', '#a98be6', '#123a24', '#c9a5ff'];
    // draw layers outer->inner
    for (var i = 0; i < geom.layers.length; i++) {
      var ly = geom.layers[i];
      if (ly.inner) continue;
      var ro = ly.rOut * scale, ri = (ly.rIn || 0) * scale;
      g.beginPath(); g.arc(cx, cy, ro, 0, 7); g.fillStyle = ly.mass > 0 ? pal[i % pal.length] : '#081a10'; g.fill();
    }
    // punch air interior
    var lastSolid = null;
    for (var j = 0; j < geom.layers.length; j++) { if (geom.layers[j].mass > 0 && !geom.layers[j].inner) lastSolid = geom.layers[j]; }
    // inner ball (rattle)
    if (geom.innerR > 0) {
      var pos = innerPos || [0, 0, 0];
      var ix = cx + (pos[2] || 0) * scale, iy = cy - (pos[1] || 0) * scale;
      // clamp visually to cavity
      var maxr = (geom.cavityR - geom.innerR) * scale;
      var dx = ix - cx, dy = iy - cy, dd = Math.hypot(dx, dy);
      if (dd > maxr) { ix = cx + dx / dd * maxr; iy = cy - (-(dy / dd * maxr)) - 0 + (cy - (cy)); iy = cy + dy / dd * maxr; }
      g.beginPath(); g.arc(ix, iy, geom.innerR * scale, 0, 7); g.fillStyle = '#c9a5ff'; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
    }
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, geom.r * scale, 0, 7); g.stroke();
    // labels
    g.font = "10px 'Space Mono',monospace"; g.textBaseline = 'middle';
    var ly2 = h * 0.16, lx = w * 0.62;
    g.fillStyle = COL.text; g.textAlign = 'left';
    g.fillText('Ø ' + Math.round(geom.d * 1000) + ' mm · ' + (geom.d * 1000 / 25.4).toFixed(1) + ' in', lx, ly2 - 20);
    for (var k = 0; k < geom.layers.length; k++) {
      var L = geom.layers[k]; if (L.mass <= 0 && !L.inner) { g.fillStyle = COL.muted; }
      else g.fillStyle = pal[k % pal.length] === '#123a24' ? COL.muted : (pal[k % pal.length]);
      var yy = ly2 + k * 20;
      g.fillStyle = COL.text;
      var tag = L.name + ': ' + (L.tMm ? L.tMm.toFixed(1) + ' mm' : '') + (L.mass > 0 ? '  ' + gOz(L.mass) : '');
      g.fillText(tag, lx, yy);
    }
    g.fillStyle = COL.purpleLt; g.font = "12px 'Space Mono',monospace";
    g.fillText('Total ' + gOz(geom.m * 1000), lx, ly2 + geom.layers.length * 20 + 6);
    g.fillStyle = COL.muted; g.font = "9px 'Space Mono',monospace";
    g.fillText('Density factor ' + geom.densityFactor.toFixed(2) + ' g/cm²', lx, ly2 + geom.layers.length * 20 + 24);
  }

  // ── racket carry-vs-mass chart ──
  function racketChart(cv, curve, curMass, bestMass) {
    var f = fit(cv), g = f.g, w = f.w, h = f.h;
    g.clearRect(0, 0, w, h); g.fillStyle = COL.bg; g.fillRect(0, 0, w, h);
    if (!curve || !curve.length) return;
    var pad = 26, x0 = pad, x1 = w - 8, y0 = h - 20, y1 = 10;
    var mn = curve[0].mass, mx = curve[curve.length - 1].mass;
    var cmax = 0; curve.forEach(function (p) { if (p.carry > cmax) cmax = p.carry; });
    cmax = Math.max(10, cmax * 1.05);
    function X(m) { return x0 + (m - mn) / (mx - mn) * (x1 - x0); }
    function Y(c) { return y0 - c / cmax * (y0 - y1); }
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.stroke();
    g.strokeStyle = COL.purpleLt; g.lineWidth = 2; g.beginPath();
    curve.forEach(function (p, i) { var x = X(p.mass), y = Y(p.carry); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    function mark(m, col, label) { var x = X(m); g.strokeStyle = col; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.font = "9px 'Space Mono'"; g.textAlign = 'center'; g.fillText(label, x, y1 + 8); }
    if (bestMass) mark(bestMass, COL.warn, 'best ' + bestMass + 'g');
    if (curMass) mark(curMass, '#fff', 'now');
    g.fillStyle = COL.muted; g.font = "9px 'Space Mono'"; g.textAlign = 'left';
    g.fillText('carry vs racket mass', x0, y1 + 2);
  }

  // ── spray chart (top-down landing spots) ──
  function sprayChart(cv, hits, mode) {
    var f = fit(cv), g = f.g, w = f.w, h = f.h;
    g.clearRect(0, 0, w, h); drawFieldBase(g, w, h, mode, spraySpan(hits, mode));
    var span = spraySpan(hits, mode), hx = w / 2, hy = h - 26, sc = (h - 60) / span;
    var carries = [];
    hits.forEach(function (H, i) {
      var lp = H.rest || H.landing || [0, 0, 0];
      var px = hx + (lp[2] || 0) * sc, py = hy - (lp[0] || 0) * sc;
      var col = H.miss ? COL.warn : (H.cleared ? COL.purpleLt : '#2fd08a');
      g.fillStyle = col; g.beginPath(); g.arc(px, py, 5, 0, 7); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
      if (!H.miss) carries.push(H.carry);
    });
    var avg = carries.length ? carries.reduce(function (a, b) { return a + b; }, 0) / carries.length : 0;
    var sd = carries.length ? Math.sqrt(carries.reduce(function (a, b) { return a + (b - avg) * (b - avg); }, 0) / carries.length) : 0;
    g.fillStyle = COL.text; g.font = "11px 'Space Mono'"; g.textAlign = 'left';
    g.fillText('avg ' + avg.toFixed(0) + ' m · ' + (avg / 0.3048).toFixed(0) + ' ft', 10, 18);
    g.fillText('spread ±' + sd.toFixed(1) + ' m', 10, 34);
    g.fillText(carries.length + '/' + hits.length + ' in play', 10, 50);
  }
  function spraySpan(hits, mode) {
    var mx = mode === 'indoor' ? 30 : 130;
    (hits || []).forEach(function (H) { var lp = H.rest || H.landing || [0, 0, 0]; mx = Math.max(mx, Math.hypot(lp[0], lp[2]) * 1.15); });
    return mx;
  }

  // ── side profile (height vs distance) ──
  function sideProfile(cv, result) {
    var f = fit(cv), g = f.g, w = f.w, h = f.h;
    g.clearRect(0, 0, w, h); g.fillStyle = COL.bg; g.fillRect(0, 0, w, h);
    var s = (result.batted && result.batted.samples) || [];
    if (!s.length) { g.fillStyle = COL.muted; g.font = "11px 'Space Mono'"; g.textAlign = 'center'; g.fillText('Press LAUNCH', w / 2, h / 2); return; }
    var mx = 10, my = 5;
    s.forEach(function (p) { mx = Math.max(mx, Math.hypot(p.p[0], p.p[2])); my = Math.max(my, p.p[1]); });
    var pad = 26, x0 = pad, x1 = w - 10, y0 = h - 20, y1 = 10;
    function X(d) { return x0 + d / mx * (x1 - x0); }
    function Y(yy) { return y0 - yy / (my * 1.1) * (y0 - y1); }
    g.strokeStyle = COL.grassLt; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.stroke();
    g.strokeStyle = COL.purpleLt; g.lineWidth = 2; g.beginPath();
    s.forEach(function (p, i) { var d = Math.hypot(p.p[0], p.p[2]); i ? g.lineTo(X(d), Y(p.p[1])) : g.moveTo(X(d), Y(p.p[1])); });
    g.stroke();
    g.fillStyle = COL.muted; g.font = "9px 'Space Mono'"; g.textAlign = 'left';
    g.fillText('apex ' + result.apex.toFixed(1) + ' m · hang ' + result.hang.toFixed(1) + ' s', x0, y1 + 4);
    g.textAlign = 'right'; g.fillText(mx.toFixed(0) + ' m', x1, y0 - 3);
  }

  // ── field base drawing (top-down) ──
  function drawFieldBase(g, w, h, mode, span) {
    g.fillStyle = COL.bg; g.fillRect(0, 0, w, h);
    var hx = w / 2, hy = h - 26, sc = (h - 60) / span;
    if (mode === 'indoor') {
      var gw = 26 * sc, gh = 15 * sc;
      g.fillStyle = COL.wood; g.fillRect(hx - gw / 2, hy - gh, gw, gh);
      g.strokeStyle = COL.wall; g.lineWidth = 4; g.strokeRect(hx - gw / 2, hy - gh, gw, gh);
      g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 1;
      for (var i = 1; i < 6; i++) { var yy = hy - gh * i / 6; g.beginPath(); g.moveTo(hx - gw / 2, yy); g.lineTo(hx + gw / 2, yy); g.stroke(); }
    } else {
      // fair wedge + fence arc
      g.fillStyle = COL.grass;
      g.beginPath(); g.moveTo(hx, hy);
      g.lineTo(hx + Math.sin(Math.PI / 4) * (span * sc), hy - Math.cos(Math.PI / 4) * (span * sc));
      g.lineTo(hx, hy - span * sc);
      g.lineTo(hx - Math.sin(Math.PI / 4) * (span * sc), hy - Math.cos(Math.PI / 4) * (span * sc));
      g.closePath(); g.fill();
      // infield dirt
      g.fillStyle = COL.dirt; g.beginPath(); g.arc(hx, hy, 27.4 * sc * 0.66, -Math.PI * 0.75, -Math.PI * 0.25); g.lineTo(hx, hy); g.closePath(); g.fill();
      // foul lines + bases
      g.strokeStyle = COL.line; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + Math.sin(Math.PI / 4) * (span * sc), hy - Math.cos(Math.PI / 4) * (span * sc)); g.stroke();
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - Math.sin(Math.PI / 4) * (span * sc), hy - Math.cos(Math.PI / 4) * (span * sc)); g.stroke();
      // fence
      g.strokeStyle = COL.wall; g.lineWidth = 3; g.beginPath();
      for (var a = -Math.PI / 4; a <= Math.PI / 4 + 0.001; a += 0.05) {
        var t = Math.min(1, Math.abs(a) / (Math.PI / 4)); var fd = 122 * (1 - t) + 99 * t;
        var x = hx + Math.sin(a) * fd * sc, y = hy - Math.cos(a) * fd * sc; a === -Math.PI / 4 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      // distance rings
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.font = "8px 'Space Mono'"; g.fillStyle = COL.muted; g.textAlign = 'center';
      [30, 60, 90, 120].forEach(function (d) { if (d * sc < h - 30) { g.beginPath(); g.arc(hx, hy, d * sc, -Math.PI * 0.75, -Math.PI * 0.25); g.stroke(); g.fillText(d + 'm', hx, hy - d * sc + 10); } });
    }
    return { hx: hx, hy: hy, sc: sc };
  }

  // ── static field-view (track + markers) ──
  function fieldView(cv, result, mode, markers) {
    var f = fit(cv), g = f.g, w = f.w, h = f.h;
    var span = Math.max(mode === 'indoor' ? 30 : 130, (result ? Math.hypot((result.rest || result.landing)[0], (result.rest || result.landing)[2]) * 1.15 : 0));
    var geo = drawFieldBase(g, w, h, mode, span);
    (markers || []).forEach(function (m, i) {
      var px = geo.hx + m[2] * geo.sc, py = geo.hy - m[0] * geo.sc;
      g.fillStyle = ['#a98be6', '#2fd08a', '#e8c84a', '#4a9edd', '#ff8fb0'][i % 5];
      g.beginPath(); g.arc(px, py, 4, 0, 7); g.fill();
    });
    if (result && result.batted) {
      var s = result.batted.samples;
      g.strokeStyle = COL.purpleLt; g.lineWidth = 2; g.beginPath();
      s.forEach(function (p, i) { var x = geo.hx + p.p[2] * geo.sc, y = geo.hy - p.p[0] * geo.sc; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
      var lp = result.landing, rp = result.rest;
      marker(g, geo.hx + lp[2] * geo.sc, geo.hy - lp[0] * geo.sc, COL.warn, result.carry.toFixed(0) + ' m · ' + (result.carry / 0.3048).toFixed(0) + ' ft');
      marker(g, geo.hx + rp[2] * geo.sc, geo.hy - rp[0] * geo.sc, '#2fd08a', 'rest ' + result.total.toFixed(0) + ' m');
      if (result.cleared) { g.fillStyle = '#fff'; g.font = "bold 16px 'Press Start 2P'"; g.textAlign = 'center'; g.fillText('HOME RUN', w / 2, 30); }
    }
  }
  function marker(g, x, y, col, label) {
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 5, y - 10); g.lineTo(x + 5, y - 10); g.closePath(); g.fill();
    g.font = "9px 'Space Mono'"; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(label, x, y - 14);
  }

  // ── pitch view (behind the plate) ──
  function pitchView(cv, result, prog, mode) {
    var f = fit(cv), g = f.g, w = f.w, h = f.h;
    g.fillStyle = COL.bg; g.fillRect(0, 0, w, h);
    var groundY = h * 0.9, topY = h * 0.18, cx = w / 2;
    // grass + mound
    g.fillStyle = COL.grass; g.fillRect(0, groundY, w, h - groundY);
    g.fillStyle = '#0d2a1a'; g.beginPath(); g.moveTo(0, groundY); g.lineTo(w * 0.32, topY); g.lineTo(w * 0.68, topY); g.lineTo(w, groundY); g.closePath(); g.fill();
    g.fillStyle = COL.dirt; g.beginPath(); g.ellipse(cx, topY + 12, 26, 8, 0, 0, 7); g.fill();
    // strike zone at plate
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.5; g.strokeRect(cx - 34, groundY - 150, 68, 90);
    var pit = result.pitch; if (!pit) return;
    var D = pit.arrivalP ? (result.geom ? 1 : 1) : 1;
    var traj = pit.trajectory, dist = traj[0].p[0] || 18.44;
    function proj(p) {
      var d = Math.max(0, Math.min(1, p[0] / dist)); // 1 far, 0 near
      var persp = 0.35 + 0.65 * (1 - d);
      var sx = cx + p[2] * 26 * persp;
      var sy = (topY + (1 - d) * (groundY - topY)) - p[1] * 22 * persp;
      return { x: sx, y: sy, s: 4 + 10 * (1 - d) };
    }
    // reference dotted path
    if (pit.refCross) {
      g.strokeStyle = COL.ref; g.setLineDash([4, 4]); g.lineWidth = 1.5; g.beginPath();
      var rel = [dist, 1.8, 0], plate = [0, pit.refCross[1], pit.refCross[2]];
      for (var t = 0; t <= 1; t += 0.05) { var pp = [rel[0] + (plate[0] - rel[0]) * t, rel[1] + (plate[1] - rel[1]) * t - 4.9 * (t * (pit.timeToPlate)) * 0, 0]; var q = proj([rel[0] * (1 - t), 1.8 + (pit.refCross[1] - 1.8) * t, pit.refCross[2] * t]); t ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
      g.stroke(); g.setLineDash([]);
    }
    // pitch path drawn so far
    var upto = Math.floor(prog * (traj.length - 1));
    g.strokeStyle = 'rgba(169,139,230,0.5)'; g.lineWidth = 2; g.beginPath();
    for (var i = 0; i <= upto; i++) { var q2 = proj(traj[i].p); i ? g.lineTo(q2.x, q2.y) : g.moveTo(q2.x, q2.y); }
    g.stroke();
    // ball
    var bp = traj[Math.min(upto, traj.length - 1)].p; var q3 = proj(bp);
    g.fillStyle = COL.ball; g.beginPath(); g.arc(q3.x, q3.y, q3.s, 0, 7); g.fill();
    g.strokeStyle = '#c00'; g.lineWidth = 1; g.beginPath(); g.arc(q3.x, q3.y, q3.s, 0, 7); g.stroke();
    // batter silhouette
    g.fillStyle = '#3a2668'; g.fillRect(cx + 46, groundY - 74, 12, 74); g.beginPath(); g.arc(cx + 52, groundY - 82, 9, 0, 7); g.fill();
    g.fillStyle = COL.muted; g.font = "9px 'Space Mono'"; g.textAlign = 'center';
    g.fillText('break ' + pit.totalBreak.toFixed(0) + ' cm', cx, h - 6);
  }

  root.PhysRender = {
    fit: fit, gOz: gOz, crossSection: crossSection, racketChart: racketChart,
    sprayChart: sprayChart, sideProfile: sideProfile, fieldView: fieldView, pitchView: pitchView, COL: COL
  };
})(typeof self !== 'undefined' ? self : this);
