// src/mongo_binding.h
#pragma once
#include <cstdint>

extern "C" {
int64_t  _mongo_client_new(const char* uri);
void     _mongo_client_close(int64_t h);
int64_t  _mongo_get_collection(int64_t client, const char* db, const char* coll);
const char* _mongo_last_error();
}
