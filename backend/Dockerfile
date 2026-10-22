# Cloud Run 向けイメージ。ビルド: backend/ で `docker build -t abdoc-api .`
# 実行時は PORT 環境変数で待ち受けポートが決まる（未設定なら 8080）。

FROM golang:1.27 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/abdoc ./cmd/abdoc

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/abdoc /abdoc
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/abdoc"]
