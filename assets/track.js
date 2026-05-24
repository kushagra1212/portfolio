// assets/track.js — comprehensive zero-dep tracker.
//
// Captures: page_load, scroll-depth (25/50/75/100), section_view (per stage
// via IntersectionObserver), cta_click (with x/y), background_click (sampled,
// for heatmap), selection, copy, paste, contextmenu, repl_command, hover_dwell
// (CTA held >2s), visibility_change, viewport_resize, page_exit.
//
// Privacy: NEVER sends selected/copied/typed text. Sends LENGTHS and the
// section the action happened in. Click coords are normalized to viewport.
// Session id lives in sessionStorage so a session = one tab visit.
(function () {
  var SESSION_KEY = "fw_session_id";
  var GEO_KEY = "fw_geo";        // cached IP+geo for this session
  var SELF_KEY = "fw_is_me";     // localStorage flag — set on your own devices
  var FIRST_TOUCH_KEY = "fw_first_touch"; // localStorage — first acquisition channel per browser
  var ENDPOINT = "/track";

  // ---- traffic source classification ----
  // Map referrer hostname -> {channel, source}. Channels:
  //   search   organic search (google/bing/...)
  //   social   linkedin/twitter/reddit/...
  //   ai       chatgpt/claude/perplexity/...
  //   referral any other site
  //   direct   no referrer
  //   <utm>    whatever utm_medium says (overrides hostname)
  var SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|brave|kagi|startpage)\./i;
  var SOCIAL_HOSTS = /(^|\.)(linkedin|twitter|x|t\.co|facebook|fb|instagram|reddit|news\.ycombinator|hn\.algolia|medium|dev\.to|substack|t\.me|telegram|whatsapp|discord|threads|bsky|mastodon)\./i;
  var AI_HOSTS = /(^|\.)(chat\.openai|chatgpt|claude\.ai|perplexity|bard\.google|gemini\.google|you\.com|phind|copilot\.microsoft)/i;

  function classifyRef(refHost) {
    if (!refHost) return { channel: "direct", source: "(direct)" };
    var h = refHost.replace(/^www\./, "");
    if (SEARCH_HOSTS.test(h)) return { channel: "search", source: h.split(".")[0] };
    if (AI_HOSTS.test(h))     return { channel: "ai",     source: h };
    if (SOCIAL_HOSTS.test(h)) return { channel: "social", source: h };
    return { channel: "referral", source: h };
  }

  function parseUtm() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return {}; }
    var out = {};
    ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].forEach(function (k) {
      var v = q.get(k);
      if (v) out[k] = v.slice(0, 80);
    });
    if (q.get("gclid")) out.gclid = q.get("gclid").slice(0, 80);
    if (q.get("fbclid")) out.fbclid = q.get("fbclid").slice(0, 80);
    return out;
  }

  // Compute current-visit source. UTM wins over referrer when present.
  function computeSource(refHost, utm) {
    var classified = classifyRef(refHost);
    var channel = utm.utm_medium || classified.channel;
    var source = utm.utm_source || classified.source;
    if (utm.gclid && !utm.utm_medium) { channel = "cpc"; source = source || "google"; }
    if (utm.fbclid && !utm.utm_medium) { channel = channel === "direct" ? "social" : channel; source = source || "facebook"; }
    return { channel: channel, source: source, campaign: utm.utm_campaign || null };
  }

  // First-touch: persist the very first acquisition source per browser.
  // Read once; only write if not already set.
  function firstTouch(current, landing) {
    var existing = null;
    try {
      var raw = localStorage.getItem(FIRST_TOUCH_KEY);
      if (raw) existing = JSON.parse(raw);
    } catch (e) { /* ignore */ }
    if (existing) return existing;
    var rec = {
      channel: current.channel,
      source: current.source,
      campaign: current.campaign,
      landing: landing,
      ts: Date.now(),
    };
    try { localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(rec)); } catch (e) { /* ignore */ }
    return rec;
  }
  // ipwho.is: free, no key, HTTPS, returns ip + country + city + region + connection.isp.
  // Geo is best-effort: free databases (MaxMind / IP2Location) tag CGNAT exits to
  // the ISP's POP city, not the user. Expect "approx" accuracy especially on
  // Indian mobile networks (Jio/Airtel) where exit IPs pool across regions.
  var GEO_URL = "https://ipwho.is/";

  // "Is this me?" flag. Set once on your own browser/device by running
  //   localStorage.setItem("fw_is_me", "1")
  // in the portfolio's DevTools console. Persists across sessions on that
  // browser. Dashboard hides events where is_self === true by default.
  var isSelf = false;
  try { isSelf = localStorage.getItem(SELF_KEY) === "1"; } catch (e) { /* ignore */ }

  function sessionId() {
    var s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = (crypto.randomUUID
        ? crypto.randomUUID()
        : "s_" + Date.now() + "_" + Math.random().toString(36).slice(2));
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  }

  // Cached IP+geo per session. ipapi.co is called at most once per session.
  // If the lookup fails (offline / rate-limit / blocked by uBlock), `geo` stays
  // null and events ship without ip — tracker continues to work degraded.
  // Privacy: IPs are personal data in many jurisdictions. For this portfolio
  // they're stored in the same mongo collection as the events; documented in
  // ATLAS-SETUP.md / docs.
  var geo = null;
  try {
    var cached = sessionStorage.getItem(GEO_KEY);
    if (cached) geo = JSON.parse(cached);
  } catch (e) { /* ignore */ }

  function fetchGeo() {
    if (geo) return Promise.resolve(geo);
    return fetch(GEO_URL, { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        // ipwho.is returns {success: true, ip, country, country_code, region,
        // city, latitude, longitude, connection: {org, isp, ...}}.
        // On failure: {success: false, message: ...}.
        if (!j || j.success === false) return null;
        geo = {
          ip: j.ip || null,
          country: j.country || null,
          country_code: j.country_code || null,
          region: j.region || null,
          city: j.city || null,
          org: (j.connection && (j.connection.isp || j.connection.org)) || null,
          asn: (j.connection && j.connection.asn) || null,
          lat: j.latitude || null,
          lng: j.longitude || null,
        };
        try { sessionStorage.setItem(GEO_KEY, JSON.stringify(geo)); } catch (e) {}
        return geo;
      })
      .catch(function () { return null; });
  }

  // Find which top-level <section id="..."> the element lives in (or null).
  function sectionOf(el) {
    while (el && el !== document.body) {
      if (el.tagName === "SECTION" && el.id) return el.id;
      el = el.parentElement;
    }
    return null;
  }

  var sid = sessionId();

  function send(evt) {
    var payload = Object.assign(
      {
        ts: Date.now(),
        session: sid,
        page: location.pathname + location.search,
      },
      evt
    );
    if (geo) {
      payload.ip = geo.ip;
      payload.country = geo.country;
      payload.country_code = geo.country_code;
      payload.region = geo.region;
      payload.city = geo.city;
      payload.org = geo.org;
    }
    if (isSelf) payload.is_self = true;
    try {
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          ENDPOINT,
          new Blob([body], { type: "application/json" })
        );
      } else {
        fetch(ENDPOINT, {
          method: "POST",
          body: body,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        });
      }
    } catch (e) {
      /* silent — tracker must never break the page */
    }
  }

  // Buffer events fired before geo resolved (we want the page_load to carry
  // ip when possible). Flush after fetchGeo() resolves OR after 1.5s timeout.
  var pendingEvents = [];
  var geoSettled = false;
  var realSend = send;
  send = function (evt) {
    if (geo || geoSettled) return realSend(evt);
    pendingEvents.push(evt);
  };
  function flushPending() {
    if (geoSettled) return;
    geoSettled = true;
    pendingEvents.forEach(realSend);
    pendingEvents = [];
  }
  if (geo) {
    // Already cached from a prior page load this session — flush immediately.
    geoSettled = true;
  } else {
    fetchGeo().then(flushPending);
    setTimeout(flushPending, 1500); // hard ceiling — don't block tracking
  }

  // ---- 1) page_load: rich one-time profile ----
  var conn = navigator.connection || {};
  var refRaw = document.referrer || null;
  var refHost = null;
  if (refRaw) {
    try { refHost = new URL(refRaw).hostname; } catch (e) { refHost = null; }
  }
  var utm = parseUtm();
  var src = computeSource(refHost, utm);
  var landing = location.pathname + (location.search || "");
  var first = firstTouch(src, landing);
  send({
    type: "page_load",
    ref: refRaw,
    src_channel: src.channel,
    src_source: src.source,
    src_campaign: src.campaign,
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    utm_term: utm.utm_term || null,
    utm_content: utm.utm_content || null,
    gclid: utm.gclid || null,
    fbclid: utm.fbclid || null,
    landing: landing,
    first_channel: first.channel,
    first_source: first.source,
    first_campaign: first.campaign,
    first_landing: first.landing,
    first_ts: first.ts,
    ua: navigator.userAgent,
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tz_off: new Date().getTimezoneOffset(),
    vw: window.innerWidth,
    vh: window.innerHeight,
    sw: window.screen.width,
    sh: window.screen.height,
    dpr: window.devicePixelRatio || 1,
    prefers_dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
    prefers_reduced_motion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    net_type: conn.effectiveType || null,
    net_downlink: conn.downlink || null,
    net_save_data: conn.saveData || false,
    cores: navigator.hardwareConcurrency || null,
    mem: navigator.deviceMemory || null,
    touch: ("ontouchstart" in window) || navigator.maxTouchPoints > 0,
  });

  // ---- 2) scroll depth (25/50/75/100) ----
  var sentDepths = {};
  function onScroll() {
    var docH = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    var winH = window.innerHeight;
    var pct = Math.floor(((window.scrollY + winH) / docH) * 100);
    [25, 50, 75, 100].forEach(function (d) {
      if (pct >= d && !sentDepths[d]) {
        sentDepths[d] = true;
        send({ type: "scroll", depth: d });
      }
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ---- 3) section_view via IntersectionObserver ----
  // Fires once per section per session, with dwell_ms tracked until it leaves the viewport.
  var sectionEnter = {}; // sid -> entered timestamp
  var sectionSent = {};  // sid -> view event sent
  var sectionDwell = {}; // sid -> cumulative ms while in viewport
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      var now = Date.now();
      entries.forEach(function (entry) {
        var id = entry.target.id;
        if (!id) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
          if (!sectionEnter[id]) {
            sectionEnter[id] = now;
            if (!sectionSent[id]) {
              sectionSent[id] = true;
              send({ type: "section_view", section: id });
            }
          }
        } else if (sectionEnter[id]) {
          sectionDwell[id] = (sectionDwell[id] || 0) + (now - sectionEnter[id]);
          sectionEnter[id] = 0;
        }
      });
    }, { threshold: [0, 0.4, 0.75] });
    document.querySelectorAll("section[id]").forEach(function (s) { io.observe(s); });
  }

  // ---- 4) cta_click (with viewport-normalized coords) + 5) background_click (sampled) ----
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-cta], a[href], button");
    var x = e.clientX / window.innerWidth;
    var y = e.clientY / window.innerHeight;
    if (t) {
      send({
        type: "cta_click",
        cta: t.getAttribute("data-cta") || t.textContent.trim().slice(0, 60),
        href: t.getAttribute("href") || null,
        tag: t.tagName.toLowerCase(),
        section: sectionOf(t),
        x: +x.toFixed(3),
        y: +y.toFixed(3),
      });
    } else if (Math.random() < 0.2) {
      // 1-in-5 sample of background clicks for a click-density heatmap
      send({
        type: "background_click",
        section: sectionOf(e.target),
        x: +x.toFixed(3),
        y: +y.toFixed(3),
      });
    }
  }, true);

  // ---- 6) selection (length + section, NOT text) ----
  var selTimer = null;
  document.addEventListener("selectionchange", function () {
    if (selTimer) clearTimeout(selTimer);
    selTimer = setTimeout(function () {
      var sel = document.getSelection();
      if (!sel || sel.isCollapsed) return;
      var len = sel.toString().length;
      if (len < 3) return; // skip tiny accidental selections
      var anchor = sel.anchorNode;
      var el = anchor && anchor.nodeType === 3 ? anchor.parentElement : anchor;
      send({ type: "selection", length: len, section: sectionOf(el) });
    }, 400);
  });

  // ---- 7) copy / 8) paste / 9) contextmenu ----
  document.addEventListener("copy", function (e) {
    var sel = document.getSelection();
    var len = sel ? sel.toString().length : 0;
    send({
      type: "copy",
      length: len,
      section: sectionOf(e.target),
    });
  });
  document.addEventListener("paste", function (e) {
    var data = e.clipboardData && e.clipboardData.getData("text");
    send({
      type: "paste",
      length: data ? data.length : 0,
      section: sectionOf(e.target),
    });
  });
  document.addEventListener("contextmenu", function (e) {
    send({
      type: "contextmenu",
      section: sectionOf(e.target),
      x: +(e.clientX / window.innerWidth).toFixed(3),
      y: +(e.clientY / window.innerHeight).toFixed(3),
    });
  });

  // ---- 10) repl_command — capture lines entered into #replIn ----
  var replIn = document.getElementById("replIn");
  if (replIn) {
    var typingStart = null;
    replIn.addEventListener("input", function () {
      if (!typingStart) typingStart = Date.now();
    });
    // Capture phase — compiler.js's own keydown handler clears inp.value
    // synchronously on Enter, so by the time a bubble-phase listener runs the
    // value is already empty. Capture runs before that.
    replIn.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var cmd = (replIn.value || "").trim();
        if (cmd) {
          send({
            type: "repl_command",
            cmd: cmd.slice(0, 80),
            ms_typing: typingStart ? Date.now() - typingStart : 0,
          });
        }
        typingStart = null;
      }
    }, true);
    replIn.addEventListener("focus", function () {
      send({ type: "repl_focus" });
    });
  }

  // ---- 11) hover_dwell on CTAs (>=2s without click) ----
  var hoverTimer = null;
  var hoverEl = null;
  var hoverStart = 0;
  document.addEventListener("mouseover", function (e) {
    var t = e.target.closest("[data-cta], a[href], button");
    if (!t || t === hoverEl) return;
    hoverEl = t;
    hoverStart = Date.now();
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () {
      if (hoverEl === t) {
        send({
          type: "hover_dwell",
          cta: t.getAttribute("data-cta") || t.textContent.trim().slice(0, 60),
          ms: Date.now() - hoverStart,
          section: sectionOf(t),
        });
      }
    }, 2000);
  });
  document.addEventListener("mouseout", function (e) {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    hoverEl = null;
  });

  // ---- 12) visibility_change (tab focus/blur) ----
  var lastVisible = Date.now();
  var totalVisible = 0;
  document.addEventListener("visibilitychange", function () {
    var now = Date.now();
    if (document.hidden) {
      totalVisible += now - lastVisible;
      send({ type: "visibility", hidden: true, visible_ms_so_far: totalVisible });
    } else {
      lastVisible = now;
      send({ type: "visibility", hidden: false });
    }
  });

  // ---- 13) viewport_resize (debounced) ----
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      send({
        type: "viewport_resize",
        vw: window.innerWidth,
        vh: window.innerHeight,
      });
    }, 500);
  });

  // ---- 14) page_exit (rich summary) ----
  var loadAt = Date.now();
  window.addEventListener("pagehide", function () {
    // Flush any in-flight section dwell timers
    var now = Date.now();
    Object.keys(sectionEnter).forEach(function (id) {
      if (sectionEnter[id]) {
        sectionDwell[id] = (sectionDwell[id] || 0) + (now - sectionEnter[id]);
        sectionEnter[id] = 0;
      }
    });
    if (!document.hidden) totalVisible += now - lastVisible;
    var max_depth = 0;
    [25, 50, 75, 100].forEach(function (d) { if (sentDepths[d]) max_depth = d; });
    send({
      type: "page_exit",
      total_ms: now - loadAt,
      visible_ms: totalVisible,
      max_scroll: max_depth,
      sections_viewed: Object.keys(sectionSent).length,
      section_dwell: sectionDwell,
    });
  });
})();
