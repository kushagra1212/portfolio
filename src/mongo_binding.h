// src/mongo_binding.h
#pragma once
#include <cstdint>

extern "C" {
int64_t  _mongo_client_new(const char* uri);
void     _mongo_client_close(int64_t h);
const char* _mongo_last_error();
}
