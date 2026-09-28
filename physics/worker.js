/* CastleBall Game Physics — optimizer worker. Runs sweeps off the main thread. */
importScripts('params.js', 'engine.js');
var E = self.PhysEngine;

self.onmessage = function (ev) {
  var d = ev.data;
  if (d.cmd === 'bestRacket') {
    var o = E.bestRacket(d.ball, d.racket, d.pitchType, d.speed, d.env, d.mode, { onProgress: function (p) { self.postMessage({ cmd: 'progress', pct: p }); } });
    self.postMessage({ cmd: 'bestRacket', result: o });
  } else if (d.cmd === 'exploreMass') {
    var out = [], base = d.ball;
    for (var m = 20; m <= 200; m += 10) {
      var ball = JSON.parse(JSON.stringify(base)); ball.mass = m;
      var br = E.bestRacket(ball, d.racket, d.pitchType, d.speed, d.env, d.mode, {});
      var curve = E.curveScore(ball, d.speed, d.env, d.mode);
      out.push({ mass: m, carry: br.best.carry, bestMass: br.best.mass, curve: curve });
      self.postMessage({ cmd: 'progress', pct: (m - 20) / 180 });
    }
    // balanced point: closest normalized carry vs curve
    var cMax = 0, kMax = 0;
    out.forEach(function (p) { cMax = Math.max(cMax, p.carry); kMax = Math.max(kMax, p.curve); });
    var balanced = out[0], bestGap = 1e9;
    out.forEach(function (p) { var gap = Math.abs(p.carry / (cMax || 1) - p.curve / (kMax || 1)); if (gap < bestGap) { bestGap = gap; balanced = p; } });
    self.postMessage({ cmd: 'exploreMass', result: { curve: out, balanced: balanced } });
  }
};
