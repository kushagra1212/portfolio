# Mongo Binding Upstream + Portfolio Analytics — Implementation Plan v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Supersedes** `2026-05-24-mongo-module.md` (v1). v1's Tasks 11-12 (libtool merge, README) are obsolete — the upstream Flow-Wing repo already does libtool-merge for raylib and the portfolio will get its binding from the apt-installed `flowwing` rather than from a local `build/out/libflowwing_mongo.a`.

**Goal:** Ship a MongoDB binding as part of the Flow-Wing language (upstream `fw-modules/mongo_module`, version bump 1.0.4 → 1.0.5, builds into the apt package), then wire the portfolio at `/Users/apple/code/per/me` to use it for event tracking (Atlas in prod, local mongo on mac), with a hidden admin dashboard.

**Architecture:**

```
Phase A: /Users/apple/code/per/Flow-Wing (upstream, no commits)
  ExternalProject mongo-c-driver (Git pinned, BUILD_SHARED_LIBS=OFF)
       → cmake/deps_builder/CMakeLists.txt
  fw-modules/mongo_module/ → libflowwing_mongo.a (libmongoc + libbson merged)
       → bring mongo (stdlib) in any .fg
  Version bump 1.0.4 → 1.0.5 in root CMakeLists.txt
  tests/local/mongo_test.fg validates via the existing Python runner

Phase B: /Users/apple/code/per/me (portfolio, branch feat/mongo-atlas-tracking)
  Strip the local proof-of-concept binding (now upstream).
  server.fg:
    bring mongo
    + /track POST route (writes events)
    + /admin/<token> GET route (dashboard HTML)
    + reads MONGO_URI from env (local fallback)
  assets/track.js: page_load, scroll depth, CTA clicks, session id, time-on-page
  assets/admin.html + admin.js: events table with filters
  ATLAS-SETUP.md: step-by-step guide for user to provision Atlas

Phase C: MongoDB Atlas (user executes from guide)
```

**Tech stack:** Flow-Wing 1.0.5 (cut as part of this plan), libmongoc + libbson 2.x (pinned upstream), CMake 3.29+, GNU make, MongoDB Atlas free-tier (M0), vanilla JS (zero deps), HTML/CSS.

**Prerequisites (already verified):**
- `mongo-c-driver` installed locally via brew (for dev iteration).
- `mongod` running locally on `:27017`.
- Flow-Wing upstream cloned at `/Users/apple/code/per/Flow-Wing` (branch `main`, tip ~`e9497c85`).
- Local portfolio at `/Users/apple/code/per/me` (branch `feat/mongo-binding` has the v1 work; Phase B creates a new branch off `main` or starts fresh).

**Branch hygiene:**
- `feat/mongo-binding` (current): keep as archive; do NOT merge to main. v1 binding work lives here as historical reference.
- Phase A: NO branches in upstream Flow-Wing repo per user instruction. Edits stay uncommitted.
- Phase B: new branch `feat/mongo-atlas-tracking` cut from `main`.

---

## PHASE A — Flow-Wing upstream (no commits)

Working directory for every Phase A task: `/Users/apple/code/per/Flow-Wing`. Do NOT `git add` or `git commit` — user will do at the end.

Reference: existing `fw-modules/raylib_module/` (CMakeLists, libflowwing_raylib.cpp, raylib-module.fg) shows the canonical shape for a binding. Mirror it for mongo.

---

### Task A1: Register mongo-c-driver as a Flow-Wing dep

**Files:**
- Modify: `cmake/deps_builder/CMakeLists.txt`

- [ ] **Step 1: Add the `ExternalProject_Add` block**

Open `cmake/deps_builder/CMakeLists.txt`. Find the existing `raylib_external` block (around line 162). Immediately after it (still inside the same scope), add:

```cmake
ExternalProject_Add(
    mongo_c_driver_external
    GIT_REPOSITORY  "https://github.com/mongodb/mongo-c-driver.git"
    GIT_TAG         "2.3.0"
    GIT_SHALLOW     TRUE
    CMAKE_ARGS
        -DCMAKE_INSTALL_PREFIX=${DEPS_INSTALL_DIR}
        -DCMAKE_BUILD_TYPE=${CMAKE_CONFIG_TYPE}
        -DBUILD_SHARED_LIBS=OFF
        -DENABLE_TESTS=OFF
        -DENABLE_EXAMPLES=OFF
        -DENABLE_SASL=OFF
        -DENABLE_SRV=OFF
        -DENABLE_SNAPPY=OFF
        -DENABLE_ZSTD=OFF
        -DENABLE_ZLIB=BUNDLED
        -DENABLE_MONGOC=ON
        -DENABLE_BSON=ON
        -DENABLE_STATIC=ON
    USES_TERMINAL_DOWNLOAD true
    USES_TERMINAL_CONFIGURE true
    USES_TERMINAL_BUILD true
    USES_TERMINAL_INSTALL true
    GIT_PROGRESS TRUE
)
```

Rationale for each flag:
- `BUILD_SHARED_LIBS=OFF`, `ENABLE_STATIC=ON` — produce `.a` archives so libtool/ar can merge them.
- `ENABLE_TESTS=OFF`, `ENABLE_EXAMPLES=OFF` — cut build time; we don't need their test binaries.
- `ENABLE_SASL/SRV/SNAPPY/ZSTD=OFF` — drop optional auth/compression deps that would require additional system libs (cyrus-sasl, c-ares, snappy). Atlas works fine without SRV resolution as long as the connection string is the non-`+srv` form (we'll use that). If user later wants `mongodb+srv://`, this can be flipped to ON with a c-ares dep added.
- `ENABLE_ZLIB=BUNDLED` — use the bundled zlib (mongo-c-driver ships one). Avoids dragging in system zlib.
- `ENABLE_MONGOC=ON`, `ENABLE_BSON=ON` — build both libraries (mongoc depends on bson).

- [ ] **Step 2: Verify the deps build**

Run from `/Users/apple/code/per/Flow-Wing`:
```sh
make deps-install-release
```

Expected: existing raylib/LLVM/bdwgc deps are re-checked (likely already-installed stamps trigger skip), then mongo-c-driver clones and builds. The build will take 2-5 minutes (libmongoc has ~50 cpp files, libbson ~80).

After completion, verify the artifacts:
```sh
ls .fw_dependencies/install/lib | grep -E "mongoc|bson"
ls .fw_dependencies/install/include | grep -E "mongoc|bson"
```

Expected: `libmongoc-static-1.0.a` (or `libmongoc-1.0.a`) and `libbson-static-1.0.a` (or `libbson-1.0.a`) under `lib/`; `mongoc-1.0/` and `bson-1.0/` directories under `include/`.

The exact filename pattern may differ between mongo-c-driver versions. Note the exact names — they're used in Task A4's `find_library`.

If the build fails: read the cmake error, identify the missing system dep (commonly `cmake`, `libtool`, `pkg-config`, `perl`, `python3` — all should already be present from raylib/LLVM builds), install it, re-run.

**No commit. Report what filenames the install dir produced.**

---

### Task A2: Port `libflowwing_mongo.cpp` from portfolio repo into upstream layout

**Files:**
- Create: `fw-modules/mongo_module/libflowwing_mongo.cpp`
- Create: `fw-modules/mongo_module/mongo.h`

- [ ] **Step 1: Copy & adapt the source**

Source file in this repo: `/Users/apple/code/per/me/src/mongo_binding.cpp` (latest version, ~12 functions, post-Task-8). Copy its content into `fw-modules/mongo_module/libflowwing_mongo.cpp` in the upstream repo.

Adaptations needed at the top of the file:

```cpp
// fw-modules/mongo_module/libflowwing_mongo.cpp
//
// FlowWing Compiler
// Copyright (C) 2023-2026 Kushagra Rathore
//
// (GPL v2 header — mirror what fw-modules/raylib_module/libflowwing_raylib.cpp
//  has at the top; copy that header verbatim including the license block.)

#include <mongoc/mongoc.h>
#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

// Remove the `#include "mongo_binding.h"` line — upstream convention uses an
// inline forward decl pattern or no separate header. Check raylib_module's
// libflowwing_raylib.cpp top to see how it does this; mirror exactly.

// All `extern "C"` blocks, the `_clients[]` / `_collections[]` / `_cursors[]`
// handle tables, thread-local error/result strings, and the 11 functions
// (_mongo_client_new through _mongo_last_error) carry over verbatim — they
// do not depend on any portfolio-specific code.
```

- [ ] **Step 2: Create `mongo.h` if upstream pattern uses one**

Check whether `fw-modules/raylib_module/` has a `.h` file (it does — `raylib.h`). If yes, create `fw-modules/mongo_module/mongo.h` mirroring it. Most likely it just contains C declarations matching the `extern "C"` block in the cpp file.

If raylib's `.h` is actually just the upstream raylib library's own header (vendored), then for mongo the equivalent would be a re-export shim — but mongo-c-driver's headers are already at `DEPS_INSTALL_DIR/include/mongoc-1.0/mongoc/mongoc.h`, so we don't vendor them. In that case, omit `mongo.h` entirely; the cpp file `#include`s the upstream header directly.

- [ ] **Step 3: Drop portfolio-specific path assumptions**

The portfolio cpp uses `_last_error` initialization that's safe. No portfolio-specific paths. Should be a clean port.

**No commit. Report the file size in lines.**

---

### Task A3: Write `mongo-module.fg` with upstream conventions

**Files:**
- Create: `fw-modules/mongo_module/mongo-module.fg`

- [ ] **Step 1: Read the raylib reference**

Open `fw-modules/raylib_module/raylib-module.fg` end-to-end. Note:
- The file structure: comment header → `decl` extern declarations → `module [name]` directive → classes (with `init()` constructors) and free functions inside the module block.
- Class syntax: `class X { var f: type; init(args) -> nthg { self.f = args } fun method(self, ...) -> ret { ... } }`.
- The `module [raylib]` directive determines the public namespace; consumers `bring raylib` and then call `raylib::Texture`, `raylib::drawCircle()`, etc.

- [ ] **Step 2: Write `mongo-module.fg`**

Use exactly the same skeleton as raylib's:

```flow-wing
/; Copyright (C) 2023-2026 Kushagra Rathore
/; (GPL v2 header matching raylib-module.fg verbatim)
/;
/; mongo-module.fg — Flow-Wing binding to libmongoc.
/; bring mongo; var mc: mongo::Client = new mongo::Client("mongodb://...")

/; ---- FFI extern declarations (internal use) ----
fun _mongo_client_new(uri: as str) -> as int64 decl
fun _mongo_client_close(h: as int64) -> as nthg decl
fun _mongo_get_collection(client: as int64, db: as str, coll: as str) -> as int64 decl
fun _mongo_insert_one(coll: as int64, json: as str) -> as int64 decl
fun _mongo_insert_many(coll: as int64, jsonArray: as str) -> as int64 decl
fun _mongo_find_one(coll: as int64, filterJson: as str) -> as str decl
fun _mongo_find(coll: as int64, filterJson: as str, limit: as int64) -> as int64 decl
fun _mongo_count(coll: as int64, filterJson: as str) -> as int64 decl
fun _mongo_cursor_next(cur: as int64) -> as str decl
fun _mongo_cursor_close(cur: as int64) -> as nthg decl
fun _mongo_last_error() -> as str decl

module [mongo]

class Cursor {
    var _h: int64
    init(h: int64) -> nthg {
        self._h = h
    }
    fun next(self) -> str {
        return _mongo_cursor_next(self._h)
    }
    fun close(self) -> nthg {
        _mongo_cursor_close(self._h)
    }
}

class Collection {
    var _h: int64
    init(h: int64) -> nthg {
        self._h = h
    }
    fun insertOne(self, json: str) -> bool {
        var ok: int64 = _mongo_insert_one(self._h, json)
        return ok == 1
    }
    fun insertMany(self, jsonArr: str) -> bool {
        var ok: int64 = _mongo_insert_many(self._h, jsonArr)
        return ok == 1
    }
    fun findOne(self, filterJson: str) -> str {
        return _mongo_find_one(self._h, filterJson)
    }
    fun find(self, filterJson: str, limit: int64) -> mongo::Cursor {
        var ch: int64 = _mongo_find(self._h, filterJson, limit)
        return new mongo::Cursor(ch)
    }
    fun count(self, filterJson: str) -> int64 {
        return _mongo_count(self._h, filterJson)
    }
}

class Client {
    var _h: int64
    init(uri: str) -> nthg {
        self._h = _mongo_client_new(uri)
    }
    fun isOk(self) -> bool {
        return self._h != 0
    }
    fun getCollection(self, db: str, coll: str) -> mongo::Collection {
        var ch: int64 = _mongo_get_collection(self._h, db, coll)
        return new mongo::Collection(ch)
    }
    fun close(self) -> nthg {
        _mongo_client_close(self._h)
    }
}

fun lastError() -> str {
    return _mongo_last_error()
}
```

Notes on shape choices:
- Methods return `bool` (`true` on success) instead of `Err::Result` because raylib's pattern doesn't use Err — it returns primitives. Mirroring upstream convention. Caller checks the bool and calls `mongo::lastError()` if needed.
- `Client.connect()` is rolled into `init(uri)` per upstream constructor style.
- `findOne` returns `str`; empty string means "no result" OR "error" (caller calls `mongo::lastError()` to distinguish — same as raylib's `loadTexture` returning -1 on failure, then caller checks).
- Class names are bare (`Client`, `Collection`, `Cursor`) — namespaced via `module [mongo]` so consumers write `mongo::Client`.

**Flow-Wing conventions reminder:** every arg to a `decl` extern must be `var`-bound, never a literal. The class methods above already conform — their args come from `self.` fields or method parameters, all of which are vars.

**No commit. Report the line count.**

---

### Task A4: Write `fw-modules/mongo_module/CMakeLists.txt`

**Files:**
- Create: `fw-modules/mongo_module/CMakeLists.txt`

- [ ] **Step 1: Copy raylib's CMakeLists.txt as the starting point**

Open `fw-modules/raylib_module/CMakeLists.txt`. Use it as the template; adapt as follows:

```cmake
# fw-modules/mongo_module/CMakeLists.txt
# (GPL v2 header matching the raylib version)

add_library(flowwing_mongo STATIC libflowwing_mongo.cpp)

# Locate the static archives that mongo-c-driver 2.3.0 installed.
# Verified actual filenames (Task A1 side-build): libmongoc2.a + libbson2.a.
find_library(MONGOC_LIB NAMES mongoc2 PATHS "${DEPS_INSTALL_DIR}/lib" NO_DEFAULT_PATH REQUIRED)
find_library(BSON_LIB   NAMES bson2   PATHS "${DEPS_INSTALL_DIR}/lib" NO_DEFAULT_PATH REQUIRED)

target_include_directories(flowwing_mongo PRIVATE
    "${DEPS_INSTALL_DIR}/include/mongoc-2.3.0"
    "${DEPS_INSTALL_DIR}/include/bson-2.3.0"
)

# libbson 2.x public typedef loses an alignment attribute on bson_t*; pointers
# are correctly aligned at runtime. Same suppress used in the portfolio's draft.
target_compile_options(flowwing_mongo PRIVATE -Wno-align-mismatch)

if(APPLE)
    add_custom_command(TARGET flowwing_mongo POST_BUILD
        COMMAND libtool -static -o $<TARGET_FILE:flowwing_mongo>
                $<TARGET_FILE:flowwing_mongo>
                ${MONGOC_LIB}
                ${BSON_LIB}
        COMMENT "Merging libmongoc + libbson into flowwing_mongo"
    )
    target_link_libraries(flowwing_mongo PUBLIC
        "-framework CoreFoundation"
        "-framework Security"
        resolv
    )
elseif(UNIX AND NOT APPLE)
    find_package(Threads REQUIRED)
    find_package(OpenSSL REQUIRED)
    target_link_libraries(flowwing_mongo PUBLIC
        ${MONGOC_LIB}
        ${BSON_LIB}
        ${OPENSSL_LIBRARIES}
        Threads::Threads
        resolv
        m
        dl
    )
    add_custom_command(TARGET flowwing_mongo POST_BUILD
        COMMAND ar -x $<TARGET_FILE:flowwing_mongo>
        COMMAND ar -x ${MONGOC_LIB}
        COMMAND ar -x ${BSON_LIB}
        COMMAND ar -rcs $<TARGET_FILE:flowwing_mongo> *.o
        COMMAND rm *.o
        WORKING_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}
        COMMENT "Merging libmongoc + libbson into flowwing_mongo using ar"
    )
elseif(WIN32)
    target_link_libraries(flowwing_mongo PUBLIC ${MONGOC_LIB} ${BSON_LIB} ws2_32 secur32 crypt32 dnsapi)
endif()
```

The OS-specific link libraries:
- **macOS:** `CoreFoundation` + `Security` are what libmongoc's macOS TLS layer needs; `resolv` is for DNS.
- **Linux:** OpenSSL (TLS), pthread, resolv, m, dl. If a user's Linux box doesn't have libssl-dev, the build will fail loudly with a clear error.
- **Windows:** Winsock (ws2_32), Security APIs (secur32, crypt32), DNS (dnsapi).

If the libtool-merge step fails on macOS because one of the `.a` files actually got installed with a different filename, the `find_library REQUIRED` calls will fail at configure time with a clear error pointing to the search path. Update `find_library NAMES` to match what Task A1's step 2 reported.

**No commit. Build via Task A5 will exercise this file.**

---

### Task A5: Register the module + build

**Files:**
- Modify: `fw-modules/CMakeLists.txt`

- [ ] **Step 1: Add the subdirectory**

Open `fw-modules/CMakeLists.txt`. After the existing `add_subdirectory(raylib_module)` line, add:

```cmake
add_subdirectory(mongo_module)
```

- [ ] **Step 2: Build the AOT release**

```sh
cd /Users/apple/code/per/Flow-Wing
make aot-release
```

Expected: configures, compiles the entire Flow-Wing compiler + all modules including `flowwing_mongo`, no errors. The `flowwing_mongo` target builds as a static library and gets merged via libtool.

If errors:
- Undefined libmongoc symbols at link time → check `find_library` names in Task A4 against actual filenames from Task A1.
- `mongoc/mongoc.h not found` → check `target_include_directories` path; should be `${DEPS_INSTALL_DIR}/include/mongoc-1.0`.
- Build hangs on LLVM → that's normal first-time behavior (LLVM is a big dep); subsequent builds are incremental.

- [ ] **Step 3: Verify the artifact**

After successful build:
```sh
find build/aot-release -name "libflowwing_mongo*"
nm build/aot-release/<path>/libflowwing_mongo.a 2>/dev/null | grep -E "_mongo_(client_new|insert_one|find)" | head -5
```

Expected: the static lib exists; the 11 `_mongo_*` symbols are defined (`T`).

**No commit. Report the full path of `libflowwing_mongo.a` and the symbols `nm` found.**

---

### Task A6: Bump version 1.0.4 → 1.0.5

**Files:**
- Modify: `CMakeLists.txt` (root)
- Possibly modify: `cmake/version.cmake`, packaging scripts

- [ ] **Step 1: Find every version reference**

```sh
cd /Users/apple/code/per/Flow-Wing
grep -rn "1\.0\.4" --include="CMakeLists.txt" --include="*.cmake" --include="*.py" --include="*.json" .
```

Expected hits (likely):
- `CMakeLists.txt` line ~28: `project(FlowWing VERSION 1.0.4 ...)`
- `cmake/version.cmake` if it exists
- `cmake/packaging.cmake` may have version refs for `.deb` package metadata
- Maybe a `package.json` for the docs site

- [ ] **Step 2: Replace each**

For each hit, change `1.0.4` to `1.0.5`. Do NOT use a blanket `sed` — review each match in case any are intentional pinned-to-1.0.4 references (e.g. backwards-compat shims).

- [ ] **Step 3: Re-build to confirm version compiles in**

```sh
make aot-release
build/aot-release/<path>/flowwing --version
```

Expected: prints `Version: 1.0.5`.

**No commit. Report which files changed.**

---

### Task A7: Write `tests/local/mongo_test.fg`

**Files:**
- Create: `tests/local/mongo_test.fg`

- [ ] **Step 1: Read an existing local test for shape**

Look at `tests/local/println_test.fg` and `tests/local/local-module.fg` to see the canonical local-test pattern.

- [ ] **Step 2: Write the mongo test**

```flow-wing
/; tests/local/mongo_test.fg
/; Requires mongod on mongodb://127.0.0.1:27017
/; (set MONGO_URI env to override)

bring mongo
bring io

fun fg_main() -> nthg {
    var uri: str = "mongodb://127.0.0.1:27017"
    var mc: mongo::Client = new mongo::Client(uri)
    if !mc.isOk() {
        io::printErrorLogln("connect failed: " + mongo::lastError(), "red")
        return :
    }

    var db_name: str = "fw_test"
    var coll_name: str = "events"
    var coll: mongo::Collection = mc.getCollection(db_name, coll_name)

    var doc: str = "{\"k\":\"test\",\"n\":1}"
    var ok: bool = coll.insertOne(doc)
    if !ok {
        io::printErrorLogln("insertOne failed: " + mongo::lastError(), "red")
        mc.close()
        return :
    }

    var filter: str = "{\"k\":\"test\"}"
    var n: int64 = coll.count(filter)
    io::printLogln("count: " + n, "cyan")

    var found: str = coll.findOne(filter)
    if found == "" {
        io::printErrorLogln("findOne empty", "red")
    } else {
        io::printLogln("findOne: " + found, "white")
    }

    var lim: int64 = 3
    var cur: mongo::Cursor = coll.find(filter, lim)
    var s: str = cur.next()
    var seen: int64 = 0
    while s != "" {
        seen = seen + 1
        s = cur.next()
    }
    cur.close()
    io::printLogln("iterated: " + seen, "cyan")

    mc.close()
    io::printLogln("mongo_test ok", "green")
}

fg_main()
```

- [ ] **Step 3: Compile and run via the Makefile**

```sh
make run-aot-release FILE=tests/local/mongo_test.fg ARGS="--emit=exe"
```

Expected: AOT-compiles to a binary, executes it, prints `mongo_test ok` (with `count:`, `findOne:`, `iterated:` along the way). The expectation is mongod is reachable on localhost.

If the Flow-Wing Python test runner is set up to discover `tests/local/*_test.fg` files and run them as part of the suite, also try:
```sh
make tests-aot
```

(Or whatever the canonical test command is — check the Makefile.)

**No commit. Report the final stdout line of the binary execution.**

---

### Task A8: Final smoke — portfolio's `server.fg` compiles against new upstream

**Files:** none modified in this task

- [ ] **Step 1: Verify the upstream `flowwing` can find the `mongo` module**

The portfolio's `server.fg` is what will consume this. Without modifying server.fg yet, write a tiny throwaway file:

```sh
cat > /tmp/mongo_uses_test.fg << 'EOF'
bring mongo
bring io

fun fg_main() -> nthg {
    var uri: str = "mongodb://127.0.0.1:27017"
    var mc: mongo::Client = new mongo::Client(uri)
    if mc.isOk() {
        io::printLogln("module resolves", "green")
        mc.close()
    } else {
        io::printErrorLogln("connect failed", "red")
    }
}
fg_main()
EOF

cd /Users/apple/code/per/Flow-Wing
make run-aot-release FILE=/tmp/mongo_uses_test.fg ARGS="--emit=exe"
```

Expected: `module resolves` printed. This confirms the `bring mongo` stdlib-style import works after Task A5's registration.

**No commit. End of Phase A. Report which build path the compiled binary ended up at.**

---

## PHASE B — Portfolio repo (`/Users/apple/code/per/me`)

Working directory for every Phase B task: `/Users/apple/code/per/me`. Create a NEW branch at the start: `git checkout main && git checkout -b feat/mongo-atlas-tracking`. Do NOT merge `feat/mongo-binding`.

---

### Task B1: Strip local proof-of-concept binding

**Files:**
- Delete: `src/mongo_binding.h`, `src/mongo_binding.cpp`
- Delete: `mongo-Module.fg`, `smoke-mongo.fg`
- Delete: `build/CMakeLists.txt`, `build/Makefile`
- Delete: `compile_commands.json` symlink
- Modify: `.gitignore` (remove `build/out/`, `build/bin/`, etc — no longer needed)

- [ ] **Step 1: Remove files**

```sh
cd /Users/apple/code/per/me
git checkout main
git checkout -b feat/mongo-atlas-tracking
rm -rf src/ build/CMakeLists.txt build/Makefile build/out/ build/bin/
rm mongo-Module.fg smoke-mongo.fg compile_commands.json
```

(`src/` directory is now empty — remove it via `rm -rf` since the directory itself has no purpose post-removal.)

- [ ] **Step 2: Clean up `.gitignore`**

Open `.gitignore`. Remove lines that referenced the local binding's build artifacts:
- `build/out/`, `build/bin/`, `build/CMakeFiles/`, `build/CMakeCache.txt`, `build/cmake_install.cmake`, `build/Makefile.cmake`, `build/*.dir/`, `compile_commands.json`.

Keep `.claude` and `.cache/`.

- [ ] **Step 3: Verify build dir is otherwise empty**

```sh
ls build/ 2>&1
```

Should output `ls: build/: No such file or directory` (or be entirely empty). If anything remains, decide case-by-case whether to keep.

- [ ] **Step 4: Commit**

```sh
git add -A
git commit -m "strip local mongo binding; upstream flowwing now ships it"
```

NO `Co-Authored-By:` trailer.

---

### Task B2: Add MONGO_URI env-var helper in `server.fg`

**Files:**
- Modify: `server.fg`

- [ ] **Step 1: Find the Flow-Wing env-var API**

Check Flow-Wing's stdlib for an env API: `bring sys` likely has it. Run on `/Users/apple/code/per/Flow-Wing`:

```sh
grep -rn "sys::env\|sys::getenv\|getEnv" /Users/apple/code/per/Flow-Wing/fw-modules/ | head -5
```

If sys has `sys::getEnv(name)` or similar, use it. If not, fall back to reading from a `.env` file via `file::readText`.

- [ ] **Step 2: Add the helper to `server.fg`**

Near the top of `fg_main()`, before the `app.listen(8080)` call:

```flow-wing
    var mongoUri: str = sys::getEnv("MONGO_URI")
    if mongoUri == "" {
        mongoUri = "mongodb://127.0.0.1:27017"
        io::printLogln("MONGO_URI not set, falling back to local mongod", "yellow")
    }
```

(Adapt to whatever the actual sys API is named.)

- [ ] **Step 3: Open a global mongo client + the events collection at server start**

```flow-wing
    bring mongo

    var mc: mongo::Client = new mongo::Client(mongoUri)
    if !mc.isOk() {
        io::printErrorLogln("mongo connect failed: " + mongo::lastError(), "red")
        return :
    }
    var dbName: str = "portfolio"
    var collName: str = "events"
    var events: mongo::Collection = mc.getCollection(dbName, collName)
    io::printLogln("mongo connected", "green")
```

Place this AFTER the existing port-bind check, BEFORE the `while true` request loop. `mc` and `events` must be visible to the request loop — declare them in `fg_main`'s outer scope.

- [ ] **Step 4: Add `bring mongo` and `bring sys` at the file top**

Mirror existing `bring` placement (server.fg currently has `bring vortex / file / text / io / Err`).

- [ ] **Step 5: Compile and run**

```sh
flowwing server.fg -o /tmp/portfolio-server
/tmp/portfolio-server
```

Expected: prints `mongo connected` and continues to the request loop (server listening on :8080). Visit `http://127.0.0.1:8080` to confirm the existing routes still work.

If `MONGO_URI` isn't set, falls back to local. If set, uses that.

- [ ] **Step 6: Commit**

```sh
git add server.fg
git commit -m "server: open mongo client at startup, MONGO_URI env (local fallback)"
```

NO `Co-Authored-By:`.

---

### Task B3: Add `/track` POST route in `server.fg`

**Files:**
- Modify: `server.fg`

- [ ] **Step 1: Add the route**

Inside the `while true { ... }` loop, before the existing `else { 404 }` branch, add:

```flow-wing
        else if method == "POST" && path == "/track" {
            var body: str = req.getBody()
            if body == "" {
                res.status(400).header("Content-Type", "text/plain").send("empty body")
            } else {
                var ok: bool = events.insertOne(body)
                if ok {
                    res.status(204).send("")
                } else {
                    var emsg: str = mongo::lastError()
                    io::printErrorLogln("track insert failed: " + emsg, "red")
                    res.status(500).header("Content-Type", "text/plain").send("track failed")
                }
            }
        }
```

This expects the JS to POST raw JSON as the body. No content-type negotiation — keep simple.

- [ ] **Step 2: Verify request-body API**

The existing server.fg uses `req.getMethod()` and `req.getPath()`. Confirm `req.getBody()` exists in `vortex`. If the actual method is `req.body()` or `req.readBody()`, adjust.

If vortex doesn't expose a body-read at all in this version, that's a real blocker — REPORT BLOCKED. Look in `/Users/apple/code/per/Flow-Wing/fw-modules/vortex_module/vortex-module.fg` for the actual Request API surface.

- [ ] **Step 3: Compile and smoke-test**

```sh
flowwing server.fg -o /tmp/portfolio-server
/tmp/portfolio-server &
sleep 1
curl -X POST http://127.0.0.1:8080/track \
  -H 'Content-Type: application/json' \
  -d '{"type":"page_load","ts":1716500000,"page":"/"}'
kill %1
```

Expected: 204 No Content response, mongo collection `portfolio.events` gained one document. Verify:

```sh
mongosh --quiet --eval 'use portfolio; db.events.find({type:"page_load"}).limit(1).toArray()'
```

- [ ] **Step 4: Commit**

```sh
git add server.fg
git commit -m "server: /track POST route writes events to mongo"
```

---

### Task B4: Frontend instrumentation `assets/track.js`

**Files:**
- Create: `assets/track.js`
- Modify: `index.html` (add `<script src="/assets/track.js" defer></script>`)

- [ ] **Step 1: Write `assets/track.js`**

```js
// assets/track.js — minimal event tracker. Zero deps; queues + batches.
(function () {
  var SESSION_KEY = "fw_session_id";
  var ENDPOINT = "/track";

  function sessionId() {
    var s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = (crypto.randomUUID ? crypto.randomUUID() : "s_" + Date.now() + "_" + Math.random().toString(36).slice(2));
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  }

  function send(evt) {
    var payload = Object.assign({
      ts: Date.now(),
      session: sessionId(),
      page: location.pathname + location.search,
      ref: document.referrer || null,
      ua: navigator.userAgent,
    }, evt);
    try {
      var body = JSON.stringify(payload);
      // sendBeacon survives page unload, but only for small payloads
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, { method: "POST", body: body, headers: { "Content-Type": "application/json" }, keepalive: true });
      }
    } catch (e) { /* silent */ }
  }

  // 1) page_load
  send({ type: "page_load" });

  // 2) scroll depth (25/50/75/100)
  var sentDepths = {};
  function onScroll() {
    var docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
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

  // 3) CTA clicks — anything with [data-cta] OR an <a href="..."> 
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-cta], a[href]");
    if (!t) return;
    send({
      type: "cta_click",
      cta: t.getAttribute("data-cta") || t.textContent.trim().slice(0, 50),
      href: t.getAttribute("href") || null,
    });
  }, true);

  // 4) time-on-page at unload
  var loadAt = Date.now();
  window.addEventListener("pagehide", function () {
    send({ type: "page_exit", ms: Date.now() - loadAt });
  });
})();
```

- [ ] **Step 2: Wire it into `index.html`**

Add to `<head>` (defer so it doesn't block page render):
```html
<script src="/assets/track.js" defer></script>
```

- [ ] **Step 3: Verify**

```sh
flowwing server.fg -o /tmp/portfolio-server
/tmp/portfolio-server &
sleep 1
open http://127.0.0.1:8080  # opens in browser; scroll the page, click links
sleep 5
kill %1
mongosh --quiet --eval 'use portfolio; db.events.find().sort({ts:-1}).limit(10).toArray()' | head -30
```

Expected: a mix of `page_load`, `scroll` (depth 25/50/75/100 as you scroll), `cta_click`, `page_exit` events.

- [ ] **Step 4: Commit**

```sh
git add assets/track.js index.html
git commit -m "assets: add zero-dep event tracker (page_load/scroll/cta/exit)"
```

---

### Task B5: Add `/admin/<token>` route + dashboard

**Files:**
- Modify: `server.fg`
- Create: `assets/admin.html`
- Create: `assets/admin.js`

- [ ] **Step 1: Decide on the token**

The admin path is `/admin/<long-token>`. Pick a token like `a-Vh9P_z8Q-3xR2nMk7s` (24+ chars, URL-safe). Store it in the server via env var `ADMIN_TOKEN` (same pattern as `MONGO_URI`). For local dev, hardcode a fallback (`dev-admin-token`) in the env helper.

Add a constant near the top of `fg_main`:

```flow-wing
    var adminToken: str = sys::getEnv("ADMIN_TOKEN")
    if adminToken == "" {
        adminToken = "dev-admin-token"
        io::printLogln("ADMIN_TOKEN not set, using dev fallback", "yellow")
    }
    var adminPathPrefix: str = "/admin/" + adminToken
```

- [ ] **Step 2: Add the admin route**

Inside the request loop, BEFORE the `/track` route:

```flow-wing
        else if method == "GET" && path == adminPathPrefix {
            /; admin landing page
            var adminPath: str = CURRENT_DIR + "/assets/admin.html"
            var html: str, herr: Err::Result = file::readText(adminPath)
            if Err::isErr(herr) {
                res.status(500).send("admin page missing")
            } else {
                res.status(200).header("Content-Type", "text/html; charset=utf-8").send(html)
            }
        }
        else if method == "GET" && path == adminPathPrefix + "/events" {
            /; JSON feed of recent events
            var limitArg: int64 = 100
            var allFilter: str = "{}"
            var cur: mongo::Cursor = events.find(allFilter, limitArg)
            var s: str = cur.next()
            var arr: str = "["
            var first: bool = true
            while s != "" {
                if first { first = false } else { arr = arr + "," }
                arr = arr + s
                s = cur.next()
            }
            arr = arr + "]"
            cur.close()
            res.status(200).header("Content-Type", "application/json").send(arr)
        }
```

(Concatenating strings in a loop is O(N²) in Flow-Wing — fine for 100 events, would be a problem for 100k. Future optimization out of scope.)

- [ ] **Step 3: Write `assets/admin.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Admin · Portfolio Events</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, monospace; max-width: 1100px; margin: 2em auto; padding: 0 1em; background: #0b1320; color: #e3eaf2; }
    h1 { margin: 0 0 1em; font-size: 1.4em; }
    .controls { margin: 1em 0; }
    input, select { padding: 0.4em; background: #1a2440; border: 1px solid #2c3a5a; color: #e3eaf2; border-radius: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
    th, td { padding: 0.4em 0.6em; border-bottom: 1px solid #1a2440; text-align: left; }
    th { background: #11192c; position: sticky; top: 0; }
    tr:hover { background: #11192c; }
    .pill { display: inline-block; padding: 0.1em 0.5em; border-radius: 10px; background: #1a2440; font-size: 0.8em; }
    .pill.page_load { background: #1b3a2d; }
    .pill.scroll    { background: #3a2d1b; }
    .pill.cta_click { background: #2d1b3a; }
    .pill.page_exit { background: #3a1b1b; }
  </style>
</head>
<body>
  <h1>Portfolio · Events</h1>
  <div class="controls">
    <input id="filter" placeholder="filter type/page/cta (live)">
    <select id="typesel">
      <option value="">all types</option>
      <option value="page_load">page_load</option>
      <option value="scroll">scroll</option>
      <option value="cta_click">cta_click</option>
      <option value="page_exit">page_exit</option>
    </select>
    <button id="refresh">refresh</button>
    <span id="status"></span>
  </div>
  <table>
    <thead><tr><th>ts</th><th>type</th><th>session</th><th>page</th><th>detail</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <script src="/assets/admin.js" defer></script>
</body>
</html>
```

- [ ] **Step 4: Write `assets/admin.js`**

```js
// assets/admin.js — admin dashboard renderer
(function () {
  var rowsEl = document.getElementById("rows");
  var statusEl = document.getElementById("status");
  var filterEl = document.getElementById("filter");
  var typeSel = document.getElementById("typesel");
  var refreshBtn = document.getElementById("refresh");

  var all = [];

  function detail(e) {
    if (e.type === "scroll") return "depth " + e.depth + "%";
    if (e.type === "cta_click") return (e.cta || "?") + " → " + (e.href || "(no href)");
    if (e.type === "page_exit") return (e.ms || 0) + " ms";
    return e.ref ? ("ref " + e.ref) : "";
  }

  function tsfmt(ts) {
    var d = new Date(ts);
    return d.toLocaleString();
  }

  function render() {
    var q = (filterEl.value || "").toLowerCase();
    var t = typeSel.value;
    var html = "";
    var n = 0;
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (t && e.type !== t) continue;
      if (q && [e.type, e.page, e.cta, e.href].join(" ").toLowerCase().indexOf(q) < 0) continue;
      n++;
      html += "<tr><td>" + tsfmt(e.ts) + "</td>"
            + "<td><span class=\"pill " + e.type + "\">" + e.type + "</span></td>"
            + "<td>" + (e.session || "").slice(0, 8) + "</td>"
            + "<td>" + (e.page || "") + "</td>"
            + "<td>" + detail(e) + "</td></tr>";
    }
    rowsEl.innerHTML = html;
    statusEl.textContent = " · " + n + " events";
  }

  function load() {
    statusEl.textContent = " · loading...";
    fetch(location.pathname + "/events")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        // Mongo extended-JSON may wrap ts in {$numberLong} — flatten:
        all = j.map(function (e) {
          if (e.ts && typeof e.ts === "object" && e.ts.$numberLong) {
            e.ts = parseInt(e.ts.$numberLong, 10);
          }
          if (e._id && typeof e._id === "object" && e._id.$oid) {
            e._id = e._id.$oid;
          }
          return e;
        });
        // newest first
        all.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
        render();
      })
      .catch(function (err) {
        statusEl.textContent = " · error: " + err.message;
      });
  }

  filterEl.addEventListener("input", render);
  typeSel.addEventListener("change", render);
  refreshBtn.addEventListener("click", load);
  load();
})();
```

- [ ] **Step 5: Compile, run, manually verify**

```sh
flowwing server.fg -o /tmp/portfolio-server
/tmp/portfolio-server &
sleep 1
open "http://127.0.0.1:8080/admin/dev-admin-token"
# Click around the portfolio in another tab to generate events, then refresh.
kill %1
```

Expected: admin dashboard loads, shows the events table, filters work.

- [ ] **Step 6: Add `/track` and `/admin` to the asset MIME mapping in `server.fg`** if needed.

The existing `pathAsText.startsWith("/assets/")` branch handles MIME for asset files. `admin.html` and `admin.js` live under `/assets/`, so they should already work via that branch — no extra wiring needed.

- [ ] **Step 7: Commit**

```sh
git add server.fg assets/admin.html assets/admin.js
git commit -m "admin: hidden /admin/<token> dashboard for event analytics"
```

---

### Task B6: Add `data-cta` attributes to portfolio CTAs

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Find the existing CTAs**

```sh
grep -n -E 'href="(http|mailto|#)' index.html | head -20
```

- [ ] **Step 2: Annotate each meaningful CTA**

For each link/button that deserves tracking (GitHub, LinkedIn, email, "view project" buttons, REPL run button if it's a button), add `data-cta="<short_name>"` attribute. Example:

```html
<a href="https://github.com/kushagra1212" data-cta="github_profile">github</a>
<a href="mailto:kushagrarathore002@gmail.com" data-cta="email">email</a>
<button data-cta="repl_run" onclick="...">run</button>
```

The tracker already captures all `a[href]` clicks without `data-cta` (using text content as the label), but adding explicit `data-cta` gives cleaner names in the dashboard.

- [ ] **Step 3: Verify in browser**

Click each annotated CTA; check admin dashboard for matching `cta_click` events with the named `cta` field.

- [ ] **Step 4: Commit**

```sh
git add index.html
git commit -m "index: annotate CTAs with data-cta for tracker labels"
```

---

## PHASE C — MongoDB Atlas setup guide

### Task C1: Write `ATLAS-SETUP.md`

**Files:**
- Create: `ATLAS-SETUP.md` (at repo root)

- [ ] **Step 1: Draft the guide**

Cover, in order:

1. **Create the Atlas account** at `https://www.mongodb.com/cloud/atlas/register`. Choose "Build a database" → free shared tier (M0) → AWS / closest region to the deployment server.
2. **Database name + collection name:** `portfolio` / `events`. Auto-created on first insert; no schema setup needed.
3. **Network access:** "Add IP Address" → either `0.0.0.0/0` (anywhere, easiest) or restrict to the deployment server's IP if known. Show how to find the deployment IP via `curl ifconfig.me` on the server.
4. **Database user:** Atlas Security → Database Access → "Add New Database User". Set username (e.g. `portfolio_writer`), generate a strong password, role `readWrite` on `portfolio` database only (not admin/root — least-privilege). Save the password securely.
5. **Connection string:** Atlas → Cluster → Connect → "Drivers" → copy the URI. It looks like `mongodb+srv://<user>:<pw>@<cluster>.mongodb.net/?retryWrites=true&w=majority`.
   - **Important:** since Phase A built libmongoc with `ENABLE_SRV=OFF`, the `+srv` form will NOT resolve. Either:
     - Switch to the non-`+srv` form: `mongodb://<user>:<pw>@<cluster>-shard-00-00.mongodb.net:27017,<...>-shard-00-01.mongodb.net:27017,<...>-shard-00-02.mongodb.net:27017/?ssl=true&replicaSet=<replicaSet>&authSource=admin`. Atlas shows this form under "Connect" → "Shell" with the deprecated mongo shell URI option.
     - OR rebuild libmongoc with `ENABLE_SRV=ON` and a `c-ares` dep added to deps_builder. Document this as a future enhancement.
6. **Deploy on Linux:** the install script the user pasted runs an apt-installed `flowwing` inside a Docker container. The container needs `MONGO_URI` and `ADMIN_TOKEN` env vars set. Show how to add them to the `docker-compose.yml` `portfolio-app` service:
   ```yaml
   environment:
     - MONGO_URI=mongodb://user:pw@cluster-shard-00-00.mongodb.net:27017,.../?ssl=true&replicaSet=...&authSource=admin
     - ADMIN_TOKEN=<generated-long-token>
   ```
   Show how to generate the admin token: `openssl rand -base64 32 | tr -d '/+=' | head -c 32`.
7. **Indexes:** for query performance once events grow, create:
   ```js
   db.events.createIndex({ ts: -1 })
   db.events.createIndex({ type: 1, ts: -1 })
   db.events.createIndex({ session: 1, ts: -1 })
   ```
   Run these via Atlas's Data Explorer → Indexes tab, or via `mongosh "<atlas-uri>"`.
8. **Local fallback:** for mac development, the server falls back to `mongodb://127.0.0.1:27017` when `MONGO_URI` is empty. Show how to start local mongod (`brew services start mongodb-community`).

- [ ] **Step 2: Commit**

```sh
git add ATLAS-SETUP.md
git commit -m "docs: ATLAS-SETUP.md guide for production mongo provisioning"
```

---

## Done criteria

**Phase A (upstream Flow-Wing, no commits):**
- `make aot-release` builds with `flowwing_mongo` module integrated.
- `make run-aot-release FILE=tests/local/mongo_test.fg ARGS="--emit=exe"` ends with `mongo_test ok`.
- `flowwing --version` prints `1.0.5`.

**Phase B (portfolio repo, on `feat/mongo-atlas-tracking`):**
- Local proof-of-concept binding stripped.
- `server.fg` opens a mongo client at startup, exposes `/track` and `/admin/<token>` routes.
- `assets/track.js` fires events; admin dashboard renders them.
- Local smoke run shows events accumulate; admin dashboard shows them.

**Phase C:**
- `ATLAS-SETUP.md` exists and walks user through provisioning.
- User can complete the Atlas steps and set `MONGO_URI` + `ADMIN_TOKEN` in the deploy environment.

## Out of scope (future plans)

- Pagination on admin dashboard (currently caps at 100 events).
- Real-time event stream (currently poll-only via "refresh" button).
- Rate limiting / abuse protection on `/track`.
- Event schema validation server-side.
- Atlas `+srv` URI support (would require c-ares dep in upstream).
- Connection pool when vortex becomes multi-threaded.
- Contribute mongo_module CMake changes back upstream via a proper PR (user said they'll handle commit/PR at the end).
