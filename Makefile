# 実体は scripts/generate.sh。Make は薄いラッパ。
.PHONY: generate generate-be generate-fe test-integration

generate:
	bash scripts/generate.sh all

generate-be:
	bash scripts/generate.sh be

generate-fe:
	bash scripts/generate.sh fe

# compose を起動したまま実行する。環境変数なしの go test -tags=integration は意図的に Fatal する。
test-integration:
	cd backend && FIRESTORE_EMULATOR_HOST=localhost:8081 BIGQUERY_EMULATOR_HOST=localhost:9050 \
	  GOOGLE_CLOUD_PROJECT=abdoc-local BIGQUERY_DATASET=abdoc ABDOC_PROXY_URL=http://localhost:8080 \
	  go test -tags=integration -count=1 ./...
