# 実体は scripts/generate.sh。Make は薄いラッパ。
.PHONY: generate generate-be generate-fe

generate:
	bash scripts/generate.sh all

generate-be:
	bash scripts/generate.sh be

generate-fe:
	bash scripts/generate.sh fe
