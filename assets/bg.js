/* ============================================================
   bg.js — living AST / LLVM node-graph background
   Drifting nodes + nearest-neighbour edges. Reacts to the
   blue-green deploy state and parallaxes with scroll.
   ============================================================ */
(function () {
  "use strict";
  var canvas = document.getElementById("bg");
  if (!canvas) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  var reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;

  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  var nodes = [];
  var scrollY = 0, targetScroll = 0;

  function accent() {
    return document.documentElement.getAttribute("data-state") === "green"
      ? [54, 224, 160] : [79, 139, 255];
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  function build() {
    var count = Math.round(Math.min(118, Math.max(46, (W * H) / 17000)));
    nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.7 + 0.7,
        d: Math.random() * 0.7 + 0.3,           // parallax depth
        p: Math.random() * Math.PI * 2          // pulse phase
      });
    }
  }

  function frame(t) {
    var a = accent();
    var ar = a[0], ag = a[1], ab = a[2];
    scrollY += (targetScroll - scrollY) * 0.06;

    ctx.clearRect(0, 0, W, H);

    var n = nodes.length, i, j, p, q;
    for (i = 0; i < n; i++) {
      p = nodes[i];
      if (!reduce) { p.x += p.vx; p.y += p.vy; }
      if (p.x < -40) p.x = W + 40; else if (p.x > W + 40) p.x = -40;
      if (p.y < -40) p.y = H + 40; else if (p.y > H + 40) p.y = -40;
      p._sy = p.y - scrollY * 0.05 * p.d;
    }

    // edges — nearest neighbours, like an AST / dependency graph
    var MAX = 132, MAX2 = MAX * MAX;
    ctx.lineWidth = 1;
    for (i = 0; i < n; i++) {
      p = nodes[i];
      for (j = i + 1; j < n; j++) {
        q = nodes[j];
        var dx = p.x - q.x, dy = p._sy - q._sy;
        var d2 = dx * dx + dy * dy;
        if (d2 < MAX2) {
          var alpha = (1 - d2 / MAX2) * 0.16;
          ctx.strokeStyle = "rgba(" + ar + "," + ag + "," + ab + "," + alpha + ")";
          ctx.beginPath();
          ctx.moveTo(p.x, p._sy);
          ctx.lineTo(q.x, q._sy);
          ctx.stroke();
        }
      }
    }

    // nodes
    for (i = 0; i < n; i++) {
      p = nodes[i];
      var pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(t * 0.001 + p.p);
      var r = p.r + pulse * 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p._sy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + ar + "," + ag + "," + ab + "," + (0.25 + pulse * 0.45) + ")";
      ctx.fill();
      if (pulse > 0.85) {
        ctx.beginPath();
        ctx.arc(p.x, p._sy, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + ar + "," + ag + "," + ab + ",0.05)";
        ctx.fill();
      }
    }

    if (!reduce && !document.hidden) requestAnimationFrame(frame);
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !reduce) requestAnimationFrame(frame);
  });
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("scroll", function () {
    targetScroll = window.scrollY || window.pageYOffset || 0;
  }, { passive: true });

  resize();
  if (reduce) { scrollY = targetScroll; frame(0); }
  else requestAnimationFrame(frame);
})();
