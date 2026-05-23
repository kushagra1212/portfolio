PKG_CONFIG_PATH ?= /opt/homebrew/opt/mongo-c-driver/lib/pkgconfig

.PHONY: lib run smoke clean
lib:
	PKG_CONFIG_PATH=$(PKG_CONFIG_PATH) cmake -S . -B out && cmake --build out

run: lib
	cd .. && flowwing-jit server.fg -L./build/out -l flowwing_mongo

smoke: lib
	cd .. && flowwing-jit smoke-mongo.fg -L./build/out -l flowwing_mongo

clean:
	rm -rf out
