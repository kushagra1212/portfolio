# The Career Compiler — Kushagra Rathore

A portfolio that is **served by Flow-Wing**, the programming language Kushagra
built in C++/LLVM ([github.com/kushagra1212/Flow-Wing](https://github.com/kushagra1212/Flow-Wing)).

The front-end is hand-written HTML/CSS/JS with **zero dependencies and zero
build step**. The page itself is delivered by `server.fg` — a Flow-Wing program
that uses the language's built-in `vortex` HTTP module. The Flow-Wing compiler
compiles/runs `server.fg`; that program then serves `index.html` and
`/assets/*`. This is the **same mechanism** flow-wing's own website uses
(`flowwing-explorer/flow-wing-website/server.fg` in the Flow-Wing repo), so the
"served by Flow-Wing" claim is literal.

## Run it on Flow-Wing (the real claim)

Requires the Flow-Wing toolchain installed (see the
[Flow-Wing docs](https://flow-wing-docs.vercel.app/)). `.fg` is the Flow-Wing
source extension.

```sh
# JIT — compile + run in one step
flowwing-jit server.fg

# or AOT — native binary
flowwing server.fg -o career && ./career
```

Then open <http://127.0.0.1:8080>.

> `server.fg` is written against the real `vortex` module API and mirrors the
> official Flow-Wing site's `server.fg` line-for-line in structure. It has not
> been runtime-tested in this repo (no Flow-Wing toolchain here) — run the
> commands above on a machine with Flow-Wing installed to verify.

## Run it without Flow-Wing (static fallback)

It is also a plain static site — open `index.html`, or:

```sh
python3 -m http.server 8765   # http://127.0.0.1:8765
```

## Structure

```
index.html        the page (semantic, single file)
assets/style.css  hand-crafted, blue-green deploy theme
assets/bg.js      live AST/LLVM node-graph canvas
assets/pipeline.js scroll-driven compiler stages, counters, dot canvas
assets/compiler.js the working REPL + tiny Flow-Wing-style interpreter
server.fg         Flow-Wing program that serves all of the above (vortex)
```

## Notes / to verify before publishing

- LinkedIn / LeetCode / Medium URLs are guessed from the `kushagra1212`
  GitHub handle — marked `data-verify` in `index.html`. Replace with real URLs.
- Phone number is public; remove from `index.html` if undesired.

