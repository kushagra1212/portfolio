// assets/track.js — minimal event tracker. Zero deps. ~80 lines.
//
// POSTs JSON events to /track. Server writes them to portfolio.events in mongo.
// Captures: page_load, scroll-depth thresholds (25/50/75/100), CTA clicks, page exit.
// Session id stored in sessionStorage so a session = one tab visit.
(function () {
  var SESSION_KEY = "fw_session_id";
  var ENDPOINT = "/track";

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

  function send(evt) {
    var payload = Object.assign(
      {
        ts: Date.now(),
        session: sessionId(),
        page: location.pathname + location.search,
        ref: document.referrer || null,
        ua: navigator.userAgent,
        vw: window.innerWidth,
        vh: window.innerHeight,
      },
      evt
    );
    try {
      var body = JSON.stringify(payload);
      // sendBeacon survives page unload, but only for small payloads.
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

  // 1) page_load
  send({ type: "page_load" });

  // 2) scroll depth — fires once per 25/50/75/100 threshold crossed
  var sentDepths = {};
  function onScroll() {
    var docH = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    var winH = window.innerHeight;
    var scrolled = window.scrollY + winH;
    var pct = Math.floor((scrolled / docH) * 100);
    [25, 50, 75, 100].forEach(function (d) {
      if (pct >= d && !sentDepths[d]) {
        sentDepths[d] = true;
        send({ type: "scroll", depth: d });
      }
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // 3) CTA clicks — anything with [data-cta] OR any <a href>
  document.addEventListener(
    "click",
    function (e) {
      var t = e.target.closest("[data-cta], a[href], button");
      if (!t) return;
      send({
        type: "cta_click",
        cta: t.getAttribute("data-cta") || t.textContent.trim().slice(0, 50),
        href: t.getAttribute("href") || null,
        tag: t.tagName.toLowerCase(),
      });
    },
    true
  );

  // 4) time-on-page at unload
  var loadAt = Date.now();
  window.addEventListener("pagehide", function () {
    send({ type: "page_exit", ms: Date.now() - loadAt });
  });
})();
