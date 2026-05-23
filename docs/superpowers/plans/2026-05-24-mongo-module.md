# mongo-Module.fg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local Flow-Wing binding to libmongoc (`mongo-Module.fg`) in this repo, imported via `bring 'mongo-Module.fg'`, exposing CRUD-lite Mongo to `server.fg`.

**Architecture:** Three layers — typed `.fg` classes → `fun _mongo_*(...) decl` FFI declarations → `extern "C"` C++ glue over libmongoc, packaged as `libflowwing_mongo.a` and linked at `flowwing` AOT-compile time via `-L./build/out -l flowwing_mongo`. Handle table maps int64 ↔ `mongoc_client_t*`/`mongoc_collection_t*`/`mongoc_cursor_t*`. JSON in for writes, opaque cursor handle out for reads. Mirrors `fw-modules/raylib_module` shape.

**Tech Stack:** C++17, libmongoc + libbson (`brew install mongo-c-driver`), CMake 3.15+, GNU make, Flow-Wing 1.0.4 (`flowwing` AOT compiler — produces a native binary; smoke test is the compiled binary, not interpreter mode).

**Testing approach (honest):** There is no Flow-Wing unit-test framework visible in this repo or in fw-modules. Each phase adds one extern, extends `smoke-mongo.fg` with one assertion, and is verified by `make smoke` — which AOT-compiles `smoke-mongo.fg` to `build/bin/smoke-mongo` via `flowwing` and then executes the resulting binary. Runs against a local `mongod`. The smoke test grows incrementally; passing it is the gate. No mocked DB — this is an FFI binding and mocks would hide ABI/lifetime bugs.

**Prerequisites verified before starting:**
- `which flowwing` returns `/opt/homebrew/bin/flowwing` (already confirmed).
- `brew list mongo-c-driver` succeeds — if not, run `brew install mongo-c-driver cmake pkg-config`.
- `brew services start mongodb-community` is running locally (or any reachable `mongodb://` URI is in `$MONGO_URI`).
- Reference: spec at `docs/superpowers/specs/2026-05-24-mongo-module-design.md`.
- Reference: raylib_module pattern at `https://github.com/kushagra1212/Flow-Wing/tree/main/fw-modules/raylib_module` — `raylib-module.fg` shows exact `decl` syntax, `libflowwing_raylib.cpp` shows handle-table pattern.

---

## Task 1: Build skeleton — empty static lib compiles and links

**Files:**
- Create: `src/mongo_binding.h`
- Create: `src/mongo_binding.cpp`
- Create: `build/CMakeLists.txt`
- Create: `build/Makefile`
- Create: `.gitignore` modification

- [ ] **Step 1: Write the minimal `src/mongo_binding.h`**

```cpp
// src/mongo_binding.h
#pragma once
#include <cstdint>

extern "C" {
const char* _mongo_last_error();
}
```

- [ ] **Step 2: Write the minimal `src/mongo_binding.cpp`**

```cpp
// src/mongo_binding.cpp
#include "mongo_binding.h"
#include <string>

thread_local std::string _last_error;

extern "C" {
const char* _mongo_last_error() { return _last_error.c_str(); }
}
```

- [ ] **Step 3: Write `build/CMakeLists.txt`**

```cmake
cmake_minimum_required(VERSION 3.15)
project(flowwing_mongo CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(PkgConfig REQUIRED)
pkg_check_modules(MONGOC REQUIRED libmongoc-1.0)
pkg_check_modules(BSON   REQUIRED libbson-1.0)

add_library(flowwing_mongo STATIC ../src/mongo_binding.cpp)
target_include_directories(flowwing_mongo PUBLIC
  ${MONGOC_INCLUDE_DIRS} ${BSON_INCLUDE_DIRS} ../src)
target_link_libraries(flowwing_mongo PUBLIC
  ${MONGOC_LIBRARIES} ${BSON_LIBRARIES})
```

(Note: the libtool-static-merge step is deferred to Task 11 once everything works — start with the simpler dynamic-link path so build failures point at code, not packaging.)

- [ ] **Step 4: Write `build/Makefile`**

```make
PKG_CONFIG_PATH ?= $(shell brew --prefix mongo-c-driver)/lib/pkgconfig
export PKG_CONFIG_PATH

REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)
BIN_DIR := $(REPO_ROOT)/build/bin

.PHONY: lib server smoke-bin run smoke clean
lib:
	cmake -S . -B out && cmake --build out

server: lib
	mkdir -p $(BIN_DIR)
	cd $(REPO_ROOT) && flowwing server.fg -o $(BIN_DIR)/server -L./build/out -l flowwing_mongo

run: server
	$(BIN_DIR)/server

smoke-bin: lib
	mkdir -p $(BIN_DIR)
	cd $(REPO_ROOT) && flowwing smoke-mongo.fg -o $(BIN_DIR)/smoke-mongo -L./build/out -l flowwing_mongo

smoke: smoke-bin
	$(BIN_DIR)/smoke-mongo

clean:
	rm -rf out bin
```

(AOT two-phase: `flowwing` produces a binary in `build/bin/`, then `run`/`smoke` invokes it. Task 1 also has explicit `.gitignore` entries for `build/bin/` etc.)

- [ ] **Step 5: Update `.gitignore`**

Append to `.gitignore`:

```
build/out/
```

- [ ] **Step 6: Build it**

Run:
```sh
cd build && make lib
```

Expected: `cmake` discovers `libmongoc-1.0` and `libbson-1.0` via pkg-config, produces `build/out/libflowwing_mongo.a`. No warnings about missing symbols (we have none yet).

If pkg-config can't find libmongoc, stop and run `brew install mongo-c-driver pkg-config`, then `export PKG_CONFIG_PATH="$(brew --prefix)/lib/pkgconfig:$PKG_CONFIG_PATH"`.

- [ ] **Step 7: Verify the artifact**

Run:
```sh
ls -la build/out/libflowwing_mongo.a && nm build/out/libflowwing_mongo.a | grep _mongo_last_error
```

Expected: file exists, `_mongo_last_error` appears as a defined `T` symbol.

- [ ] **Step 8: Commit**

```sh
git add src/mongo_binding.h src/mongo_binding.cpp build/CMakeLists.txt build/Makefile .gitignore
git commit -m "scaffold libflowwing_mongo build (empty static lib)"
```

---

## Task 2: Client lifecycle — `_mongo_client_new` / `_mongo_client_close`

**Files:**
- Modify: `src/mongo_binding.h`
- Modify: `src/mongo_binding.cpp`
- Create: `smoke-mongo.fg`

- [ ] **Step 1: Extend `src/mongo_binding.h`**

Replace the file with:

```cpp
// src/mongo_binding.h
#pragma once
#include <cstdint>

extern "C" {
int64_t  _mongo_client_new(const char* uri);
void     _mongo_client_close(int64_t h);
const char* _mongo_last_error();
}
```

- [ ] **Step 2: Extend `src/mongo_binding.cpp`**

Replace the file with:

```cpp
// src/mongo_binding.cpp
#include "mongo_binding.h"
#include <mongoc/mongoc.h>
#include <mutex>
#include <string>

#define MAX_CLIENTS 64
static mongoc_client_t* _clients[MAX_CLIENTS] = {nullptr};

thread_local std::string _last_error;

static std::once_flag _init_flag;
static void _ensure_init() {
    std::call_once(_init_flag, []() { mongoc_init(); });
}

static int64_t _alloc_client_slot() {
    for (int64_t i = 1; i < MAX_CLIENTS; ++i) {
        if (_clients[i] == nullptr) return i;
    }
    return 0;
}

extern "C" {

int64_t _mongo_client_new(const char* uri) {
    _ensure_init();
    _last_error.clear();
    if (uri == nullptr || *uri == '\0') {
        _last_error = "mongo: empty uri";
        return 0;
    }
    bson_error_t err;
    mongoc_uri_t* parsed = mongoc_uri_new_with_error(uri, &err);
    if (parsed == nullptr) {
        _last_error = err.message;
        return 0;
    }
    mongoc_client_t* client = mongoc_client_new_from_uri(parsed);
    mongoc_uri_destroy(parsed);
    if (client == nullptr) {
        _last_error = "mongo: client construction failed";
        return 0;
    }
    int64_t h = _alloc_client_slot();
    if (h == 0) {
        mongoc_client_destroy(client);
        _last_error = "mongo: client handle table full";
        return 0;
    }
    _clients[h] = client;
    return h;
}

void _mongo_client_close(int64_t h) {
    if (h <= 0 || h >= MAX_CLIENTS) return;
    if (_clients[h] != nullptr) {
        mongoc_client_destroy(_clients[h]);
        _clients[h] = nullptr;
    }
}

const char* _mongo_last_error() { return _last_error.c_str(); }

} // extern "C"
```

- [ ] **Step 3: Build**

Run:
```sh
cd build && make clean && make lib
```

Expected: builds clean, no undefined-symbol warnings.

- [ ] **Step 4: Write `smoke-mongo.fg` (v0 — connect only)**

Path: repo root.

```flow-wing
/; smoke-mongo.fg — incremental smoke test for mongo-Module.fg
/; Runs against MONGO_URI env or mongodb://127.0.0.1:27017 default.

bring io
bring Err

fun _mongo_client_new(uri: as str) -> as int64 decl
fun _mongo_client_close(h: as int64) -> as nthg decl
fun _mongo_last_error() -> as str decl

fun fg_main() -> nthg {
    var uri: str = "mongodb://127.0.0.1:27017"
    var h: int64 = _mongo_client_new(uri)
    if h == 0 {
        io::printErrorLogln("connect failed: " + _mongo_last_error(), "red")
        return :
    }
    io::printLogln("connected: handle=" + h, "cyan")
    _mongo_client_close(h)
    io::printLogln("closed cleanly", "cyan")
}

fg_main()
```

(Externs are declared inline at this phase — moved into `mongo-Module.fg` in Task 9.)

- [ ] **Step 5: Run smoke against local mongod**

Run:
```sh
cd build && make smoke
```

Expected stdout:
```
connected: handle=1
closed cleanly
```

If you see `connect failed: No suitable servers found` — `mongod` isn't running. Start it: `brew services start mongodb-community`.

- [ ] **Step 6: Run smoke with a deliberately bad URI to test the error path**

Edit `smoke-mongo.fg` line 12 temporarily: `var uri: str = "not-a-uri"`. Run `make smoke` again.

Expected stdout contains: `connect failed: Invalid URI scheme` (or similar libmongoc message).

Revert the line.

- [ ] **Step 7: Commit**

```sh
git add src/mongo_binding.h src/mongo_binding.cpp smoke-mongo.fg
git commit -m "mongo_binding: client_new/close + smoke v0"
```

---

## Task 3: Collection handle — `_mongo_get_collection`

**Files:**
- Modify: `src/mongo_binding.h`
- Modify: `src/mongo_binding.cpp`
- Modify: `smoke-mongo.fg`

- [ ] **Step 1: Add decl to `src/mongo_binding.h`**

Insert before `_mongo_last_error()`:

```cpp
int64_t _mongo_get_collection(int64_t client, const char* db, const char* coll);
```

- [ ] **Step 2: Add collection table to `src/mongo_binding.cpp`**

After `#define MAX_CLIENTS 64`, add:

```cpp
#define MAX_COLLECTIONS 256
static mongoc_collection_t* _collections[MAX_COLLECTIONS] = {nullptr};

static int64_t _alloc_collection_slot() {
    for (int64_t i = 1; i < MAX_COLLECTIONS; ++i) {
        if (_collections[i] == nullptr) return i;
    }
    return 0;
}
```

- [ ] **Step 3: Add the function inside the `extern "C"` block**

Before the closing `}` of `extern "C"`:

```cpp
int64_t _mongo_get_collection(int64_t client_h, const char* db, const char* coll) {
    _last_error.clear();
    if (client_h <= 0 || client_h >= MAX_CLIENTS || _clients[client_h] == nullptr) {
        _last_error = "mongo: invalid client handle";
        return 0;
    }
    if (db == nullptr || coll == nullptr) {
        _last_error = "mongo: null db or collection name";
        return 0;
    }
    mongoc_collection_t* c = mongoc_client_get_collection(_clients[client_h], db, coll);
    if (c == nullptr) {
        _last_error = "mongo: get_collection returned null";
        return 0;
    }
    int64_t h = _alloc_collection_slot();
    if (h == 0) {
        mongoc_collection_destroy(c);
        _last_error = "mongo: collection handle table full";
        return 0;
    }
    _collections[h] = c;
    return h;
}
```

(No matching `_mongo_collection_close` extern in v1 — collection handles are released implicitly when `_mongo_client_close` is called; we'll free them in Task 8's cleanup pass.)

- [ ] **Step 4: Build**

```sh
cd build && make lib
```

Expected: clean build.

- [ ] **Step 5: Extend `smoke-mongo.fg`**

Add decl with the other `decl` lines:

```flow-wing
fun _mongo_get_collection(client: as int64, db: as str, coll: as str) -> as int64 decl
```

In `fg_main`, after the `connected:` log, before `_mongo_client_close(h)`:

```flow-wing
    var coll: int64 = _mongo_get_collection(h, "fw_smoke", "events")
    if coll == 0 {
        io::printErrorLogln("get_collection failed: " + _mongo_last_error(), "red")
        _mongo_client_close(h)
        return :
    }
    io::printLogln("collection handle=" + coll, "cyan")
```

- [ ] **Step 6: Run smoke**

```sh
cd build && make smoke
```

Expected stdout includes:
```
connected: handle=1
collection handle=1
closed cleanly
```

- [ ] **Step 7: Commit**

```sh
git add src/mongo_binding.h src/mongo_binding.cpp smoke-mongo.fg
git commit -m "mongo_binding: get_collection"
```

---

## Task 4: Writes — `_mongo_insert_one`

**Files:**
- Modify: `src/mongo_binding.h`
- Modify: `src/mongo_binding.cpp`
- Modify: `smoke-mongo.fg`

- [ ] **Step 1: Add decl to `src/mongo_binding.h`**

Inside `extern "C" { ... }`:

```cpp
int64_t _mongo_insert_one(int64_t coll, const char* json);
```

- [ ] **Step 2: Implement in `src/mongo_binding.cpp`**

Inside `extern "C" { ... }`:

```cpp
int64_t _mongo_insert_one(int64_t coll_h, const char* json) {
    _last_error.clear();
    if (coll_h <= 0 || coll_h >= MAX_COLLECTIONS || _collections[coll_h] == nullptr) {
        _last_error = "mongo: invalid collection handle";
        return 0;
    }
    if (json == nullptr) {
        _last_error = "mongo: null json";
        return 0;
    }
    bson_error_t err;
    bson_t* doc = bson_new_from_json(reinterpret_cast<const uint8_t*>(json), -1, &err);
    if (doc == nullptr) {
        _last_error = std::string("mongo: bad json: ") + err.message;
        return 0;
    }
    bool ok = mongoc_collection_insert_one(_collections[coll_h], doc, nullptr, nullptr, &err);
    bson_destroy(doc);
    if (!ok) {
        _last_error = err.message;
        return 0;
    }
    return 1;
}
```

- [ ] **Step 3: Build**

```sh
cd build && make lib
```

Expected: clean.

- [ ] **Step 4: Extend `smoke-mongo.fg`**

Add decl:

```flow-wing
fun _mongo_insert_one(coll: as int64, json: as str) -> as int64 decl
```

In `fg_main`, after the `collection handle=` log:

```flow-wing
    var ok: int64 = _mongo_insert_one(coll, "{\"k\":\"smoke\",\"n\":1}")
    if ok == 0 {
        io::printErrorLogln("insert_one failed: " + _mongo_last_error(), "red")
        _mongo_client_close(h)
        return :
    }
    io::printLogln("insert_one ok", "cyan")
```

- [ ] **Step 5: Run smoke**

```sh
cd build && make smoke
```

Expected stdout includes `insert_one ok`.

- [ ] **Step 6: Verify in mongo shell**

```sh
mongosh --eval 'use fw_smoke; db.events.countDocuments({k:"smoke"})'
```

Expected: a number `>= 1`.

- [ ] **Step 7: Test the bad-json path**

Temporarily change the call in `smoke-mongo.fg` to `_mongo_insert_one(coll, "{not json")`. Run `make smoke`. Expected stdout contains `insert_one failed: mongo: bad json: ...`. Revert.

- [ ] **Step 8: Commit**

```sh
git add src/mongo_binding.h src/mongo_binding.cpp smoke-mongo.fg
git commit -m "mongo_binding: insert_one"
```

---

## Task 5: Bulk writes — `_mongo_insert_many`

**Files:**
- Modify: `src/mongo_binding.h`
- Modify: `src/mongo_binding.cpp`
- Modify: `smoke-mongo.fg`

- [ ] **Step 1: Add decl to `src/mongo_binding.h`**

```cpp
int64_t _mongo_insert_many(int64_t coll, const char* jsonArray);
```

- [ ] **Step 2: Implement in `src/mongo_binding.cpp`**

```cpp
int64_t _mongo_insert_many(int64_t coll_h, const char* jsonArray) {
    _last_error.clear();
    if (coll_h <= 0 || coll_h >= MAX_COLLECTIONS || _collections[coll_h] == nullptr) {
        _last_error = "mongo: invalid collection handle";
        return 0;
    }
    if (jsonArray == nullptr) {
        _last_error = "mongo: null jsonArray";
        return 0;
    }
    bson_error_t err;
    bson_t* arr = bson_new_from_json(reinterpret_cast<const uint8_t*>(jsonArray), -1, &err);
    if (arr == nullptr) {
        _last_error = std::string("mongo: bad json array: ") + err.message;
        return 0;
    }
    // Walk array elements; each must be a sub-document.
    std::vector<bson_t*> docs;
    bson_iter_t it;
    if (!bson_iter_init(&it, arr)) {
        bson_destroy(arr);
        _last_error = "mongo: bson_iter_init failed";
        return 0;
    }
    while (bson_iter_next(&it)) {
        if (!BSON_ITER_HOLDS_DOCUMENT(&it)) {
            for (auto* d : docs) bson_destroy(d);
            bson_destroy(arr);
            _last_error = "mongo: array element is not a document";
            return 0;
        }
        const uint8_t* buf = nullptr;
        uint32_t len = 0;
        bson_iter_document(&it, &len, &buf);
        docs.push_back(bson_new_from_data(buf, len));
    }
    std::vector<const bson_t*> ptrs;
    ptrs.reserve(docs.size());
    for (auto* d : docs) ptrs.push_back(d);

    bool ok = mongoc_collection_insert_many(
        _collections[coll_h], ptrs.data(), ptrs.size(), nullptr, nullptr, &err);

    for (auto* d : docs) bson_destroy(d);
    bson_destroy(arr);

    if (!ok) {
        _last_error = err.message;
        return 0;
    }
    return 1;
}
```

Add `#include <vector>` at the top of `mongo_binding.cpp` if not already present.

- [ ] **Step 3: Build**

```sh
cd build && make lib
```

- [ ] **Step 4: Extend `smoke-mongo.fg`**

Add decl + call after the `insert_one ok` log:

```flow-wing
fun _mongo_insert_many(coll: as int64, jsonArr: as str) -> as int64 decl
```

```flow-wing
    var manyOk: int64 = _mongo_insert_many(coll, "[{\"k\":\"smoke\",\"n\":2},{\"k\":\"smoke\",\"n\":3}]")
    if manyOk == 0 {
        io::printErrorLogln("insert_many failed: " + _mongo_last_error(), "red")
        _mongo_client_close(h)
        return :
    }
    io::printLogln("insert_many ok", "cyan")
```

- [ ] **Step 5: Run smoke**

```sh
cd build && make smoke
```

Expected stdout includes `insert_many ok`.

- [ ] **Step 6: Commit**

```sh
git add src/mongo_binding.h src/mongo_binding.cpp smoke-mongo.fg
git commit -m "mongo_binding: insert_many"
```

---

## Task 6: Count — `_mongo_count`

**Files:**
- Modify: `src/mongo_binding.h`
- Modify: `src/mongo_binding.cpp`
- Modify: `smoke-mongo.fg`

- [ ] **Step 1: Add decl**

In `src/mongo_binding.h`:

```cpp
int64_t _mongo_count(int64_t coll, const char* filterJson);
```

- [ ] **Step 2: Implement**

In `src/mongo_binding.cpp`:

```cpp
int64_t _mongo_count(int64_t coll_h, const char* filterJson) {
    _last_error.clear();
    if (coll_h <= 0 || coll_h >= MAX_COLLECTIONS || _collections[coll_h] == nullptr) {
        _last_error = "mongo: invalid collection handle";
        return -1;
    }
    const char* fj = (filterJson == nullptr || *filterJson == '\0') ? "{}" : filterJson;
    bson_error_t err;
    bson_t* filter = bson_new_from_json(reinterpret_cast<const uint8_t*>(fj), -1, &err);
    if (filter == nullptr) {
        _last_error = std::string("mongo: bad filter json: ") + err.message;
        return -1;
    }
    int64_t n = mongoc_collection_count_documents(
        _collections[coll_h], filter, nullptr, nullptr, nullptr, &err);
    bson_destroy(filter);
    if (n < 0) {
        _last_error = err.message;
        return -1;
    }
    return n;
}
```

Note: returns -1 on error (not 0), because 0 is a valid count.

- [ ] **Step 3: Build**

```sh
cd build && make lib
```

- [ ] **Step 4: Extend `smoke-mongo.fg`**

Decl:

```flow-wing
fun _mongo_count(coll: as int64, filterJson: as str) -> as int64 decl
```

After `insert_many ok` log:

```flow-wing
    var n: int64 = _mongo_count(coll, "{\"k\":\"smoke\"}")
    io::printLogln("count k=smoke: " + n, "cyan")
```

- [ ] **Step 5: Run smoke**

```sh
cd build && make smoke
```

Expected: `count k=smoke: <N>` where N grows each run (we never delete). Confirm N >= 3 on the first post-many run.

- [ ] **Step 6: Commit**

```sh
git add src/mongo_binding.h src/mongo_binding.cpp smoke-mongo.fg
git commit -m "mongo_binding: count_documents"
```

---

## Task 7: Single read — `_mongo_find_one`

**Files:**
- Modify: `src/mongo_binding.h`
- Modify: `src/mongo_binding.cpp`
- Modify: `smoke-mongo.fg`

- [ ] **Step 1: Add decl**

```cpp
const char* _mongo_find_one(int64_t coll, const char* filterJson);
```

- [ ] **Step 2: Implement**

Add a second thread-local string for read results (keeps `_last_error` independent so callers can read both):

```cpp
thread_local std::string _find_one_result;
```

(Put it next to `_last_error`.)

Inside `extern "C"`:

```cpp
const char* _mongo_find_one(int64_t coll_h, const char* filterJson) {
    _last_error.clear();
    _find_one_result.clear();
    if (coll_h <= 0 || coll_h >= MAX_COLLECTIONS || _collections[coll_h] == nullptr) {
        _last_error = "mongo: invalid collection handle";
        return _find_one_result.c_str();
    }
    const char* fj = (filterJson == nullptr || *filterJson == '\0') ? "{}" : filterJson;
    bson_error_t err;
    bson_t* filter = bson_new_from_json(reinterpret_cast<const uint8_t*>(fj), -1, &err);
    if (filter == nullptr) {
        _last_error = std::string("mongo: bad filter json: ") + err.message;
        return _find_one_result.c_str();
    }
    bson_t opts = BSON_INITIALIZER;
    BSON_APPEND_INT64(&opts, "limit", 1);
    mongoc_cursor_t* cur = mongoc_collection_find_with_opts(
        _collections[coll_h], filter, &opts, nullptr);
    bson_destroy(filter);
    bson_destroy(&opts);

    const bson_t* doc = nullptr;
    if (mongoc_cursor_next(cur, &doc)) {
        char* json = bson_as_relaxed_extended_json(doc, nullptr);
        if (json != nullptr) {
            _find_one_result = json;
            bson_free(json);
        }
    } else if (mongoc_cursor_error(cur, &err)) {
        _last_error = err.message;
    }
    // empty result = "" with no error.
    mongoc_cursor_destroy(cur);
    return _find_one_result.c_str();
}
```

- [ ] **Step 3: Build**

```sh
cd build && make lib
```

- [ ] **Step 4: Extend `smoke-mongo.fg`**

Decl:

```flow-wing
fun _mongo_find_one(coll: as int64, filterJson: as str) -> as str decl
```

After the count log:

```flow-wing
    var one: str = _mongo_find_one(coll, "{\"k\":\"smoke\"}")
    if one == "" {
        io::printErrorLogln("find_one empty/err: " + _mongo_last_error(), "red")
    } else {
        io::printLogln("find_one: " + one, "white")
    }
```

- [ ] **Step 5: Run smoke**

```sh
cd build && make smoke
```

Expected: `find_one: { "_id": ..., "k": "smoke", "n": 1 }` (relaxed extended JSON; exact field order may vary).

- [ ] **Step 6: Test empty-result path**

Add this call after the existing find_one:

```flow-wing
    var none: str = _mongo_find_one(coll, "{\"k\":\"nope-no-such-key\"}")
    io::printLogln("find_one(none) len=" + (none == "" ? 0 : 1), "cyan")
```

Expected: `find_one(none) len=0` with no error log. Remove this debug line after verifying.

- [ ] **Step 7: Commit**

```sh
git add src/mongo_binding.h src/mongo_binding.cpp smoke-mongo.fg
git commit -m "mongo_binding: find_one"
```

---

## Task 8: Cursor reads — `_mongo_find` / `_mongo_cursor_next` / `_mongo_cursor_close`

**Files:**
- Modify: `src/mongo_binding.h`
- Modify: `src/mongo_binding.cpp`
- Modify: `smoke-mongo.fg`

- [ ] **Step 1: Add decls**

```cpp
int64_t     _mongo_find(int64_t coll, const char* filterJson, int64_t limit);
const char* _mongo_cursor_next(int64_t cur);
void        _mongo_cursor_close(int64_t cur);
```

- [ ] **Step 2: Add cursor table to `mongo_binding.cpp`**

Near the other tables:

```cpp
#define MAX_CURSORS 256
static mongoc_cursor_t* _cursors[MAX_CURSORS] = {nullptr};
thread_local std::string _cursor_next_result;

static int64_t _alloc_cursor_slot() {
    for (int64_t i = 1; i < MAX_CURSORS; ++i) {
        if (_cursors[i] == nullptr) return i;
    }
    return 0;
}
```

- [ ] **Step 3: Implement the three functions inside `extern "C"`**

```cpp
int64_t _mongo_find(int64_t coll_h, const char* filterJson, int64_t limit) {
    _last_error.clear();
    if (coll_h <= 0 || coll_h >= MAX_COLLECTIONS || _collections[coll_h] == nullptr) {
        _last_error = "mongo: invalid collection handle";
        return 0;
    }
    const char* fj = (filterJson == nullptr || *filterJson == '\0') ? "{}" : filterJson;
    bson_error_t err;
    bson_t* filter = bson_new_from_json(reinterpret_cast<const uint8_t*>(fj), -1, &err);
    if (filter == nullptr) {
        _last_error = std::string("mongo: bad filter json: ") + err.message;
        return 0;
    }
    bson_t opts = BSON_INITIALIZER;
    if (limit > 0) BSON_APPEND_INT64(&opts, "limit", limit);

    mongoc_cursor_t* cur = mongoc_collection_find_with_opts(
        _collections[coll_h], filter, &opts, nullptr);
    bson_destroy(filter);
    bson_destroy(&opts);

    int64_t h = _alloc_cursor_slot();
    if (h == 0) {
        mongoc_cursor_destroy(cur);
        _last_error = "mongo: cursor handle table full";
        return 0;
    }
    _cursors[h] = cur;
    return h;
}

const char* _mongo_cursor_next(int64_t cur_h) {
    _last_error.clear();
    _cursor_next_result.clear();
    if (cur_h <= 0 || cur_h >= MAX_CURSORS || _cursors[cur_h] == nullptr) {
        _last_error = "mongo: invalid cursor handle";
        return _cursor_next_result.c_str();
    }
    const bson_t* doc = nullptr;
    if (!mongoc_cursor_next(_cursors[cur_h], &doc)) {
        bson_error_t err;
        if (mongoc_cursor_error(_cursors[cur_h], &err)) {
            _last_error = err.message;
        }
        return _cursor_next_result.c_str();  // "" = end-of-stream or error
    }
    char* json = bson_as_relaxed_extended_json(doc, nullptr);
    if (json != nullptr) {
        _cursor_next_result = json;
        bson_free(json);
    }
    return _cursor_next_result.c_str();
}

void _mongo_cursor_close(int64_t cur_h) {
    if (cur_h <= 0 || cur_h >= MAX_CURSORS) return;
    if (_cursors[cur_h] != nullptr) {
        mongoc_cursor_destroy(_cursors[cur_h]);
        _cursors[cur_h] = nullptr;
    }
}
```

- [ ] **Step 4: Strengthen `_mongo_client_close` to release dependent collection handles**

Replace the existing `_mongo_client_close` body with:

```cpp
void _mongo_client_close(int64_t h) {
    if (h <= 0 || h >= MAX_CLIENTS || _clients[h] == nullptr) return;
    // Any collection belonging to this client becomes invalid once the client
    // is destroyed; libmongoc collections hold a borrowed client pointer.
    // We can't tell collections apart by client, so the safe v1 contract is:
    // close all collections + all cursors when any client closes.
    for (int64_t i = 1; i < MAX_COLLECTIONS; ++i) {
        if (_collections[i] != nullptr) {
            mongoc_collection_destroy(_collections[i]);
            _collections[i] = nullptr;
        }
    }
    for (int64_t i = 1; i < MAX_CURSORS; ++i) {
        if (_cursors[i] != nullptr) {
            mongoc_cursor_destroy(_cursors[i]);
            _cursors[i] = nullptr;
        }
    }
    mongoc_client_destroy(_clients[h]);
    _clients[h] = nullptr;
}
```

(This is heavy-handed but correct for v1, which is single-client. When multi-client lands later, track parent client per collection/cursor.)

- [ ] **Step 5: Build**

```sh
cd build && make lib
```

- [ ] **Step 6: Extend `smoke-mongo.fg`**

Decls:

```flow-wing
fun _mongo_find(coll: as int64, filterJson: as str, limit: as int64) -> as int64 decl
fun _mongo_cursor_next(cur: as int64) -> as str decl
fun _mongo_cursor_close(cur: as int64) -> as nthg decl
```

After the existing find_one block:

```flow-wing
    var curH: int64 = _mongo_find(coll, "{\"k\":\"smoke\"}", 5)
    if curH == 0 {
        io::printErrorLogln("find failed: " + _mongo_last_error(), "red")
        _mongo_client_close(h)
        return :
    }
    var seen: int64 = 0
    var s: str = _mongo_cursor_next(curH)
    while s != "" {
        seen = seen + 1
        io::printLogln("doc: " + s, "white")
        s = _mongo_cursor_next(curH)
    }
    io::printLogln("cursor iterated: " + seen, "cyan")
    _mongo_cursor_close(curH)
```

- [ ] **Step 7: Run smoke**

```sh
cd build && make smoke
```

Expected: prints up to 5 documents, then `cursor iterated: N` where N >= 1 and N <= 5.

- [ ] **Step 8: Commit**

```sh
git add src/mongo_binding.h src/mongo_binding.cpp smoke-mongo.fg
git commit -m "mongo_binding: find/cursor_next/cursor_close + cleanup-on-client-close"
```

---

## Task 9: `mongo-Module.fg` — extern decls only

**Files:**
- Create: `mongo-Module.fg`
- Modify: `smoke-mongo.fg`

Before this task, **read `raylib-module.fg`** at `https://raw.githubusercontent.com/kushagra1212/Flow-Wing/main/fw-modules/raylib_module/raylib-module.fg` to confirm exact `decl` syntax conventions (comments, ordering, naming). The spec asserts `fun _name(p: as type) -> as type decl` — verify against the source before copying.

- [ ] **Step 1: Create `mongo-Module.fg` with all 11 externs**

```flow-wing
/; =========================================================
/; mongo-Module.fg — Flow-Wing binding to libmongoc.
/; Built locally as build/out/libflowwing_mongo.a.
/; See docs/superpowers/specs/2026-05-24-mongo-module-design.md.
/; =========================================================

/; ---- raw C extern declarations (do not call directly; use classes below) ----
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

(Classes added in Task 10.)

- [ ] **Step 2: Switch `smoke-mongo.fg` to use the module**

Remove every inline `fun _mongo_*(...) decl` line from `smoke-mongo.fg`. Add at the top, after the existing `bring` lines:

```flow-wing
bring 'mongo-Module.fg'
```

- [ ] **Step 3: Run smoke**

```sh
cd build && make smoke
```

Expected: identical output to Task 8 — the move from inline decls to module decls must be behavior-neutral.

If `bring 'mongo-Module.fg'` errors with "module not found" — Flow-Wing path-bring may require `./mongo-Module.fg` or a different quoting. Check the compiler error verbatim and adjust the path form. (Risk flagged in the spec.)

- [ ] **Step 4: Commit**

```sh
git add mongo-Module.fg smoke-mongo.fg
git commit -m "mongo-Module.fg: extern decls + smoke switches to module bring"
```

---

## Task 10: `mongo-Module.fg` — typed class wrappers

**Files:**
- Modify: `mongo-Module.fg`
- Modify: `smoke-mongo.fg`

Before this task, **re-read `server.fg`** lines 24-40 to confirm the class instantiation / method-call / error-handling pattern (`vortex::Server`, `Err::Result`, `Err::isErr`, tuple returns from `file::readText`). The classes below must compose identically.

- [ ] **Step 1: Append classes to `mongo-Module.fg`**

```flow-wing
bring Err

class MongoCursor {
    var _h: int64 = 0

    fun next(self) -> str { return _mongo_cursor_next(self._h) }
    fun close(self) -> nthg { _mongo_cursor_close(self._h) }
}

class MongoCollection {
    var _h: int64 = 0

    fun insertOne(self, json: str) -> Err::Result {
        if _mongo_insert_one(self._h, json) == 0 {
            return Err::new(_mongo_last_error())
        }
        return Err::ok()
    }

    fun insertMany(self, jsonArr: str) -> Err::Result {
        if _mongo_insert_many(self._h, jsonArr) == 0 {
            return Err::new(_mongo_last_error())
        }
        return Err::ok()
    }

    fun findOne(self, filterJson: str) -> str, Err::Result {
        var s: str = _mongo_find_one(self._h, filterJson)
        if s == "" {
            var emsg: str = _mongo_last_error()
            if emsg == "" {
                /; empty result, not an error
                return "", Err::ok()
            }
            return "", Err::new(emsg)
        }
        return s, Err::ok()
    }

    fun find(self, filterJson: str, limit: int64) -> MongoCursor {
        var c: MongoCursor = new MongoCursor()
        c._h = _mongo_find(self._h, filterJson, limit)
        return c
    }

    fun count(self, filterJson: str) -> int64 {
        return _mongo_count(self._h, filterJson)
    }
}

class MongoClient {
    var _h: int64 = 0

    fun connect(self, uri: str) -> Err::Result {
        self._h = _mongo_client_new(uri)
        if self._h == 0 {
            return Err::new(_mongo_last_error())
        }
        return Err::ok()
    }

    fun getCollection(self, db: str, coll: str) -> MongoCollection {
        var c: MongoCollection = new MongoCollection()
        c._h = _mongo_get_collection(self._h, db, coll)
        return c
    }

    fun close(self) -> nthg { _mongo_client_close(self._h) }
}
```

- [ ] **Step 2: Rewrite `smoke-mongo.fg` to use the classes**

Replace the entire file with:

```flow-wing
/; smoke-mongo.fg — uses the typed class API from mongo-Module.fg

bring 'mongo-Module.fg'
bring io
bring Err

fun fg_main() -> nthg {
    var mc: MongoClient = new MongoClient()
    var err: Err::Result = mc.connect("mongodb://127.0.0.1:27017")
    if Err::isErr(err) {
        io::printErrorLogln("connect failed", "red")
        return :
    }

    var coll: MongoCollection = mc.getCollection("fw_smoke", "events")

    err = coll.insertOne("{\"k\":\"smoke\",\"n\":1}")
    if Err::isErr(err) { io::printErrorLogln("insertOne failed", "red"); mc.close(); return : }

    err = coll.insertMany("[{\"k\":\"smoke\",\"n\":2},{\"k\":\"smoke\",\"n\":3}]")
    if Err::isErr(err) { io::printErrorLogln("insertMany failed", "red"); mc.close(); return : }

    var n: int64 = coll.count("{\"k\":\"smoke\"}")
    io::printLogln("count: " + n, "cyan")

    var one: str, e2: Err::Result = coll.findOne("{\"k\":\"smoke\"}")
    if Err::isErr(e2) { io::printErrorLogln("findOne failed", "red"); mc.close(); return : }
    io::printLogln("findOne: " + one, "white")

    var cur: MongoCursor = coll.find("{\"k\":\"smoke\"}", 5)
    var s: str = cur.next()
    var seen: int64 = 0
    while s != "" {
        seen = seen + 1
        io::printLogln("doc: " + s, "white")
        s = cur.next()
    }
    cur.close()
    io::printLogln("iterated: " + seen, "cyan")

    mc.close()
    io::printLogln("smoke ok", "cyan")
}

fg_main()
```

- [ ] **Step 3: Run smoke**

```sh
cd build && make smoke
```

Expected stdout ends with `smoke ok`, with `count: <N>`, `findOne: { ... }`, several `doc: { ... }` lines, and `iterated: M` where M >= 1 and M <= 5.

- [ ] **Step 4: If Flow-Wing rejects tuple-return syntax (`-> str, Err::Result`)**

Fallback per the spec's risks section: drop `findOne` to a two-call shape:

```flow-wing
fun findOne(self, filterJson: str) -> str {
    return _mongo_find_one(self._h, filterJson)
}
fun lastError(self) -> str { return _mongo_last_error() }
```

Update smoke to call `coll.findOne(...)` and then `coll.lastError()` only when the returned string is `""`. Document the fallback inline in `mongo-Module.fg`.

- [ ] **Step 5: If Flow-Wing rejects the `self` parameter**

Look at `raylib-module.fg`'s class definitions (same source as before) for the actual receiver syntax. Adjust all five class methods identically. Re-run smoke.

- [ ] **Step 6: Commit**

```sh
git add mongo-Module.fg smoke-mongo.fg
git commit -m "mongo-Module.fg: typed class wrappers (MongoClient/Collection/Cursor)"
```

---

## Task 11: Static-merge libmongoc + libbson into our .a (macOS)

**Files:**
- Modify: `build/CMakeLists.txt`

This is the bundling step deferred from Task 1. With everything else working, packaging failure now points at packaging, not code.

- [ ] **Step 1: Inspect what `.a` files brew installed**

Run:
```sh
ls "$(brew --prefix)/lib"/libmongoc*.a "$(brew --prefix)/lib"/libbson*.a 2>&1
```

- [ ] **Step 2a: If both `.a` files exist — append the libtool merge step to `CMakeLists.txt`**

Append at the end of `build/CMakeLists.txt`:

```cmake
if(APPLE)
  find_program(LIBTOOL_BIN libtool REQUIRED)
  add_custom_command(TARGET flowwing_mongo POST_BUILD
    COMMAND ${LIBTOOL_BIN} -static -o $<TARGET_FILE:flowwing_mongo>
      $<TARGET_FILE:flowwing_mongo>
      ${MONGOC_LIBDIR}/libmongoc-1.0.a
      ${BSON_LIBDIR}/libbson-1.0.a
    COMMENT "Merging libmongoc + libbson into libflowwing_mongo.a")
endif()
```

Rebuild: `cd build && make clean && make smoke`. Expected: smoke passes (link line on the flowwing side is unchanged, but symbols now self-contained).

- [ ] **Step 2b: If `.a` files DO NOT exist — leave as dynamic link**

Verify the compiled binary at `build/bin/smoke-mongo` still resolves libmongoc/libbson at runtime via rpath (the AOT binary links dynamically against them when the `.a` files aren't merged). If not, set:

```sh
export DYLD_LIBRARY_PATH="$(brew --prefix)/lib:$DYLD_LIBRARY_PATH"
```

…and document this in the README in Task 12. Skip the libtool merge.

- [ ] **Step 3: Verify**

```sh
cd build && make clean && make smoke
```

Expected: `smoke ok`.

- [ ] **Step 4: Commit**

```sh
git add build/CMakeLists.txt
git commit -m "build: static-merge libmongoc into libflowwing_mongo.a on macOS (if available)"
```

---

## Task 12: README + run instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a new section to `README.md` after "Run it on Flow-Wing"**

Append:

```markdown
## MongoDB binding (`mongo-Module.fg`)

This repo ships a local Flow-Wing binding to libmongoc, used by `server.fg` for
event tracking. Spec: `docs/superpowers/specs/2026-05-24-mongo-module-design.md`.

### Build

```sh
brew install mongo-c-driver cmake pkg-config
cd build && make lib
```

Produces `build/out/libflowwing_mongo.a`.

### Smoke-test the binding

Requires a reachable `mongod` (default `mongodb://127.0.0.1:27017`):

```sh
brew services start mongodb-community
cd build && make smoke
```

Expected final line: `smoke ok`.

### Run the server with the binding linked

```sh
cd build && make run
# equivalent to: flowwing server.fg -o build/bin/server -L./build/out -l flowwing_mongo && ./build/bin/server
```

### Notes

- v1 surface: `MongoClient`, `MongoCollection` (insertOne/insertMany/findOne/find/count), `MongoCursor` (next/close).
- JSON in for writes, relaxed extended JSON out for reads.
- Single-client v1 (libmongoc client is not thread-safe; vortex serves single-threaded).
- If brew ships dylib-only `mongo-c-driver`, prepend `DYLD_LIBRARY_PATH="$(brew --prefix)/lib"` when executing the compiled binary (e.g. `DYLD_LIBRARY_PATH=... ./build/bin/server`).
```

- [ ] **Step 2: Commit**

```sh
git add README.md
git commit -m "README: document mongo-Module.fg build / smoke / run"
```

---

## Done criteria

- `cd build && make smoke` ends with `smoke ok` against local `mongod`.
- `cd build && make run` starts `server.fg` on :8080 with the binding linked (server itself is unchanged — using the binding from `server.fg` is the next sub-project).
- Spec file `docs/superpowers/specs/2026-05-24-mongo-module-design.md` and this plan committed to `main`.
- Twelve commits total, one per task.

## Out of scope for this plan (handled by follow-up plans)

- JS instrumentation in `assets/` (page_load, scroll depth, CTA clicks, session id).
- `POST /track` route in `server.fg`.
- Event schema + Mongo indexes.
- Read endpoint / dashboard.
- Contributing `mongo_module` upstream to `fw-modules`.
- Linux / Windows build paths.
- Connection pool (multi-threaded vortex).
