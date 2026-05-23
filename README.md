# Portfolio — Kushagra Rathore

Live: https://kushagra.frii.site

Served by [Flow-Wing](https://flowwing.frii.site), the C++/LLVM compiler.
One HTML file, CSS, JS. No build step, no framework.

## Stack

- **Backend** — [Flow-Wing](https://flowwing.frii.site) (C++/LLVM), [vortex](https://github.com/kushagra1212/Flow-Wing/tree/main/fw-modules/vortex_module) HTTP module, [mongo-c-driver](https://github.com/mongodb/mongo-c-driver) via the Flow-Wing `mongo` binding.
- **Frontend** — vanilla HTML / CSS / JS. Canvas animations hand-rolled. No bundler, no transpiler.
- **Storage** — MongoDB (Atlas in prod, local mongod in dev).

## Run locally

Needs the [Flow-Wing toolchain](https://flow-wing-docs.vercel.app/) and a MongoDB instance.

```sh
brew install mongo-c-driver mongodb-community
brew services start mongodb-community
flowwing server.fg -o career && ./career
```

Then http://127.0.0.1:8080.

Plain-static fallback (no tracking, no admin) when the toolchain isn't installed:

```sh
python3 -m http.server 8765
```

## Production

```sh
./career "<mongodb-uri>" "<admin-token>"
```

`server.fg` reads the Mongo URI from `argv[1]` and the admin token from `argv[2]`. Both fall back to local-dev defaults when unset. Atlas provisioning + Docker Compose env wiring: [ATLAS-SETUP.md](ATLAS-SETUP.md).

## Files

```
server.fg            Flow-Wing HTTP server (vortex + mongo bindings)
career.fg            Career data, runs in the in-page REPL
index.html           The page
assets/style.css     Styling
assets/bg.js         Canvas background (AST/LLVM node graph)
assets/pipeline.js   Scroll-driven compiler-stage animation
assets/compiler.js   The REPL
assets/track.js      Event tracker
assets/admin.html    Dashboard markup
assets/admin.css     Dashboard styling
assets/admin.js      Dashboard logic (aggregations, charts)
ATLAS-SETUP.md       Production MongoDB / Atlas setup
```

## Contact

- Email — kushagrarathore002@gmail.com
- GitHub — [kushagra1212](https://github.com/kushagra1212)
- LinkedIn — [in/kushagra-rathore](https://www.linkedin.com/in/kushagra-rathore/)
