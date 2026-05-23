// src/mongo_binding.h
#pragma once
#include <cstdint>

extern "C" {
int64_t  _mongo_client_new(const char* uri);
void     _mongo_client_close(int64_t h);
int64_t  _mongo_get_collection(int64_t client, const char* db, const char* coll);
int64_t _mongo_insert_one(int64_t coll, const char* json);
int64_t _mongo_insert_many(int64_t coll, const char* jsonArray);
int64_t _mongo_count(int64_t coll, const char* filterJson);
const char* _mongo_find_one(int64_t coll, const char* filterJson);
int64_t     _mongo_find(int64_t coll, const char* filterJson, int64_t limit);
const char* _mongo_cursor_next(int64_t cur);
void        _mongo_cursor_close(int64_t cur);
const char* _mongo_last_error();
}
