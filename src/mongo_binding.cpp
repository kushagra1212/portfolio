// src/mongo_binding.cpp
#include "mongo_binding.h"
#include <mongoc/mongoc.h>
#include <mutex>
#include <string>

#define MAX_CLIENTS 64
static mongoc_client_t* _clients[MAX_CLIENTS] = {nullptr};

#define MAX_COLLECTIONS 256
static mongoc_collection_t* _collections[MAX_COLLECTIONS] = {nullptr};

static int64_t _alloc_collection_slot() {
    for (int64_t i = 1; i < MAX_COLLECTIONS; ++i) {
        if (_collections[i] == nullptr) return i;
    }
    return 0;
}

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

const char* _mongo_last_error() { return _last_error.c_str(); }

} // extern "C"
