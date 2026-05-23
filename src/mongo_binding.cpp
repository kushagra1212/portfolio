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
