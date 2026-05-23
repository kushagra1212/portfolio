# Portfolio — Kushagra Rathore

Served by [Flow-Wing](https://flowwing.frii.site), the C++/LLVM compiler I wrote.
One HTML file, CSS, JS. No build step.

## Run

```sh
flowwing server.fg -o career && ./career
```

Then http://127.0.0.1:8080.

Needs the [Flow-Wing toolchain](https://flow-wing-docs.vercel.app/).
Plain static fallback if you don't have it:

```sh
python3 -m http.server 8765
```

## Tracking

Every interaction (page load, scroll, CTA click, copy, REPL command, hover dwell, etc.) POSTs to `/track`. `server.fg` writes to MongoDB `portfolio.events`. Dashboard at `/admin/<token>` shows visitors by IP, contact-channel breakdown, REPL command stats, per-session timelines.

Local dev: no args → `mongodb://127.0.0.1:27017` + `dev-admin-token`.
Production: `./career "<mongo-uri>" "<admin-token>"`. See [ATLAS-SETUP.md](ATLAS-SETUP.md).

To hide your own visits, on each browser you use to view the portfolio:

```js
localStorage.setItem("fw_is_me", "1")
```

Events from that browser get `is_self: true` and are hidden in the dashboard by default.

## Files

```
server.fg          Flow-Wing HTTP server (vortex + mongo)
career.fg          career data, runs in the REPL
index.html         the page
assets/style.css   styling
assets/bg.js       canvas background
assets/pipeline.js scroll-driven compiler-stage animation
assets/compiler.js the REPL
assets/track.js    event tracker
assets/admin.*     dashboard
```
