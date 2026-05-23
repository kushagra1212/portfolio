// src/mongo_binding.cpp
#include "mongo_binding.h"
#include <string>

thread_local std::string _last_error;

extern "C" {
const char* _mongo_last_error() { return _last_error.c_str(); }
}
