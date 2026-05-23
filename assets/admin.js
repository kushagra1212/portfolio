// assets/admin.js — portfolio analytics dashboard.
// Pulls up to 2000 recent events from /admin/<token>/events and aggregates
// client-side. Works offline of any chart library.
(function () {
  // ---- elements ----
  var $ = function (id) { return document.getElementById(id); };
  var rangeSel = $("range");
  var refreshBtn = $("refresh");
  var autoChk = $("auto");
  var statusEl = $("status");
  var metaEl = $("meta");

  var modal = $("modal");
  var modalTitle = $("modalTitle");
  var modalBody = $("modalBody");
  $("modalClose").addEventListener("click", function () { modal.hidden = true; });
  modal.addEventListener("click", function (e) {
    if (e.target === modal) modal.hidden = true;
  });

  var all = [];
  var autoTimer = null;

  // ---- helpers ----
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function tsfmt(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function dfmt(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
      + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function durFmt(ms) {
    if (!ms || ms < 0) return "—";
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60); s = s % 60;
    if (m < 60) return m + "m " + s + "s";
    var h = Math.floor(m / 60); m = m % 60;
    return h + "h " + m + "m";
  }

  function flattenExtJson(e) {
    if (e.ts && typeof e.ts === "object" && e.ts.$numberLong) e.ts = parseInt(e.ts.$numberLong, 10);
    if (e._id && typeof e._id === "object" && e._id.$oid) e._id = e._id.$oid;
    if (e.length && typeof e.length === "object" && e.length.$numberLong) e.length = parseInt(e.length.$numberLong, 10);
    if (e.ms && typeof e.ms === "object" && e.ms.$numberLong) e.ms = parseInt(e.ms.$numberLong, 10);
    if (e.depth && typeof e.depth === "object" && e.depth.$numberLong) e.depth = parseInt(e.depth.$numberLong, 10);
    if (e.total_ms && typeof e.total_ms === "object" && e.total_ms.$numberLong) e.total_ms = parseInt(e.total_ms.$numberLong, 10);
    if (e.visible_ms && typeof e.visible_ms === "object" && e.visible_ms.$numberLong) e.visible_ms = parseInt(e.visible_ms.$numberLong, 10);
    if (e.ms_typing && typeof e.ms_typing === "object" && e.ms_typing.$numberLong) e.ms_typing = parseInt(e.ms_typing.$numberLong, 10);
    return e;
  }

  function filterByRange(events) {
    var hours = parseFloat(rangeSel.value);
    if (!hours) return events;
    var cutoff = Date.now() - hours * 3600 * 1000;
    return events.filter(function (e) { return e.ts >= cutoff; });
  }

  function browserOf(ua) {
    if (!ua) return "unknown";
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\//.test(ua)) return "Opera";
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Safari\//.test(ua)) return "Safari";
    return "other";
  }
  function deviceOf(ev) {
    if (ev.touch) {
      if ((ev.sw || 0) <= 480 || (ev.vw || 0) <= 480) return "mobile";
      return "tablet";
    }
    return "desktop";
  }
  function refOf(ref) {
    if (!ref) return "direct";
    try {
      var u = new URL(ref);
      return u.hostname.replace(/^www\./, "");
    } catch (e) { return "other"; }
  }

  // ---- aggregations ----
  // Group events by IP. Each "visitor" = one IP across all their sessions.
  // Events without an ip (e.g. tracker fell back to no-geo) go under "(no ip)".
  function byVisitor(events) {
    var map = {};
    events.forEach(function (e) {
      var ip = e.ip || "(no ip)";
      if (!map[ip]) {
        map[ip] = {
          ip: ip,
          first: e.ts,
          last: e.ts,
          events: 0,
          sessions: {},
          country: e.country || null,
          country_code: e.country_code || null,
          city: e.city || null,
          region: e.region || null,
          org: e.org || null,
        };
      }
      var b = map[ip];
      b.events++;
      if (e.session) b.sessions[e.session] = true;
      if (e.ts < b.first) b.first = e.ts;
      if (e.ts > b.last) b.last = e.ts;
      // Geo fields may be missing on later events if geo lookup happened mid-session
      if (!b.country && e.country) b.country = e.country;
      if (!b.country_code && e.country_code) b.country_code = e.country_code;
      if (!b.city && e.city) b.city = e.city;
      if (!b.region && e.region) b.region = e.region;
      if (!b.org && e.org) b.org = e.org;
    });
    return map;
  }

  // Country code (ISO 3166-1 alpha-2) -> emoji flag.
  function flagFor(cc) {
    if (!cc || cc.length !== 2) return "·";
    var A = 0x1F1E6;
    return String.fromCodePoint(A + cc.toUpperCase().charCodeAt(0) - 65)
         + String.fromCodePoint(A + cc.toUpperCase().charCodeAt(1) - 65);
  }

  function bySession(events) {
    var map = {};
    events.forEach(function (e) {
      var s = e.session || "?";
      if (!map[s]) {
        map[s] = {
          id: s,
          first: e.ts,
          last: e.ts,
          events: [],
          ua: null,
          ref: null,
          touch: false,
          vw: 0, sw: 0,
        };
      }
      var bucket = map[s];
      bucket.events.push(e);
      if (e.ts < bucket.first) bucket.first = e.ts;
      if (e.ts > bucket.last) bucket.last = e.ts;
      if (e.type === "page_load") {
        bucket.ua = e.ua;
        bucket.ref = e.ref;
        bucket.touch = !!e.touch;
        bucket.vw = e.vw || 0;
        bucket.sw = e.sw || 0;
        bucket.tz = e.tz;
        bucket.lang = e.lang;
        bucket.net = e.net_type;
      }
    });
    Object.keys(map).forEach(function (k) {
      map[k].events.sort(function (a, b) { return a.ts - b.ts; });
    });
    return map;
  }

  function tallyTop(events, keyFn, limit) {
    var counts = {};
    events.forEach(function (e) {
      var k = keyFn(e);
      if (k == null) return;
      counts[k] = (counts[k] || 0) + 1;
    });
    var arr = Object.keys(counts).map(function (k) { return [k, counts[k]]; });
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return limit ? arr.slice(0, limit) : arr;
  }

  function renderBars(containerId, rows, totalOverride) {
    var el = $(containerId);
    if (!rows.length) { el.innerHTML = '<div class="empty">no data</div>'; return; }
    var max = rows.reduce(function (m, r) { return Math.max(m, r[1]); }, 0);
    var html = "";
    for (var i = 0; i < rows.length; i++) {
      var pct = max > 0 ? (rows[i][1] / max) * 100 : 0;
      html += '<div class="bar-row">'
        + '<div class="label">'
          + '<div>' + esc(rows[i][0]) + '</div>'
          + '<div class="bar-fill-bg"><div class="bar-fill ' + (i === 0 ? 'hot' : '') + '" style="width:' + pct.toFixed(1) + '%"></div></div>'
        + '</div>'
        + '<div class="num">' + rows[i][1] + '</div>'
        + '</div>';
    }
    el.innerHTML = html;
  }

  function renderOverview(events) {
    var sessions = bySession(events);
    var sids = Object.keys(sessions);
    var pageLoads = events.filter(function (e) { return e.type === "page_load"; }).length;
    var ctaClicks = events.filter(function (e) { return e.type === "cta_click"; }).length;
    var copies = events.filter(function (e) { return e.type === "copy"; }).length;
    var replCmds = events.filter(function (e) { return e.type === "repl_command"; }).length;
    var exits = events.filter(function (e) { return e.type === "page_exit"; });
    var avgDuration = exits.length
      ? exits.reduce(function (a, e) { return a + (e.total_ms || 0); }, 0) / exits.length
      : 0;
    var avgVisible = exits.length
      ? exits.reduce(function (a, e) { return a + (e.visible_ms || 0); }, 0) / exits.length
      : 0;
    var bounced = 0;
    var engaged = 0;
    sids.forEach(function (s) {
      var sess = sessions[s];
      var hadCta = sess.events.some(function (e) { return e.type === "cta_click"; });
      var hadDeep = sess.events.some(function (e) { return e.type === "scroll" && e.depth >= 50; });
      if (hadCta || hadDeep) engaged++;
      else if (sess.events.length <= 2) bounced++;
    });
    var bounceRate = sids.length ? Math.round((bounced / sids.length) * 100) : 0;

    var visitors = byVisitor(events);
    var visitorCount = Object.keys(visitors).filter(function (ip) { return ip !== "(no ip)"; }).length;
    var countries = {};
    Object.keys(visitors).forEach(function (ip) {
      var v = visitors[ip];
      if (v.country) countries[v.country] = true;
    });
    var cards = [
      { num: events.length, label: "events" },
      { num: visitorCount, label: "unique visitors", className: "muted" },
      { num: sids.length, label: "sessions" },
      { num: Object.keys(countries).length, label: "countries" },
      { num: pageLoads, label: "page loads" },
      { num: ctaClicks, label: "CTA clicks" },
      { num: replCmds, label: "REPL commands" },
      { num: copies, label: "copies" },
      { num: durFmt(avgDuration), label: "avg duration" },
      { num: durFmt(avgVisible), label: "avg visible" },
      { num: engaged, label: "engaged", className: "muted" },
      { num: bounceRate + "%", label: "bounce rate" },
    ];
    $("overviewStats").innerHTML = cards.map(function (c) {
      return '<div class="stat">'
        + '<span class="num ' + (c.className || "") + '">' + esc(c.num) + '</span>'
        + '<span class="label">' + esc(c.label) + '</span>'
        + '</div>';
    }).join("");
  }

  function renderVisitors(events) {
    var visitors = byVisitor(events);
    var ips = Object.keys(visitors);
    // sort by recency, "no ip" bucket last
    ips.sort(function (a, b) {
      if (a === "(no ip)") return 1;
      if (b === "(no ip)") return -1;
      return visitors[b].last - visitors[a].last;
    });
    var realCount = ips.filter(function (i) { return i !== "(no ip)"; }).length;
    $("visitorSummary").textContent = "· " + realCount + " unique IPs" + (visitors["(no ip)"] ? " + " + Object.keys(visitors["(no ip)"].sessions).length + " no-ip" : "");
    var html = ips.slice(0, 60).map(function (ip) {
      var v = visitors[ip];
      var sessCount = Object.keys(v.sessions).length;
      var loc = [v.city, v.region, v.country].filter(Boolean).join(", ") || "(unknown location)";
      var cls = ip === "(no ip)" ? "visitor-row unknown" : "visitor-row";
      return '<div class="' + cls + '" title="last: ' + esc(dfmt(v.last)) + '">'
        + '<div class="flag">' + esc(flagFor(v.country_code)) + '</div>'
        + '<div class="body">'
          + '<div class="ip">' + esc(ip) + '</div>'
          + '<div class="loc">' + esc(loc) + '</div>'
          + (v.org ? '<div class="org">' + esc(v.org) + '</div>' : '')
        + '</div>'
        + '<div class="nums">'
          + '<div><span class="num">' + sessCount + '</span> sess</div>'
          + '<div><span class="num">' + v.events + '</span> events</div>'
          + '<div>' + durFmt(v.last - v.first) + '</div>'
        + '</div>'
        + '</div>';
    }).join("");
    $("visitorList").innerHTML = html || '<div class="empty">no visitors yet</div>';
  }

  function renderLocations(events) {
    // Aggregate visitors per "city · country" (or just country if no city)
    var visitors = byVisitor(events);
    var counts = {};
    Object.keys(visitors).forEach(function (ip) {
      if (ip === "(no ip)") return;
      var v = visitors[ip];
      var loc;
      if (v.city && v.country) loc = flagFor(v.country_code) + " " + v.city + ", " + v.country;
      else if (v.country) loc = flagFor(v.country_code) + " " + v.country;
      else loc = "(unknown)";
      counts[loc] = (counts[loc] || 0) + 1;
    });
    var rows = Object.keys(counts).map(function (k) { return [k, counts[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    renderBars("locations", rows);
  }

  function renderContactChannels(events) {
    // Channels we care about (label, key matching data-cta prefix or exact)
    var channels = [
      { key: "contact_email",    label: "email",    accent: "#95dfb7" },
      { key: "contact_resume",   label: "résumé",   accent: "#95c0df" },
      { key: "contact_phone",    label: "phone",    accent: "#e0c082" },
      { key: "contact_github",   label: "github",   accent: "#c9a3e8" },
      { key: "contact_linkedin", label: "linkedin", accent: "#95dfd8" },
      { key: "contact_leetcode", label: "leetcode", accent: "#e0d782" },
      { key: "contact_medium",   label: "medium",   accent: "#b8a958" },
    ];
    var byChan = {};
    var totalClicks = 0;
    var uniqueClickers = {};
    channels.forEach(function (c) {
      byChan[c.key] = { clicks: 0, sessions: {}, hovers: 0, hover_ms_total: 0, last_ts: 0 };
    });
    events.forEach(function (e) {
      if (e.type === "cta_click" && e.cta && byChan[e.cta]) {
        byChan[e.cta].clicks++;
        totalClicks++;
        if (e.session) byChan[e.cta].sessions[e.session] = true;
        if (e.session) uniqueClickers[e.session] = true;
        if (e.ts > byChan[e.cta].last_ts) byChan[e.cta].last_ts = e.ts;
      } else if (e.type === "hover_dwell" && e.cta && byChan[e.cta]) {
        byChan[e.cta].hovers++;
        byChan[e.cta].hover_ms_total += (e.ms || 0);
      }
    });

    $("contactSummary").textContent = "· " + totalClicks + " total clicks · "
      + Object.keys(uniqueClickers).length + " unique visitors clicked";

    var maxClicks = Math.max(1, channels.reduce(function (m, c) {
      return Math.max(m, byChan[c.key].clicks);
    }, 0));

    var html = channels.map(function (c) {
      var b = byChan[c.key];
      var pct = (b.clicks / maxClicks) * 100;
      var uniq = Object.keys(b.sessions).length;
      var avgHover = b.hovers ? Math.round(b.hover_ms_total / b.hovers) : 0;
      var conv = b.hovers ? Math.round((b.clicks / (b.clicks + b.hovers)) * 100) : (b.clicks > 0 ? 100 : 0);
      var lastSeen = b.last_ts ? dfmt(b.last_ts) : "never";
      var zeroCls = b.clicks === 0 ? "zero" : "";
      var iconCls = b.clicks === 0 ? "channel-icon cold" : "channel-icon";
      return '<div class="contact-card ' + zeroCls + '">'
        + '<div class="name"><span class="' + iconCls + '" style="background:' + (b.clicks ? c.accent : "var(--fg-faint)") + '"></span>' + esc(c.label) + '</div>'
        + '<div class="clicks">' + b.clicks + '<span class="unit">clicks</span></div>'
        + '<div class="meta">'
          + '<b>' + uniq + '</b> unique visitor' + (uniq === 1 ? '' : 's') + '<br>'
          + '<b>' + b.hovers + '</b> hover-dwell' + (b.hovers === 1 ? '' : 's')
            + (b.hovers > 0 ? ' · avg ' + avgHover + 'ms' : '')
            + '<br>'
          + '<span class="dim">conv: ' + conv + '% · last: ' + esc(lastSeen) + '</span>'
        + '</div>'
        + '<div class="pct-bar"><div class="fill" style="width:' + pct.toFixed(1) + '%;background:' + c.accent + '"></div></div>'
        + '</div>';
    }).join("");
    $("contactGrid").innerHTML = html;
  }

  function renderTopCtas(events) {
    var rows = tallyTop(events.filter(function (e) { return e.type === "cta_click"; }),
      function (e) { return e.cta || (e.href || "—"); }, 12);
    renderBars("topCtas", rows);
  }

  function renderSectionEng(events) {
    // Combine section_view count + total dwell_ms from page_exit.section_dwell
    var views = {};
    events.filter(function (e) { return e.type === "section_view"; })
      .forEach(function (e) { views[e.section] = (views[e.section] || 0) + 1; });
    var rows = Object.keys(views).map(function (s) {
      return [s + " · " + views[s] + " views", views[s]];
    }).sort(function (a, b) { return b[1] - a[1]; });
    renderBars("sectionEng", rows);
  }

  function renderEventMix(events) {
    var rows = tallyTop(events, function (e) { return e.type; });
    rows = rows.map(function (r) { return [r[0], r[1]]; });
    renderBars("eventMix", rows);
  }

  function renderReplCmds(events) {
    var rows = tallyTop(events.filter(function (e) { return e.type === "repl_command"; }),
      function (e) { return e.cmd; }, 12);
    renderBars("replCmds", rows);
  }

  function renderDevices(events) {
    // session-level (one entry per session based on its page_load)
    var sessions = bySession(events);
    var counts = {};
    Object.keys(sessions).forEach(function (s) {
      var sess = sessions[s];
      var b = browserOf(sess.ua);
      var d = deviceOf(sess);
      var k = d + " · " + b;
      counts[k] = (counts[k] || 0) + 1;
    });
    var rows = Object.keys(counts).map(function (k) { return [k, counts[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    renderBars("devices", rows);
  }

  function renderReferrers(events) {
    var sessions = bySession(events);
    var counts = {};
    Object.keys(sessions).forEach(function (s) {
      var k = refOf(sessions[s].ref);
      counts[k] = (counts[k] || 0) + 1;
    });
    var rows = Object.keys(counts).map(function (k) { return [k, counts[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    renderBars("referrers", rows);
  }

  function renderSessions(events) {
    var sessions = bySession(events);
    var sids = Object.keys(sessions);
    $("sessionCount").textContent = "· " + sids.length + " in range";
    // sort by most recent activity desc
    sids.sort(function (a, b) { return sessions[b].last - sessions[a].last; });
    var html = "";
    sids.slice(0, 60).forEach(function (s) {
      var sess = sessions[s];
      var dur = sess.last - sess.first;
      var hadCta = sess.events.some(function (e) { return e.type === "cta_click"; });
      var hadDeep = sess.events.some(function (e) { return e.type === "scroll" && e.depth >= 75; });
      var hadRepl = sess.events.some(function (e) { return e.type === "repl_command"; });
      var badge = "";
      if (hadCta || hadDeep || hadRepl) badge = '<span class="badge engaged">engaged</span>';
      else if (sess.events.length <= 2) badge = '<span class="badge bounce">bounce</span>';
      else badge = '<span class="badge">' + sess.events.length + 'e</span>';
      html += '<div class="session-row" data-sid="' + esc(s) + '">'
        + '<div class="sid">' + esc(s.slice(0, 8)) + '</div>'
        + '<div class="meta">'
          + dfmt(sess.first) + ' · ' + esc(browserOf(sess.ua)) + ' · ' + esc(deviceOf(sess))
          + ' · ' + esc(refOf(sess.ref)) + ' · ' + durFmt(dur)
        + '</div>'
        + badge
        + '</div>';
    });
    $("sessionList").innerHTML = html || '<div class="empty">no sessions</div>';
    Array.prototype.forEach.call(document.querySelectorAll(".session-row"), function (row) {
      row.addEventListener("click", function () {
        openSessionModal(row.getAttribute("data-sid"), sessions[row.getAttribute("data-sid")]);
      });
    });
  }

  function renderLiveFeed(events) {
    var recent = events.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 30);
    var html = recent.map(function (e) {
      return '<div class="live-row">'
        + '<div class="t">' + tsfmt(e.ts) + '</div>'
        + '<div><span class="pill ' + esc(e.type) + '">' + esc(e.type) + '</span></div>'
        + '<div>' + esc(detailFor(e)) + '</div>'
        + '</div>';
    }).join("");
    $("liveFeed").innerHTML = html || '<div class="empty">no events</div>';
  }

  function detailFor(e) {
    switch (e.type) {
      case "page_load":      return (refOf(e.ref) === "direct" ? "direct" : "from " + refOf(e.ref)) + " · " + (e.vw + "×" + e.vh);
      case "scroll":         return "depth " + e.depth + "%";
      case "section_view":   return "section " + e.section;
      case "cta_click":      return (e.cta || "?") + (e.href ? " → " + e.href : "");
      case "background_click": return "section " + (e.section || "—");
      case "selection":      return "len " + (e.length || 0) + " · " + (e.section || "—");
      case "copy":           return "len " + (e.length || 0) + " · " + (e.section || "—");
      case "paste":          return "len " + (e.length || 0) + " · " + (e.section || "—");
      case "contextmenu":    return "right-click · " + (e.section || "—");
      case "repl_command":   return "$ " + e.cmd + (e.ms_typing ? " · typed in " + e.ms_typing + "ms" : "");
      case "repl_focus":     return "focused REPL input";
      case "hover_dwell":    return (e.cta || "?") + " · " + (e.ms || 0) + "ms";
      case "visibility":     return e.hidden ? "tab hidden" : "tab visible";
      case "viewport_resize":return e.vw + "×" + e.vh;
      case "page_exit":      return durFmt(e.total_ms) + " on page · " + (e.sections_viewed || 0) + " sections · max scroll " + (e.max_scroll || 0) + "%";
      default:               return "";
    }
  }

  function openSessionModal(sid, sess) {
    modalTitle.textContent = "Session " + sid.slice(0, 16);
    var head = '<div style="color: var(--fg-dim); margin-bottom: 0.7em; font-size: 0.85em;">'
      + esc(browserOf(sess.ua)) + " · " + esc(deviceOf(sess))
      + " · " + esc(refOf(sess.ref))
      + " · " + (sess.vw || "?") + "×" + (sess.tz || "")
      + " · " + sess.events.length + " events"
      + " · " + durFmt(sess.last - sess.first)
      + "</div>";
    var tline = sess.events.map(function (e) {
      return '<div class="timeline-row">'
        + '<div class="t">' + tsfmt(e.ts) + '</div>'
        + '<div><span class="pill ' + esc(e.type) + '">' + esc(e.type) + '</span></div>'
        + '<div class="sect">' + esc(e.section || "—") + '</div>'
        + '<div class="detail">' + esc(detailFor(e)) + '</div>'
        + '</div>';
    }).join("");
    modalBody.innerHTML = head + tline;
    modal.hidden = false;
  }

  // ---- main render ----
  function renderAll() {
    var inRange = filterByRange(all);
    metaEl.textContent = "· " + all.length + " events · " + inRange.length + " in range · updated " + tsfmt(Date.now());
    renderOverview(inRange);
    renderVisitors(inRange);
    renderLocations(inRange);
    renderContactChannels(inRange);
    renderTopCtas(inRange);
    renderSectionEng(inRange);
    renderEventMix(inRange);
    renderReplCmds(inRange);
    renderDevices(inRange);
    renderReferrers(inRange);
    renderSessions(inRange);
    renderLiveFeed(inRange);
  }

  function load() {
    statusEl.textContent = "loading…";
    fetch(location.pathname + "/events")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) {
        all = (j || []).map(flattenExtJson);
        all.sort(function (a, b) { return b.ts - a.ts; });
        statusEl.textContent = "ok";
        renderAll();
      })
      .catch(function (err) {
        statusEl.textContent = "error: " + err.message;
      });
  }

  function scheduleAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (autoChk.checked) autoTimer = setInterval(load, 15000);
  }

  rangeSel.addEventListener("change", renderAll);
  refreshBtn.addEventListener("click", load);
  autoChk.addEventListener("change", scheduleAuto);

  load();
  scheduleAuto();
})();
