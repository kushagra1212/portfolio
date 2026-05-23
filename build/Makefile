PKG_CONFIG_PATH ?= $(shell brew --prefix mongo-c-driver)/lib/pkgconfig
export PKG_CONFIG_PATH

REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST)))/..)
BIN_DIR := $(REPO_ROOT)/build/bin
MONGO_LIB_DIR := $(shell brew --prefix mongo-c-driver)/lib

# Link flags for flowwing AOT: our static archive references libmongoc/libbson
# symbols, so the final link must also resolve mongoc2 + bson2. Until Task 11
# bundles them into libflowwing_mongo.a, we pass them explicitly.
FW_LINK := -L $(REPO_ROOT)/build/out -L $(MONGO_LIB_DIR) \
           -l flowwing_mongo -l mongoc2 -l bson2

.PHONY: lib server smoke-bin run smoke clean
lib:
	cmake -S . -B out && cmake --build out
	ln -sf build/out/compile_commands.json $(REPO_ROOT)/compile_commands.json

server: lib
	mkdir -p $(BIN_DIR)
	cd $(REPO_ROOT) && flowwing server.fg -o $(BIN_DIR)/server $(FW_LINK)

run: server
	$(BIN_DIR)/server

smoke-bin: lib
	mkdir -p $(BIN_DIR)
	cd $(REPO_ROOT) && flowwing smoke-mongo.fg -o $(BIN_DIR)/smoke-mongo $(FW_LINK)

smoke: smoke-bin
	$(BIN_DIR)/smoke-mongo

clean:
	rm -rf out $(BIN_DIR)
