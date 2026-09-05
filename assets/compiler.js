/* ============================================================
   compiler.js — a real, working REPL
   The interactive room. Hand-written shell with history,
   Tab-completion, a fake FS, and a tiny Flow-Wing interpreter.
   ============================================================ */
(function () {
  "use strict";
  var out = document.getElementById("replOut");
  var inp = document.getElementById("replIn");
  var ide = document.getElementById("ide");
  if (!out || !inp) return;

  var html = document.documentElement;
  var history = [];
  var hIdx = -1;

  /* ---------- output helpers ----------
     line(segs): segs = string | [[cls,text], ...] | array of those */
  function el(cls, text, href) {
    var e = document.createElement(href ? "a" : "span");
    if (cls) e.className = cls;
    if (href) { e.href = href; e.target = "_blank"; e.rel = "noopener"; }
    e.textContent = text;
    return e;
  }
  function line(segs) {
    var ln = document.createElement("span");
    ln.className = "ln";
    if (typeof segs === "string") ln.appendChild(document.createTextNode(segs));
    else segs.forEach(function (s) {
      if (typeof s === "string") ln.appendChild(document.createTextNode(s));
      else ln.appendChild(el(s[0], s[1], s[2]));
    });
    out.appendChild(ln);
    out.scrollTop = out.scrollHeight;
    return ln;
  }
  function blank() { line(""); }
  function head(t) { var l = line(""); var h = document.createElement("h4"); h.textContent = t; l.appendChild(h); }

  /* ---------- data ---------- */
  var FS = {
    "resume.txt": "type `resume` for the formatted version",
    "about.md": "type `whoami`",
    "Flow-Wing/": "the language that serves this site — type `flowwing`",
    "career.fg": "the real Flow-Wing program behind this page — type `source`",
    "server.fg": "the Flow-Wing program serving this page — type `server`",
    "projects/": "type `projects`",
    "contact.vcf": "type `contact`",
    ".secret": "you found it. type `sudo hire`"
  };

  var PROJECTS = {
    "flow-wing": {
      title: "Flow-Wing — programming language", tag: "C++ · LLVM",
      url: "https://github.com/kushagra1212/Flow-Wing",
      site: "https://flowwing.kushagrarathore.in/",
      lines: [
        "Experimental language: static + dynamic typing in one.",
        "Custom Lexer, Parser, IR. AOT + JIT compilers. REPL.",
        "Garbage collection, modules, OOP. Full LSP for VS Code.",
        "Actively versioned · large multi-file changes · GTest suite.",
        "This portfolio is served by it — see server.fg."
      ]
    },
    "foundo": {
      title: "Foundo — AI lost & found", tag: "React Native",
      url: "https://github.com/kushagra1212/foundo-app",
      lines: [
        "Solo, production Android app (0 → mobile experience).",
        "AI auto-matches lost ↔ found reports & notifies users.",
        "Real-time chat over WebSockets.",
        "Free OSS map via WebView — zero Google Maps cost.",
        "Node/Express · AWS RDS MySQL + S3 · Docker · Jest · Detox."
      ]
    },
    "eimentum": {
      title: "Eimentum — social platform", tag: "MERN",
      url: "https://github.com/kushagra1212",
      lines: [
        "Profiles, friend graph, disappearing stories, DMs.",
        "MongoDB · Express · React · Node · Redux.",
        "Socket.io real-time messaging. JWT + Bcrypt auth.",
        "Separate dedicated chat server."
      ]
    },
    "animehub": { title: "AnimeHub — content discovery", tag: "web",
      url: "https://github.com/kushagra1212/AnimeHub",
      lines: ["Niche anime catalog & discovery platform."] },
    "coin-tracker": { title: "Coin-Tracker-Interactive", tag: "React",
      url: "https://github.com/kushagra1212/Coin-Tracker-Interactive",
      lines: ["Live cryptocurrency metrics tracker."] },
    "yt-dl": { title: "YouTube Video Downloader", tag: "React",
      url: "https://github.com/kushagra1212",
      lines: ["Multi-format YouTube downloads, React front-end."] },
    "voice-news": { title: "Voice News", tag: "web",
      url: "https://github.com/kushagra1212",
      lines: ["Voice-recognition-driven news portal by category."] }
  };

  /* The real career.fg, embedded so `source` works on file:// too.
     Keep in sync with /career.fg (same content; that file is what
     flowwing-jit / server.fg actually serve & run). */
  var CAREER_FG = [
    "/; =========================================================",
    "/;  career.fg — Kushagra Rathore, modelled in Flow-Wing",
    "/;",
    "/;  Real Flow-Wing source — the language Kushagra built",
    "/;  (C++/LLVM). Run it with his compiler:",
    "/;",
    "/;      flowwing-jit career.fg",
    "/;      flowwing career.fg -o career && ./career",
    "/;",
    "/;  The portfolio's REPL sends `run` to the same Flow-Wing",
    "/;  engine that powers flowwing.kushagrarathore.in (POST /run).",
    "/; =========================================================",
    "",
    "fun whoami() -> nthg {",
    "    println(\"Kushagra Rathore\")",
    "    println(\"Full-Stack Engineer - author of the Flow-Wing language\")",
    "    println(\"Full-time since Jul 2024 (post-internship)\")",
    "    println(\"Cut infra cost, latency and bundle size in production.\")",
    "}",
    "",
    "fun projects() -> nthg {",
    "    println(\"Flow-Wing  - programming language (C++/LLVM, AOT/JIT, LSP)\")",
    "    println(\"Foundo     - AI lost and found (React Native, Node, AWS)\")",
    "    println(\"Eimentum   - MERN social platform (Socket.io, JWT)\")",
    "    println(\"plus AnimeHub, Coin-Tracker, YT-DL, Voice-News\")",
    "}",
    "",
    "fun impact() -> nthg {",
    "    println(\"-11%  cloud infra bill   (blue-green, pg_repack, Athena/S3)\")",
    "    println(\"-85%  user-facing latency (API restructure)\")",
    "    println(\"-35%  app download size   (RN, MMKV, RevoPush)\")",
    "    println(\"gone  GraphQL CPU bottleneck\")",
    "}",
    "",
    "fun contact() -> nthg {",
    "    println(\"email    : kushagrarathore002@gmail.com\")",
    "    println(\"github   : github.com/kushagra1212\")",
    "    println(\"flow-wing: https://flowwing.kushagrarathore.in\")",
    "}",
    "",
    "fun fg_main() -> nthg {",
    "    println(\"=== Kushagra Rathore - compiled by Flow-Wing ===\")",
    "    println(\"\")",
    "    whoami()",
    "    println(\"\")",
    "    projects()",
    "    println(\"\")",
    "    impact()",
    "    println(\"\")",
    "    contact()",
    "}",
    "",
    "fg_main()"
  ];

  /* ---------- commands ---------- */
  var COMMANDS = {
    help: function () {
      head("Flow-Wing REPL — command reference");
      var rows = [
        ["whoami", "who is Kushagra"],
        ["skills", "the tokenized stack  (skills <cat>)"],
        ["projects", "list projects · open <name> for detail"],
        ["experience", "roles & timeline"],
        ["impact", "optimizer passes — real metrics"],
        ["flowwing", "the language he built"],
        ["server", "how this page is served by Flow-Wing"],
        ["source", "view career.fg — the real Flow-Wing source"],
        ["cp", "competitive programming proof"],
        ["education", "degree & mentorship"],
        ["contact", "every channel"],
        ["resume", "formatted resume"],
        ["run <code>", "execute REAL Flow-Wing  e.g. run println(2+2)"],
        ["ls / cat <f>", "poke around the filesystem"],
        ["theme blue|green", "flip the deploy state"],
        ["clear", "wipe the screen"]
      ];
      rows.forEach(function (r) {
        line([["o-acc", "  " + r[0].padEnd(18)], ["o-dim", r[1]]]);
      });
      blank();
      line([["o-dim", "  hidden: "], ["o-dim", "sudo hire · neofetch · date · echo"]]);
    },

    whoami: function () {
      head("Kushagra Rathore");
      line([["o-dim", "role     "], "Full-Stack Engineer @ Badho Technologies"]);
      line([["o-dim", "edge     "], "author of the ", ["o-kw", "Flow-Wing"], " language (C++/LLVM)"]);
      line([["o-dim", "based    "], "Gurugram, India"]);
      line([["o-dim", "stack    "], "C++ · TypeScript · React/RN · Node · PostgreSQL · AWS"]);
      blank();
      line("Ships products end-to-end — backend, mobile and infra.");
      line([["o-dim", "see "], ["o-acc", "impact"], ["o-dim", " for metrics · "], ["o-acc", "projects"], ["o-dim", " for work."]]);
    },

    skills: function (a) {
      var cats = {
        languages: ["C++", "C", "TypeScript", "JavaScript", "SQL"],
        frameworks: ["React", "Node.js", "Next.js", "React Native", "Expo", "Redux", "Express", "Angular"],
        infra: ["PostgreSQL", "MySQL", "MongoDB", "AWS (S3/RDS/Athena/Glue)", "Azure Functions", "Docker"],
        concepts: ["DSA", "OOP", "DBMS", "OS", "Complexity Analysis"]
      };
      var k = (a[0] || "").toLowerCase();
      head("skills" + (cats[k] ? " · " + k : ""));
      Object.keys(cats).forEach(function (c) {
        if (k && k !== c) return;
        line([["o-acc", "  " + c.padEnd(12)], cats[c].join(", ")]);
      });
      if (k && !cats[k]) line([["o-err", "  no such category — try: "], "languages frameworks infra concepts"]);
    },

    projects: function () {
      head("projects/");
      Object.keys(PROJECTS).forEach(function (k) {
        var p = PROJECTS[k];
        line([["o-acc", "  " + k.padEnd(14)], ["o-type", "[" + p.tag + "]  "], ["o-dim", p.title.split(" — ")[1] || p.title]]);
      });
      blank();
      line([["o-dim", "  → "], "open <name>", ["o-dim", "  for the deep-dive"]]);
    },

    open: function (a) { return projectDetail(a[0]); },
    project: function (a) { return projectDetail(a[0]); },

    experience: function () {
      head("experience — full-stack, end to end");
      var roles = [
        ["Badho Technologies", "Full-Stack Engineer", "Jul 2024 — now · Gurugram",
          "Blue-green migrations · pg_repack · Athena/S3 archiving · RN/MMKV/RevoPush · Hasura tuning · TypeSense + Mistral OCR · Azure Functions auth"],
        ["Badho Technologies", "Full-Stack Intern", "Jan — Jun 2024",
          "3 apps (Buyer/Seller/Saathi) · scratch-card onboarding · Node/Express/GraphQL/PostgreSQL"],
        ["BuyProperly", "Full-Stack Intern", "Jun — Sep 2022 · Remote (Toronto)",
          "Angular/Node/Express/PostgreSQL · HubSpot CRM · Google Sign-In · React+Recoil internal app"],
        ["DocsUp Pvt Ltd", "Full-Stack Intern", "Oct 2021 — Jan 2022 · Delhi",
          "−85% latency on houseofplug.com · API restructure · custom Admin Panel · payments"]
      ];
      roles.forEach(function (r) {
        blank();
        line([["o-acc", r[0]], ["o-dim", "  · " + r[1]]]);
        line([["o-dim", r[2]]]);
        line(["  " + r[3]]);
      });
    },

    impact: function () {
      head("optimizer passes — production impact");
      [
        ["−11%", "RDS cost", "blue-green migration · pg_repack · Athena/S3 archive"],
        ["−85%", "latency", "houseofplug.com API restructure (DocsUp)"],
        ["−35%", "bundle", "RN + MMKV sub-ms storage + RevoPush OTA"],
        ["−40%", "Hasura tables", "untracked redundant tables, pruned millions of logs"],
        ["1M/d", "BigQuery cap beat", "intraday backups, unified queries, 0 data loss"],
        ["AI", "automation", "TypeSense catalogue match · Mistral OCR invoices"]
      ].forEach(function (r) {
        line([["o-ok", "  " + r[0].padEnd(7)], ["o-acc", r[1].padEnd(16)], ["o-dim", r[2]]]);
      });
    },

    flowwing: function () { return projectDetail("flow-wing"); },

    server: function () {
      head("server.fg — how this page reaches you");
      line(["This site is ", ["o-acc", "served by Flow-Wing"], "."]);
      line(["A ", ["o-kw", "server.fg"], " program (the ", ["o-type", "vortex"], " HTTP module)"]);
      line(["serves index.html + /assets/*. The Flow-Wing compiler"]);
      line(["(C++/LLVM) compiles/runs it — same mechanism as"]);
      line(["flow-wing's own website. The claim is literal."]);
      blank();
      line([["o-dim", "  $ "], ["o-acc", "flowwing-jit server.fg"], ["o-dim", "      # JIT"]]);
      line([["o-dim", "  $ "], ["o-acc", "flowwing server.fg -o career"], ["o-dim", "  # AOT"]]);
      line([["o-dim", "  → http://127.0.0.1:8080"]]);
      blank();
      line([["o-dim", "  ref "], ["o-acc", "github.com/kushagra1212/Flow-Wing", "https://github.com/kushagra1212/Flow-Wing"]]);
    },

    source: function () {
      head("career.fg — the real Flow-Wing program behind this page");
      CAREER_FG.forEach(function (l) {
        if (/^\s*\/;/.test(l)) line([["o-dim", l || " "]]);
        else if (/^\s*fun\b/.test(l)) line([["o-kw", l]]);
        else if (/println|fg_main/.test(l)) line([["o-str", l]]);
        else line([l || " "]);
      });
      blank();
      line(["Real Flow-Wing — compiles & runs on ",
        ["o-acc", "flowwing.kushagrarathore.in", "https://flowwing.kushagrarathore.in/"], "."]);
      line([["o-dim", "try "], ["o-acc", "run println(\"hi from flow-wing\")"]]);
    },

    cp: function () {
      head("static analysis — an earlier chapter (not active now)");
      line([["o-acc", "  CodeChef    "], "max 1908 · 4★ · #38 global, Sept CookOff ’21"]);
      line([["o-acc", "  LeetCode    "], "rating 1851"]);
      line([["o-acc", "  Volume      "], "1,600+ problems across platforms"]);
      line([["o-acc", "  Mentorship  "], "Google DSC CP mentor · CodeChef problem-setter (c. 2021–22)"]);
    },

    education: function () {
      head("education");
      line([["o-acc", "  B.Tech CSE  "], "MediCaps University, Indore"]);
      line([["o-acc", "  CGPA        "], "9.35 / 10 · graduated May 2024"]);
      line([["o-acc", "  Activities  "], "organized contests · CP mentor · problem-setter"]);
    },

    contact: function () {
      head("contact — open to work");
      line([["o-dim", "  email     "], ["o-acc", "kushagrarathore002@gmail.com", "mailto:kushagrarathore002@gmail.com"]]);
      line([["o-dim", "  phone     "], ["o-acc", "+91 97559 12802", "tel:+919755912802"]]);
      line([["o-dim", "  github    "], ["o-acc", "github.com/kushagra1212", "https://github.com/kushagra1212"]]);
      line([["o-dim", "  linkedin  "], ["o-acc", "linkedin.com/in/kushagra1212", "https://www.linkedin.com/in/kushagra1212"]]);
      line([["o-dim", "  leetcode  "], ["o-acc", "leetcode.com/u/kushagra1212", "https://leetcode.com/u/kushagra1212"]]);
      line([["o-dim", "  medium    "], ["o-acc", "medium.com/@kushagrarathore002 — articles", "https://medium.com/@kushagrarathore002"]]);
    },

    resume: function () {
      head("Kushagra Rathore — Full-Stack Engineer");
      line([["o-dim", "EXPERIENCE"]]);
      line("  Badho Technologies — Full-Stack Engineer        Jul 2024 — now");
      line("  BuyProperly        — Full-Stack Intern          Jun — Sep 2022");
      line("  DocsUp Pvt Ltd     — Full-Stack Intern          Oct 2021 — Jan 2022");
      blank();
      line([["o-dim", "PROJECT"]]);
      line("  Flow-Wing — language (C++/LLVM, AOT/JIT, REPL, LSP, GC)");
      blank();
      line([["o-dim", "EDUCATION"]]);
      line("  B.Tech CSE — MediCaps University · CGPA 9.35 · May 2024");
      blank();
      line([["o-dim", "ACHIEVEMENTS"]]);
      line("  CodeChef 1908 (4★) · LeetCode 1851 · #38 global CookOff ’21");
      blank();
      line([["o-acc", "→ "], ["o-acc", "view résumé — Google Drive ↗", "https://drive.google.com/file/d/17zyixC8Zl0CulGMdi2onaBDnd5dJWuov/view?usp=sharing"]]);
    },

    ls: function () {
      head("~/career");
      Object.keys(FS).forEach(function (f) {
        line([[f.endsWith("/") ? "o-acc" : "o-str", "  " + f]]);
      });
    },
    cat: function (a) {
      var f = a[0];
      if (!f) return line([["o-err", "cat: missing file — try `ls`"]]);
      var key = Object.keys(FS).filter(function (k) { return k.toLowerCase().indexOf(f.toLowerCase()) === 0; })[0];
      if (!key) return line([["o-err", "cat: " + f + ": no such file"]]);
      line([["o-dim", FS[key]]]);
    },

    theme: function (a) {
      var s = (a[0] || "").toLowerCase();
      if (s !== "blue" && s !== "green") return line([["o-err", "usage: theme blue|green"]]);
      html.setAttribute("data-state", s);
      var t = document.getElementById("stateToggle");
      if (t) t.querySelector(".state-label").textContent = s;
      line([["o-ok", "deploy state → " + s]]);
    },

    echo: function (a, raw) { line(raw.replace(/^echo\s?/, "")); },
    date: function () { line([["o-dim", new Date().toString()]]); },
    history: function () {
      head("history");
      history.forEach(function (h, i) { line([["o-dim", "  " + (i + 1) + "  "], h]); });
    },

    neofetch: function () {
      var art = [
        "      ___        ", "kushagra@flowwing",
        "     / _ \\       ", "-----------------",
        "    | |_| |      ", "OS:    Flow-Wing (rolling)",
        "    |  _  |      ", "Shell: career.fg",
        "    |_| |_|      ", "Role:  Full-Stack Engineer",
        "                 ", "Edge:  wrote the compiler",
        "    >_ flowwing  ", "Uptime: shipping since 2021"
      ];
      head("");
      for (var i = 0; i < art.length; i += 2) {
        line([["o-acc", art[i]], ["o-dim", art[i + 1] || ""]]);
      }
    },

    sudo: function (a) {
      if ((a[0] || "") === "hire") {
        head("[sudo] authenticating recruiter ...");
        line([["o-ok", "access granted ✔"]]);
        blank();
        line("  Kushagra is open to strong full-stack / systems roles.");
        line([["o-acc", "  → kushagrarathore002@gmail.com", "mailto:kushagrarathore002@gmail.com?subject=Let%27s%20build%20something"]]);
        line([["o-dim", "  mention ‘Career Compiler’ in the subject — I’ll reply fast."]]);
        return;
      }
      line([["o-err", "sudo: a password is required. (hint: `sudo hire`)"]]);
    },

    clear: function () { out.innerHTML = ""; return true; }
  };

  /* aliases */
  var ALIAS = { "?": "help", "man": "help", "work": "experience", "exp": "experience",
    "metrics": "impact", "edu": "education", "about": "whoami", "me": "whoami",
    "fg": "flowwing", "repo": "contact", "github": "contact", "ranks": "cp",
    "leetcode": "cp", "codechef": "cp", "serve": "server", "vortex": "server",
    "host": "server", "view": "source", "src": "source", "career.fg": "source" };

  function projectDetail(name) {
    if (!name) return COMMANDS.projects();
    var k = name.toLowerCase();
    var match = PROJECTS[k] || PROJECTS[Object.keys(PROJECTS).filter(function (x) {
      return x.indexOf(k) === 0 || PROJECTS[x].title.toLowerCase().indexOf(k) > -1;
    })[0]];
    if (!match) return line([["o-err", "open: '" + name + "' not found — try `projects`"]]);
    head(match.title);
    line([["o-type", "  [" + match.tag + "]"]]);
    blank();
    match.lines.forEach(function (l) { line(["  " + l]); });
    blank();
    if (match.site) line([["o-acc", "  → " + match.site + "  (live)", match.site]]);
    line([["o-acc", "  → " + match.url, match.url]]);
  }

  /* ---------- tiny Flow-Wing interpreter ---------- */
  var VARS = {};
  function fgRun(src) {
    src = src.trim();
    if (!src) return line([["o-dim", "fg: nothing to run — e.g. run print(\"hi\"), run 6*7"]]);
    try {
      var m;
      if ((m = src.match(/^(?:var\s+)?([A-Za-z_]\w*)\s*=\s*(.+)$/)) && src.indexOf("==") === -1) {
        VARS[m[1]] = evalExpr(m[2]);
        return line([["o-dim", m[1] + " = "], ["o-str", fmt(VARS[m[1]]) ]]);
      }
      if ((m = src.match(/^print(?:ln)?\s*\((.*)\)\s*;?$/s))) {
        return line([["o-str", fmt(evalExpr(m[1])) ]]);
      }
      return line([["o-str", fmt(evalExpr(src)) ]]);
    } catch (e) {
      line([["o-err", "fg: " + e.message]]);
    }
  }
  /* ---------- real Flow-Wing: POST to the engine that powers
     flowwing.kushagrarathore.in. Works same-origin (behind that nginx);
     falls back to the local sandbox elsewhere, clearly labelled. */
  function runFlowWing(src) {
    src = src.trim();
    if (!src) { line([["o-dim", "fg: nothing to run — e.g. run println(\"hi\")  ·  run 6*7"]]); return; }
    var program = /\bfg_main\b/.test(src)
      ? src : "fun fg_main() -> nthg {\n  " + src + "\n}\nfg_main()";
    var ep = window.FG_RUN || "/run";
    line([["o-dim", "flowwing-jit "], ["o-acc", "› remote Flow-Wing engine"], ["o-dim", " …"]]);
    var ctl = new AbortController();
    var to = setTimeout(function () { ctl.abort(); }, 9000);
    fetch(ep, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: program, input: "" }), signal: ctl.signal
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        clearTimeout(to);
        if (!d || typeof d.output !== "string") throw 0;
        var o = d.output.replace(/\s+$/, "");
        (o ? o.split("\n") : ["(no output)"]).forEach(function (ln) {
          line([["o-str", ln || " "]]);
        });
        out.scrollTop = out.scrollHeight;
      }).catch(function () {
        clearTimeout(to);
        line([["o-dim", "remote engine not reachable from this origin — local sandbox:"]]);
        fgRun(src);
        out.scrollTop = out.scrollHeight;
      });
  }
  function fmt(v) { return typeof v === "string" ? v : String(v); }
  function evalExpr(s) {
    // safe-ish expression evaluator: numbers, strings, + - * / % ( ), vars
    s = s.trim();
    var toks = s.match(/"[^"]*"|'[^']*'|[A-Za-z_]\w*|\d+\.?\d*|[-+*/%()]/g) || [];
    var i = 0;
    function peek() { return toks[i]; }
    function next() { return toks[i++]; }
    function prim() {
      var t = next();
      if (t === undefined) throw new Error("unexpected end");
      if (t === "(") { var v = expr(); if (next() !== ")") throw new Error("expected )"); return v; }
      if (/^["']/.test(t)) return t.slice(1, -1);
      if (/^\d/.test(t)) return parseFloat(t);
      if (/^[A-Za-z_]/.test(t)) {
        if (t in VARS) return VARS[t];
        throw new Error("undefined: " + t);
      }
      throw new Error("unexpected '" + t + "'");
    }
    function term() {
      var v = prim();
      while (peek() === "*" || peek() === "/" || peek() === "%") {
        var op = next(), r = prim();
        v = op === "*" ? v * r : op === "/" ? v / r : v % r;
      }
      return v;
    }
    function expr() {
      var v = term();
      while (peek() === "+" || peek() === "-") {
        var op = next(), r = term();
        v = op === "+" ? (v + r) : (v - r);
      }
      return v;
    }
    var res = expr();
    if (i < toks.length) throw new Error("trailing '" + toks[i] + "'");
    return res;
  }

  /* ---------- run a command line ---------- */
  function exec(raw) {
    var parts = raw.trim().split(/\s+/);
    var cmd = (parts[0] || "").toLowerCase();
    var args = parts.slice(1);

    var pl = document.createElement("span");
    pl.className = "ln u-cmd";
    var ps = document.createElement("span"); ps.className = "ps";
    ps.textContent = "kushagra@flowwing:~$ ";
    pl.appendChild(ps);
    pl.appendChild(document.createTextNode(raw));
    out.appendChild(pl);

    if (!cmd) { out.scrollTop = out.scrollHeight; return; }

    if (cmd === "run") { runFlowWing(raw.replace(/^run\s?/i, "")); out.scrollTop = out.scrollHeight; return; }
    var resolved = ALIAS[cmd] || cmd;
    var fn = COMMANDS[resolved];
    if (fn) { var cleared = fn(args, raw); if (!cleared) tail(); }
    else {
      line([["o-err", "command not found: " + cmd]]);
      line([["o-dim", "try `help` — or `run " + raw + "` to execute as Flow-Wing"]]);
      tail();
    }
    function tail() { out.scrollTop = out.scrollHeight; }
  }

  /* ---------- input wiring ---------- */
  inp.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var v = inp.value;
      if (v.trim()) { history.push(v); hIdx = history.length; }
      inp.value = "";
      exec(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hIdx > 0) inp.value = history[--hIdx] || "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hIdx < history.length - 1) inp.value = history[++hIdx] || "";
      else { hIdx = history.length; inp.value = ""; }
    } else if (e.key === "Tab") {
      e.preventDefault();
      var cur = inp.value.trim().toLowerCase();
      if (!cur) return;
      var pool = Object.keys(COMMANDS).concat(Object.keys(ALIAS), ["run"]);
      var hit = pool.filter(function (c) { return c.indexOf(cur) === 0; });
      if (hit.length === 1) inp.value = hit[0] + " ";
      else if (hit.length > 1) { line([["o-dim", "  " + hit.sort().join("   ")]]); out.scrollTop = out.scrollHeight; }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault(); out.innerHTML = "";
    }
  });

  // click anywhere in the IDE focuses the prompt
  if (ide) ide.addEventListener("click", function (ev) {
    if (ev.target.tagName !== "A" && window.getSelection().toString() === "") inp.focus();
  });

  /* ---------- boot banner ---------- */
  line([["o-acc", "Flow-Wing"], ["o-dim", " REPL · "], ["o-dim", "C++/LLVM"]]);
  line([["o-dim", "career data lives in "], ["o-kw", "career.fg"], ["o-dim", " ("], ["o-acc", "source"], ["o-dim", "). "], ["o-acc", "run"], ["o-dim", " executes real Flow-Wing"]]);
  line([["o-dim", "via the same engine as "], ["o-acc", "flowwing.kushagrarathore.in", "https://flowwing.kushagrarathore.in/"], ["o-dim", " (local sandbox if offline)."]]);
  blank();
  line([["o-dim", "type "], ["o-acc", "help"], ["o-dim", " · "], ["o-acc", "source"], ["o-dim", " · "], ["o-acc", "run println(\"hi\")"], ["o-dim", " · "], ["o-acc", "sudo hire"]]);
  blank();
})();
