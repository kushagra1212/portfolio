/* ============================================================
   pipeline.js — the scroll-driven compiler experience
   Boot log · blue-green state · reveals · rail · tokens ·
   count-ups · the 1,600-dot static-analysis canvas
   ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- year ---------- */
  var yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();

  /* full-time experience — computed from Jul 2024 (years + months), never stale */
  var yx = $("#yrsExp");
  if (yx) {
    var now = new Date();
    var months = (now.getFullYear() - 2024) * 12 + (now.getMonth() - 6);
    if (now.getDate() < 1) months--;
    if (months < 0) months = 0;
    var y = Math.floor(months / 12), m = months % 12, parts = [];
    if (y > 0) parts.push(y + " yr" + (y > 1 ? "s" : ""));
    if (m > 0) parts.push(m + " mo");
    yx.textContent = parts.length ? parts.join(" ") : "just started";
  }

  /* ---------- boot terminal ---------- */
  var bootLines = [
    ['c-dim', "$ "], ['', "flowwing build career.fg --release\n"],
    ['c-dim', "flowwing "], ['c-dim', "(built in C++/LLVM · the author wrote this compiler)\n\n"],
    ['c-dim', "[lexer]   "], ['', "tokenizing 4 roles, 8+ projects, since 2021\n"],
    ['c-dim', "[parser]  "], ['', "AST ok — root: "], ['c-kw', "Flow-Wing"], ['', " (C++/LLVM)\n"],
    ['c-dim', "[opt]     "], ['c-ok', "3 optimization passes ok "], ['c-dim', "→ see Optimizer\n"],
    ['c-dim', "[link]    "], ['', "full-stack: Badho · BuyProperly · DocsUp\n"],
    ['c-dim', "[codegen] "], ['', "emitting "], ['c-amber', "portfolio.native"], ['', "\n"],
    ['c-dim', "[jit]     "], ['c-ok', "ready "], ['', "— scroll to run, or open the REPL\n\n"],
    ['c-blue', "kushagra"], ['c-dim', "@"], ['c-blue', "flowwing"], ['c-dim', ":~$ "], ['cur', " "]
  ];
  var bootEl = $("#bootLog");
  if (bootEl) {
    if (reduce) {
      bootLines.forEach(function (p) {
        var s = document.createElement("span");
        if (p[0]) s.className = p[0]; s.textContent = p[1]; bootEl.appendChild(s);
      });
    } else {
      var li = 0, ci = 0, cur = null;
      (function type() {
        if (li >= bootLines.length) return;
        if (!cur) {
          cur = document.createElement("span");
          if (bootLines[li][0]) cur.className = bootLines[li][0];
          bootEl.appendChild(cur);
        }
        var txt = bootLines[li][1];
        cur.textContent += txt.charAt(ci++);
        if (ci >= txt.length) { li++; ci = 0; cur = null; }
        var ch = txt.charAt(ci - 1);
        setTimeout(type, ch === "\n" ? 90 : (bootLines[li] && bootLines[li][0] === 'c-dim' ? 6 : 13));
      })();
    }
  }

  /* accent stays a single calm blue; the only blue→green hint is the
     subtle gradient on the rail fill + optimizer passes. No toggle,
     no mouse flip — the deploy story lives in the work, not the chrome. */
  var html = document.documentElement;

  /* ---------- node spotlight (mouse follow) ---------- */
  $$(".node").forEach(function (n) {
    n.addEventListener("mousemove", function (e) {
      var r = n.getBoundingClientRect();
      n.style.setProperty("--mx", (e.clientX - r.left) + "px");
      n.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  /* ---------- reveal on scroll ---------- */
  $$(".stage-head, .ast, .passes, .timeline, .analysis-wrap, .ide, .emit, .hero-copy")
    .forEach(function (el) { el.classList.add("reveal"); });
  var io = new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.12 });
  $$(".reveal").forEach(function (el) { io.observe(el); });

  /* ---------- left rail progress + active stage ---------- */
  var fill = $("#railFill");
  var railItems = $$("#railStages li");
  var stages = railItems.map(function (li) { return $("#" + li.dataset.target); });
  railItems.forEach(function (li) {
    li.addEventListener("click", function () {
      var t = $("#" + li.dataset.target);
      if (t) t.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    });
  });
  function onScroll() {
    var doc = document.documentElement;
    var p = doc.scrollTop / (doc.scrollHeight - doc.clientHeight || 1);
    if (fill) fill.style.height = (p * 100).toFixed(2) + "%";
    var mid = window.innerHeight * 0.4, active = 0;
    stages.forEach(function (s, i) {
      if (s && s.getBoundingClientRect().top <= mid) active = i;
    });
    railItems.forEach(function (li, i) { li.classList.toggle("on", i === active); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- 01 · token stream (grouped by class) ---------- */
  var TOKEN_GROUPS = [
    ['keyword', 'languages',   ['C++', 'C', 'TypeScript', 'JavaScript', 'SQL']],
    ['type',    'frameworks',  ['React', 'Node.js', 'Next.js', 'React Native', 'Expo', 'Redux', 'Express', 'Angular']],
    ['infra',   'infra & db',  ['PostgreSQL', 'MySQL', 'MongoDB', 'AWS S3', 'AWS RDS', 'Athena', 'Glue', 'Azure Functions', 'Docker']],
    ['ident',   'tooling',     ['LLVM', 'Hasura', 'GraphQL', 'Socket.io', 'TypeSense', 'MMKV', 'RevoPush', 'Datadog', 'pg_repack']],
    ['concept', 'foundations', ['DSA', 'OOP', 'DBMS', 'OS', 'Complexity Analysis']]
  ];
  var ts = $("#tokenStream");
  if (ts) {
    TOKEN_GROUPS.forEach(function (grp) {
      var g = document.createElement("div");
      g.className = "tok-group"; g.setAttribute("data-k", grp[0]);
      var h = document.createElement("h3"); h.setAttribute("data-k", grp[0]);
      var nm = document.createElement("span"); nm.className = "tg-name"; nm.textContent = grp[1];
      var ct = document.createElement("span"); ct.className = "tg-count"; ct.textContent = grp[2].length;
      h.appendChild(nm); h.appendChild(ct);
      var row = document.createElement("div"); row.className = "tok-row";
      grp[2].forEach(function (label) {
        var el = document.createElement("span");
        el.className = "tok"; el.setAttribute("data-k", grp[0]); el.textContent = label;
        row.appendChild(el);
      });
      g.appendChild(h); g.appendChild(row); ts.appendChild(g);
    });
    var tio = new IntersectionObserver(function (e) {
      e.forEach(function (en) {
        if (en.isIntersecting) {
          $$(".tok", ts).forEach(function (el, i) {
            setTimeout(function () { el.classList.add("in"); }, reduce ? 0 : i * 22);
          });
          tio.disconnect();
        }
      });
    }, { threshold: 0.12 });
    tio.observe(ts);
  }

  /* ---------- live Flow-Wing version from GitHub (never a stale claim) ---------- */
  (function () {
    var fgv = $("#fgVer"), idev = $("#ideVer");
    if (!fgv && !idev) return;
    function setVer(tag) {
      if (!tag) return;
      if (fgv) fgv.textContent = " (latest " + tag + ")";
      if (idev) idev.textContent = tag + " · ";
    }
    var base = "https://api.github.com/repos/kushagra1212/Flow-Wing/";
    fetch(base + "releases/latest").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.tag_name) return setVer(d.tag_name);
        return fetch(base + "tags").then(function (r) { return r.ok ? r.json() : null; })
          .then(function (a) { if (a && a[0] && a[0].name) setVer(a[0].name); });
      }).catch(function () {});
  })();

  /* ---------- count-up numbers (analysis stats + opt passes) ---------- */
  function countUp(el) {
    var to = parseInt(el.dataset.count, 10);
    var pre = el.dataset.prefix || "", suf = el.dataset.suffix || "";
    if (reduce) { el.textContent = pre + to + suf; return; }
    var dur = 1100, t0 = null;
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = pre + Math.round(e * to) + suf;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var cio = new IntersectionObserver(function (e) {
    e.forEach(function (en) {
      if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); }
    });
  }, { threshold: 0.5 });
  $$("[data-count]").forEach(function (el) { cio.observe(el); });

  /* ---------- 05 · matrix code-rain behind the REPL ----------
     The old green particle effect, repurposed: ambient Flow-Wing
     glyphs falling behind the terminal. Forms no text — pure mood.
     Paused when offscreen or tab hidden; faint+static if reduced. */
  var rc = $("#rain");
  if (rc) {
    var rctx = rc.getContext("2d");
    var RDPR = Math.min(window.devicePixelRatio || 1, 2);
    var GLYPHS = "01{}()<>;=_+*/λ→fgfnvarbring".split("");
    var cols = [], fs = 16, rw = 0, rh = 0, running = false, last = 0, rraf;

    function sizeRain() {
      var box = (rc.parentElement || rc).getBoundingClientRect();
      var w = Math.round(box.width), h = Math.round(box.height);
      if (!w || !h) return false;
      rw = w; rh = h;
      rc.width = w * RDPR; rc.height = h * RDPR;
      rctx.setTransform(RDPR, 0, 0, RDPR, 0, 0);
      fs = w < 560 ? 13 : 16;
      var n = Math.ceil(w / fs);
      cols = [];
      for (var i = 0; i < n; i++) cols.push(Math.floor(Math.random() * (h / fs)));
      return true;
    }
    function g(i, row) { return GLYPHS[((i * 7 + row) % GLYPHS.length + GLYPHS.length) % GLYPHS.length]; }
    function drawRain(t) {
      if (!cols.length && !sizeRain()) { if (running) rraf = requestAnimationFrame(drawRain); return; }
      var w = rw, h = rh;
      if (!reduce && t - last < 55) { if (running) rraf = requestAnimationFrame(drawRain); return; }
      last = t;
      rctx.clearRect(0, 0, w, h);
      rctx.font = "600 " + fs + "px ui-monospace,monospace";
      for (var i = 0; i < cols.length; i++) {
        var x = i * fs, y = cols[i] * fs;
        for (var k = 1; k <= 6; k++) {
          if (y - k * fs < 0) break;
          rctx.fillStyle = "rgba(54,224,160," + (0.05 * (6 - k)) + ")";
          rctx.fillText(g(i, cols[i] - k), x, y - k * fs);
        }
        rctx.fillStyle = "rgba(122,255,205,0.85)";
        rctx.fillText(g(i, cols[i]), x, y);
        if (!reduce) {
          cols[i]++;
          if (y > h && Math.random() > 0.975) cols[i] = 0;
        }
      }
      if (!reduce && !document.hidden && running) rraf = requestAnimationFrame(drawRain);
    }
    var rio = new IntersectionObserver(function (en) {
      en.forEach(function (x) {
        if (x.isIntersecting) {
          if (!cols.length) sizeRain();
          if (reduce) { drawRain(0); }
          else if (!running) { running = true; rraf = requestAnimationFrame(drawRain); }
        } else { running = false; }
      });
    }, { threshold: 0.04 });
    rio.observe($("#repl") || rc);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && running && !reduce) rraf = requestAnimationFrame(drawRain);
    });
    window.addEventListener("resize", function () {
      sizeRain(); if (reduce) drawRain(0);
    }, { passive: true });
  }

  /* ---------- 06 · emit log (types when scrolled into view) ---------- */
  var emit = $("#emitLog");
  if (emit) {
    var emitTxt =
      "$ flowwing emit --target=team\n" +
      "[emit] resolving symbols ......... ok\n" +
      "[emit] full-stack    -> linked\n" +
      "[emit] compiler edge -> linked\n" +
      "[emit] availability  -> open\n" +
      "[emit] writing portfolio.native\n\n" +
      "build succeeded — 0 errors, 0 warnings\n" +
      "→ run: reach out on any channel ↗";
    function paintEmit() {
      if (reduce) { emit.textContent = emitTxt; return; }
      var i = 0;
      (function tw() {
        emit.textContent = emitTxt.slice(0, i++);
        if (i <= emitTxt.length) setTimeout(tw, 10);
      })();
    }
    var eio = new IntersectionObserver(function (en) {
      en.forEach(function (x) {
        if (x.isIntersecting) { paintEmit(); eio.disconnect(); }
      });
    }, { threshold: 0.4 });
    eio.observe(emit);
  }

  /* ---------- 06 · particle-text — the emitted binary forms "kushagra.fg" ----------
     Reused scatter→converge effect: ~1.6k green particles assemble
     into the build artifact. One-time reveal, paused offscreen/hidden,
     static if reduced-motion. */
  var pcv = $("#emitParticles");
  if (pcv) {
    var pctx = pcv.getContext("2d");
    var PDPR = Math.min(window.devicePixelRatio || 1, 2);
    var pdots = [], pw = 0, ph = 0, pstarted = false, pprog = 0, praf;

    function pSize() {
      var box = pcv.getBoundingClientRect();
      var w = Math.round(box.width), h = Math.round(box.height);
      if (!w || !h) return false;
      pw = w; ph = h;
      pcv.width = w * PDPR; pcv.height = h * PDPR;
      pctx.setTransform(PDPR, 0, 0, PDPR, 0, 0);
      pBuild(w, h);
      return true;
    }
    function pBuild(w, h) {
      var off = document.createElement("canvas");
      off.width = w; off.height = h;
      var o = off.getContext("2d");
      o.fillStyle = "#fff"; o.textAlign = "center"; o.textBaseline = "middle";
      var fsz = Math.min(w / 7.6, 130);
      o.font = "800 " + fsz + "px ui-monospace,monospace";
      o.fillText("kushagra.fg", w / 2, h * 0.45);
      o.font = "600 " + (fsz * 0.2) + "px ui-monospace,monospace";
      o.fillText("BUILD SUCCEEDED · 0 ERRORS", w / 2, h * 0.84);
      var img = o.getImageData(0, 0, w, h).data, t = [], gap = 5, x, y;
      for (y = 0; y < h; y += gap)
        for (x = 0; x < w; x += gap)
          if (img[(y * w + x) * 4 + 3] > 128) t.push([x, y]);
      var N = Math.min(1600, t.length || 1);
      pdots = [];
      for (var i = 0; i < N; i++) {
        var tg = t.length ? t[(i * 9301 + 49297) % t.length] : [w / 2, h / 2];
        pdots.push({
          x: Math.random() * w, y: Math.random() * h,
          tx: tg[0] + (Math.random() - 0.5) * gap,
          ty: tg[1] + (Math.random() - 0.5) * gap,
          ph: Math.random() * 6.28
        });
      }
    }
    function pDraw(tm) {
      if (!pdots.length && !pSize()) { if (pstarted) praf = requestAnimationFrame(pDraw); return; }
      pctx.clearRect(0, 0, pw, ph);
      if (!reduce && pprog < 1) pprog += 0.014; else if (reduce) pprog = 1;
      var e = 1 - Math.pow(1 - pprog, 3);
      for (var i = 0; i < pdots.length; i++) {
        var d = pdots[i];
        var x = d.x + (d.tx - d.x) * e, y = d.y + (d.ty - d.y) * e;
        var jit = reduce ? 0 : Math.sin(tm * 0.002 + d.ph) * (1 - e) * 5;
        pctx.fillStyle = "rgba(54,224,160," + (0.12 + e * 0.7) + ")";
        pctx.fillRect(x + jit, y, 2, 2);
      }
      if (!reduce && !document.hidden && pstarted && pprog < 1.15) praf = requestAnimationFrame(pDraw);
    }
    var pio = new IntersectionObserver(function (en) {
      en.forEach(function (z) {
        if (z.isIntersecting && !pstarted) {
          pstarted = true; pSize();
          if (reduce) { pprog = 1; pDraw(0); }
          else praf = requestAnimationFrame(pDraw);
        }
      });
    }, { threshold: 0.25 });
    pio.observe(pcv);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && pstarted && !reduce && pprog < 1) praf = requestAnimationFrame(pDraw);
    });
    window.addEventListener("resize", function () {
      if (!pstarted) return;
      pprog = 0; pSize();
      if (!reduce && !document.hidden) praf = requestAnimationFrame(pDraw);
      else pDraw(0);
    }, { passive: true });
  }
})();
