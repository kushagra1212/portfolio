# mongo-Module.fg — Flow-Wing binding to libmongoc (v1, CRUD-lite)

Status: approved 2026-05-24
Owner: kushagra
Consumer: `server.fg` (portfolio analytics ingest)

## Goal

Add a MongoDB binding to Flow-Wing that lives **locally in this repo** (imported via `bring "mongo-Module.fg"`), wrapping the libmongoc C driver. Mirrors the shape of `fw-modules/raylib_module` (extern decls + C++ glue + CMake), scoped down for one repo and one use case.

## Non-goals (v1)

- Not contributed upstream to `fw-modules`.
- No tracking pipeline. The JS instrumentation, `/track` endpoint, event schema, and dashboards are a separate sub-project that consumes this binding once it lands.
- No auth helpers, TLS knobs, connection pool wrapper, retry/backoff layer, schema validation, or metrics hooks. URI carries auth + TLS; libmongoc retries by default.

## Architecture

```
server.fg                            consumer
  | bring "mongo-Module.fg"
mongo-Module.fg                      typed classes: MongoClient, MongoCollection, MongoCursor
  | fun _mongo_*(...) decl           Flow-Wing FFI declarations
libflowwing_mongo.a                  extern "C" glue (handle table + thread-local error)
  | libmongoc C API
libmongoc + libbson                  brew install mongo-c-driver
```

Three layers, three contracts:

1. **Consumer ↔ classes** — `.fg` callers only see `MongoClient` / `MongoCollection` / `MongoCursor`. Errors via `Err::Result`. Pattern matches `vortex::Server` in `server.fg`.
2. **Classes ↔ glue** — int64 handles for pointers; `const char*` for JSON + UTF-8 strings; `""` as cursor end-of-stream sentinel.
3. **Glue ↔ libmongoc** — native types, BSON via `bson_new_from_json` / `bson_as_relaxed_extended_json`.

## File layout

```
mongo-Module.fg              # public API (extern decls + classes)
src/mongo_binding.cpp        # extern "C" glue over libmongoc
src/mongo_binding.h          # forward decls
build/CMakeLists.txt         # builds libflowwing_mongo.a (libtool-merged on macOS)
build/Makefile               # `make lib`, `make run`, `make clean`
smoke-mongo.fg               # standalone smoke test (not part of server.fg)
```

## `mongo-Module.fg` — public API

### Extern declarations

```flow-wing
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
```

### Classes

```flow-wing
bring Err

class MongoClient {
    var _h: int64 = 0

    fun connect(self, uri: str) -> Err::Result {
        self._h = _mongo_client_new(uri)
        if self._h == 0 { return Err::new(_mongo_last_error()) }
        return Err::ok()
    }

    fun getCollection(self, db: str, coll: str) -> MongoCollection {
        var c: MongoCollection = new MongoCollection()
        c._h = _mongo_get_collection(self._h, db, coll)
        return c
    }

    fun close(self) -> nthg { _mongo_client_close(self._h) }
}

class MongoCollection {
    var _h: int64 = 0

    fun insertOne(self, json: str) -> Err::Result {
        if _mongo_insert_one(self._h, json) == 0 { return Err::new(_mongo_last_error()) }
        return Err::ok()
    }
    fun insertMany(self, jsonArr: str) -> Err::Result {
        if _mongo_insert_many(self._h, jsonArr) == 0 { return Err::new(_mongo_last_error()) }
        return Err::ok()
    }

    fun findOne(self, filterJson: str) -> str, Err::Result {
        var s: str = _mongo_find_one(self._h, filterJson)
        if s == "" { return "", Err::new(_mongo_last_error()) }
        return s, Err::ok()
    }

    fun find(self, filterJson: str, limit: int64) -> MongoCursor {
        var cur: MongoCursor = new MongoCursor()
        cur._h = _mongo_find(self._h, filterJson, limit)
        return cur
    }

    fun count(self, filterJson: str) -> int64 { return _mongo_count(self._h, filterJson) }
}

class MongoCursor {
    var _h: int64 = 0
    fun next(self) -> str { return _mongo_cursor_next(self._h) }   /; "" = done
    fun close(self) -> nthg { _mongo_cursor_close(self._h) }
}
```

### Usage from `server.fg`

```flow-wing
bring "mongo-Module.fg"

var mc: MongoClient = new MongoClient()
var err: Err::Result = mc.connect("mongodb+srv://user:pw@cluster/...")
if Err::isErr(err) { /* log and bail */ }
var events: MongoCollection = mc.getCollection("portfolio", "events")
events.insertOne("{\"type\":\"page_load\",\"ts\":1716500000}")
```

## `mongo_binding.cpp` — glue contract

### Handle table

```cpp
#define MAX_CLIENTS     64
#define MAX_COLLECTIONS 256
#define MAX_CURSORS     256
static mongoc_client_t*     _clients[MAX_CLIENTS]         = {nullptr};
static mongoc_collection_t* _collections[MAX_COLLECTIONS] = {nullptr};
static mongoc_cursor_t*     _cursors[MAX_CURSORS]         = {nullptr};
```

- Handles are 1..N; **0 means invalid/error**.
- Allocate via free-slot linear scan (small N; cheap).
- Close nulls the slot.
- Bounded arrays match the raylib_module `_flowwing_textures[]` pattern.

### Init / cleanup

`mongoc_init()` is called lazily on first `_mongo_client_new`, guarded by a `static std::once_flag`. No process-exit cleanup: libmongoc tolerates exit-time leaks and process death frees everything.

### String ownership

- **Incoming `const char*`** (uri, db, coll, json): caller owns the buffer; glue copies into BSON / libmongoc structures before returning.
- **Outgoing `const char*`** (findOne result, cursor next, last_error): glue owns a **thread-local `std::string` per return slot**; pointer is valid until the next call on the same thread that returns that slot. No caller-side free.

### Thread-local error

```cpp
thread_local std::string _last_error;
extern "C" const char* _mongo_last_error() { return _last_error.c_str(); }
```

Every fallible function clears `_last_error` on success, sets it from `bson_error_t.message` on failure.

### Extern signatures

```cpp
extern "C" {
  int64_t  _mongo_client_new(const char* uri);
  void     _mongo_client_close(int64_t h);
  int64_t  _mongo_get_collection(int64_t client, const char* db, const char* coll);
  int64_t  _mongo_insert_one(int64_t coll, const char* json);
  int64_t  _mongo_insert_many(int64_t coll, const char* jsonArray);
  const char* _mongo_find_one(int64_t coll, const char* filterJson);
  int64_t  _mongo_find(int64_t coll, const char* filterJson, int64_t limit);
  int64_t  _mongo_count(int64_t coll, const char* filterJson);
  const char* _mongo_cursor_next(int64_t cur);
  void     _mongo_cursor_close(int64_t cur);
  const char* _mongo_last_error();
}
```

### JSON ↔ BSON

- **Writes:** `bson_new_from_json((const uint8_t*)json, -1, &err)` → insert → `bson_destroy`. On parse failure, set `_last_error` and return 0.
- **Reads:** `bson_as_relaxed_extended_json(doc, NULL)` → copy into thread-local string → `bson_free` the libbson buffer. Relaxed (not canonical) extended JSON keeps numbers plain — friendlier for JS-side consumers.

### Concurrency note

`mongoc_client_t` is not thread-safe per libmongoc docs. `vortex` in `server.fg` accepts in a single-threaded loop, so a single client is safe for v1. Future move to `mongoc_client_pool_t*` requires no `.fg` API change — same handle type.

## Build & run

### One-time deps

```sh
brew install mongo-c-driver cmake pkg-config
```

### `build/CMakeLists.txt`

```cmake
cmake_minimum_required(VERSION 3.15)
project(flowwing_mongo CXX)
set(CMAKE_CXX_STANDARD 17)

find_package(PkgConfig REQUIRED)
pkg_check_modules(MONGOC REQUIRED libmongoc-1.0)
pkg_check_modules(BSON   REQUIRED libbson-1.0)

add_library(flowwing_mongo STATIC ../src/mongo_binding.cpp)
target_include_directories(flowwing_mongo PUBLIC
  ${MONGOC_INCLUDE_DIRS} ${BSON_INCLUDE_DIRS})
target_link_libraries(flowwing_mongo PUBLIC
  ${MONGOC_LIBRARIES} ${BSON_LIBRARIES})

# macOS: merge libmongoc + libbson static archives into ours, if available.
# Falls back to dynamic linking on the flowwing line if .a files don't ship.
add_custom_command(TARGET flowwing_mongo POST_BUILD
  COMMAND libtool -static -o $<TARGET_FILE:flowwing_mongo>
    $<TARGET_FILE:flowwing_mongo>
    ${MONGOC_LIBDIR}/libmongoc-1.0.a
    ${MONGOC_LIBDIR}/libbson-1.0.a)
```

### `build/Makefile`

```make
.PHONY: lib run clean
lib:
	cmake -S . -B out && cmake --build out
run: lib
	cd .. && flowwing-jit server.fg -L./build/out -l flowwing_mongo
clean:
	rm -rf out
```

### Invocation

`cd build && make run`. JIT picks up the static lib via `-L./build/out -l flowwing_mongo`. Static merge means no `DYLD_LIBRARY_PATH`.

## Testing — `smoke-mongo.fg`

Standalone, not wired into `server.fg`. Catches 90% of bring-up bugs.

```flow-wing
bring "mongo-Module.fg"
bring io
bring Err

fun fg_main() -> nthg {
    var mc: MongoClient = new MongoClient()
    var err: Err::Result = mc.connect("mongodb://127.0.0.1:27017")
    if Err::isErr(err) { io::printErrorLogln("connect failed", "red"); return : }

    var coll: MongoCollection = mc.getCollection("fw_smoke", "events")
    err = coll.insertOne("{\"k\":\"smoke\",\"n\":1}")
    if Err::isErr(err) { io::printErrorLogln("insert failed", "red"); return : }

    var n: int64 = coll.count("{}")
    io::printLogln("docs: " + n, "cyan")     /; expect >= 1

    var cur: MongoCursor = coll.find("{}", 5)
    var s: str = cur.next()
    while s != "" {
        io::printLogln(s, "white")
        s = cur.next()
    }
    cur.close()
    mc.close()
}
fg_main()
```

Run: local `mongod` via `brew services start mongodb-community` or any reachable URI. Pass on first try = binding works.

## Risks

- **Static-merge availability.** Recent brew `mongo-c-driver` builds may ship dylib-only. If `libmongoc-1.0.a` / `libbson-1.0.a` are missing, the `libtool` step fails; fall back to dynamic link on the flowwing line (`-lmongoc-1.0 -lbson-1.0` plus rpath). Detect in `make lib`, pick the right path.
- **Flow-Wing tuple-return syntax.** `findOne` returns `(str, Err::Result)`. The `server.fg` pattern `var content: str, rerr: Err::Result = file::readText(...)` suggests this works; if not, drop to a `last_error()`-style `Err::Result findOne(...)` + `str findOneResult()` split.
- **Class-method `self` syntax.** Drawn from the `vortex::Server` usage in `server.fg`. If the actual Flow-Wing class syntax differs (e.g., no `self` param), adjust to whatever the language requires — the boundary semantics don't change.
- **macOS-only.** v1 CMake targets macOS (matches the current dev machine). Linux/Windows build paths follow the raylib_module pattern but are out of scope.

## After this lands

Separate sub-project (own spec) — tracking pipeline:
1. JS instrumentation in `assets/` (page_load, scroll depth, CTA clicks, session id).
2. `POST /track` route in `server.fg` consuming `mongo-Module.fg`.
3. Event schema + indexes (created manually in Mongo).
4. Read endpoint or external dashboard.
