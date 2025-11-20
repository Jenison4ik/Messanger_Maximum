FROM debian:bookworm AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libasio-dev \
    && rm -rf /var/lib/apt/lists/*
    
RUN apt-get update && apt-get install -y libpq-dev libpqxx-dev

WORKDIR /app
COPY . .

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --config Release
RUN apt-get update && apt-get install -y libpq-dev libpqxx-dev

FROM debian:bookworm-slim
WORKDIR /srv/app

COPY --from=build /app/build/main /usr/local/bin/messanger
COPY templates ./templates

EXPOSE 18080
CMD ["messanger"]