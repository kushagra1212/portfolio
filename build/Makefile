PKG_CONFIG_PATH ?= $(shell brew --prefix mongo-c-driver)/lib/pkgconfig
export PKG_CONFIG_PATH

REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)

.PHONY: lib run smoke clean
lib:
	PKG_CONFIG_PATH=$(PKG_CONFIG_PATH) cmake -S . -B out && cmake --build out

run: lib
	cd $(REPO_ROOT) && flowwing-jit server.fg -L./build/out -l flowwing_mongo

smoke: lib
	cd $(REPO_ROOT) && flowwing-jit smoke-mongo.fg -L./build/out -l flowwing_mongo

clean:
	rm -rf out
