// assets/admin.js — render events table + filters + simple stats.
// Fetches /admin/<token>/events relative to current path.
(function () {
  var rowsEl = document.getElementById("rows");
  var statusEl = document.getElementById("status");
  var metaEl = document.getElementById("meta");
  var statsEl = document.getElementById("stats");
  var filterEl = document.getElementById("filter");
  var typeSel = document.getElementById("typesel");
  var refreshBtn = document.getElementById("refresh");

  var all = [];

  function detail(e) {
    if (e.type === "scroll") return "depth " + e.depth + "%";
    if (e.type === "cta_click") {
      var parts = [];
      if (e.cta) parts.push(e.cta);
      if (e.href) parts.push("→ " + e.href);
      return parts.join(" ");
    }
    if (e.type === "page_exit") return (e.ms || 0) + " ms on page";
    if (e.type === "page_load" && e.ref) return "ref " + e.ref;
    return "";
  }

  function tsfmt(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return (
      d.getFullYear() +
      "-" + pad(d.getMonth() + 1) +
      "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) +
      ":" + pad(d.getMinutes()) +
      ":" + pad(d.getSeconds())
    );
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderStats(events) {
    var byType = { page_load: 0, scroll: 0, cta_click: 0, page_exit: 0 };
    var sessions = {};
    var pages = {};
    events.forEach(function (e) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      if (e.session) sessions[e.session] = true;
      if (e.page) pages[e.page] = (pages[e.page] || 0) + 1;
    });
    var topPage = "";
    var topCount = 0;
    Object.keys(pages).forEach(function (p) {
      if (pages[p] > topCount) { topCount = pages[p]; topPage = p; }
    });
    statsEl.innerHTML =
      stat(events.length, "total events") +
      stat(Object.keys(sessions).length, "unique sessions") +
      stat(byType.page_load, "page loads") +
      stat(byType.cta_click, "CTA clicks") +
      stat(byType.scroll, "scroll events") +
      stat(topPage || "—", "top page");
  }
  function stat(num, label) {
    return '<div class="stat"><span class="num">' + esc(num) + '</span><span class="label">' + esc(label) + '</span></div>';
  }

  function render() {
    var q = (filterEl.value || "").toLowerCase();
    var t = typeSel.value;
    var html = "";
    var n = 0;
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (t && e.type !== t) continue;
      if (q) {
        var hay = [e.type, e.page, e.cta, e.href, e.session].join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) continue;
      }
      n++;
      html += "<tr>"
        + "<td class=\"mono\">" + esc(tsfmt(e.ts)) + "</td>"
        + "<td><span class=\"pill " + esc(e.type) + "\">" + esc(e.type) + "</span></td>"
        + "<td class=\"mono\">" + esc(String(e.session || "").slice(0, 8)) + "</td>"
        + "<td class=\"mono\">" + esc(e.page) + "</td>"
        + "<td>" + esc(detail(e)) + "</td>"
        + "</tr>";
    }
    rowsEl.innerHTML = html || '<tr><td colspan="5" class="empty">no events match filters</td></tr>';
    statusEl.textContent = "showing " + n + " of " + all.length;
  }

  function load() {
    statusEl.textContent = "loading…";
    fetch(location.pathname + "/events")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) {
        // Mongo extended JSON wraps numbers/ObjectIds — flatten the ones we care about.
        all = (j || []).map(function (e) {
          if (e.ts && typeof e.ts === "object" && e.ts.$numberLong) e.ts = parseInt(e.ts.$numberLong, 10);
          if (e._id && typeof e._id === "object" && e._id.$oid) e._id = e._id.$oid;
          return e;
        });
        all.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        metaEl.textContent = "· last update " + tsfmt(Date.now());
        renderStats(all);
        render();
      })
      .catch(function (err) {
        statusEl.textContent = "error: " + err.message;
        rowsEl.innerHTML = '<tr><td colspan="5" class="empty">' + esc(err.message) + '</td></tr>';
      });
  }

  filterEl.addEventListener("input", render);
  typeSel.addEventListener("change", render);
  refreshBtn.addEventListener("click", load);
  load();
})();
