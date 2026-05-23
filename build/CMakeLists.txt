cmake_minimum_required(VERSION 3.15)
project(flowwing_mongo CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(PkgConfig REQUIRED)
pkg_check_modules(MONGOC REQUIRED mongoc2)
pkg_check_modules(BSON   REQUIRED bson2)

add_library(flowwing_mongo STATIC ../src/mongo_binding.cpp)
target_include_directories(flowwing_mongo PRIVATE
  ${MONGOC_INCLUDE_DIRS} ${BSON_INCLUDE_DIRS} ../src)
target_link_libraries(flowwing_mongo PRIVATE
  ${MONGOC_LIBRARIES} ${BSON_LIBRARIES})
# libbson 2.x public API loses alignment attribute on bson_t* through public typedef;
# pointers are correctly aligned at runtime, suppress the spurious diagnostic.
target_compile_options(flowwing_mongo PRIVATE -Wno-align-mismatch)
