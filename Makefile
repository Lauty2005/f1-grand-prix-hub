.DEFAULT_GOAL := help
.PHONY: help up down reset snapshot logs psql test token migrate migrate-down

help: ## Lista los targets disponibles
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

up: ## Levanta db + api
	docker compose up -d --build

down: ## Baja el stack (conserva el volumen de datos)
	docker compose down

reset: ## Borra el volumen, recrea la base y vuelve a correr db/init/
	docker compose down -v
	$(MAKE) up

snapshot: ## Copia las tablas deportivas de Supabase a db/init/
	bash scripts/db-snapshot.sh

logs: ## Sigue los logs de todos los servicios
	docker compose logs -f

psql: ## Abre psql contra la base local
	docker compose exec db psql -U f1 -d f1hub

test: ## Corre los tests del backend (hoy no hay)
	@if grep -q '"test": "echo \\"Error: no test specified' server/package.json; then \
		echo "El backend todavía no tiene tests (server/package.json usa el script por defecto de npm init)."; \
	else \
		docker compose run --rm api npm test; \
	fi


migrate: ## Aplica db/migrations/*.sql (sin *.down.sql) a la base local, en orden
	@for f in $$(ls db/migrations/*.sql | grep -v '\.down\.sql$$' | sort); do \
		echo "-> $$f"; \
		docker compose exec -T db psql -U f1 -d f1hub -v ON_ERROR_STOP=1 -q < "$$f" || exit 1; \
	done

migrate-down: ## Revierte UNA migracion local: make migrate-down M=005_jolpica_mapping
	@test -n "$(M)" || (echo "Uso: make migrate-down M=<nombre sin .sql>"; exit 1)
	docker compose exec -T db psql -U f1 -d f1hub -v ON_ERROR_STOP=1 < db/migrations/$(M).down.sql

token: ## Firma un JWT de agente con el JWT_SECRET local y lo imprime
	@docker compose exec -T api node scripts/dev-token.js
