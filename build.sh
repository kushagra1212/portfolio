#!/bin/bash
set -euo pipefail

read -p "Enter your Docker Hub username: " DOCKER_USER

echo "📦 Generating Dockerfiles..."

cat << 'EOF' > Dockerfile.flowwing-base
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl gnupg ca-certificates build-essential tar pkg-config libssl-dev && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://kushagra1212.github.io/Flow-Wing/flowwing.gpg.key | gpg --dearmor -o /etc/apt/keyrings/flowwing.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/flowwing.gpg] https://kushagra1212.github.io/Flow-Wing/ ./" | tee /etc/apt/sources.list.d/flowwing.list > /dev/null && \
    apt-get update && \
    apt-get install -y --no-install-recommends flowwing
EOF

cat << EOF > Dockerfile.flowwing
FROM $DOCKER_USER/flowwing-base:latest AS builder
ARG CACHEBUST=1
WORKDIR /build
RUN curl -L https://github.com/kushagra1212/Flow-Wing/tarball/main | tar -xz --wildcards "*/flowwing-explorer/flow-wing-website/*" && \
    mv kushagra1212-Flow-Wing-*/flowwing-explorer/flow-wing-website/* ./ && \
    rm -rf kushagra1212-Flow-Wing-* && \
    flowwing server.fg -o ./fg-server

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends docker.io ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN mkdir -p /tmp/submissions && chmod 777 /tmp/submissions
COPY --from=builder /build/fg-server ./fg-server
COPY --from=builder /build/template.html ./template.html
COPY --from=builder /build/assets ./assets
RUN chmod -R 755 /app
EXPOSE 8080
CMD ["./fg-server"]
EOF

cat << EOF > Dockerfile.portfolio
FROM $DOCKER_USER/flowwing-base:latest AS builder
ARG CACHEBUST=1
WORKDIR /build
RUN curl -L https://github.com/kushagra1212/portfolio/tarball/main | tar -xz --strip-components=1 && \
    flowwing server.fg -o ./portfolio-server

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends docker.io ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN mkdir -p /tmp/submissions && chmod 777 /tmp/submissions
COPY --from=builder /build/portfolio-server ./portfolio-server
COPY --from=builder /build/index.html ./index.html
COPY --from=builder /build/assets ./assets
COPY --from=builder /build/career.fg ./career.fg
RUN chmod -R 755 /app
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "./portfolio-server \"\$MONGO_URI\" \"\$ADMIN_TOKEN\""]
EOF

cat << 'EOF' > Dockerfile.sandbox
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl gnupg ca-certificates && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://kushagra1212.github.io/Flow-Wing/flowwing.gpg.key | gpg --dearmor -o /etc/apt/keyrings/flowwing.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/flowwing.gpg] https://kushagra1212.github.io/Flow-Wing/ ./" | tee /etc/apt/sources.list.d/flowwing.list > /dev/null && \
    apt-get update && \
    apt-get install -y --no-install-recommends flowwing && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash sandboxuser
WORKDIR /sandbox
USER sandboxuser
EOF

echo "🚀 Ensuring cross-compilation environment is active..."
docker buildx create --use || true

echo "🔨 Building and pushing Base Image..."
docker buildx build --platform linux/amd64 -f Dockerfile.flowwing-base -t $DOCKER_USER/flowwing-base:latest --push .

echo "🔨 Building and pushing Flow-Wing App..."
docker buildx build --platform linux/amd64 -f Dockerfile.flowwing --build-arg CACHEBUST=$(date +%s) -t $DOCKER_USER/flowwing-app:latest --push .

echo "🔨 Building and pushing Portfolio App..."
docker buildx build --platform linux/amd64 -f Dockerfile.portfolio --build-arg CACHEBUST=$(date +%s) -t $DOCKER_USER/portfolio-app:latest --push .

echo "🔨 Building and pushing Sandbox..."
docker buildx build --platform linux/amd64 -f Dockerfile.sandbox -t $DOCKER_USER/flowwing-sandbox:latest --push .

echo "✅ All images successfully cross-compiled and pushed to Docker Hub!"