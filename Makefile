.DEFAULT_GOAL := help

E2E_PHONE ?= +5491155551234
export DATA_DIR ?= ./data
.PHONY: help up down logs ps api-test web-test test lint api-schema api-types api-types-check fake-gowa-test replay deploy bootstrap-dev-crew e2e e2e-keep bot-smoke

help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: ## Build and start the dev stack (api, web, fake-gowa)
	docker compose up --build -d

down: ## Stop the dev stack
	docker compose down

logs: ## Follow dev stack logs
	docker compose logs -f

ps: ## Show dev stack status
	docker compose ps

api-test: ## Run api tests
	cd api && uv run pytest

web-test: ## Run web unit tests
	cd web && pnpm test

test: api-test web-test ## Run api and web tests

lint: ## Lint api (ruff, import-linter) and web (eslint, tsc)
	cd api && uv run ruff check . && uv run lint-imports
	cd web && pnpm lint && pnpm typecheck

api-schema: ## Export the OpenAPI snapshot to contracts/openapi.json
	cd api && uv run python manage.py export_openapi_schema --api config.api.api --output ../contracts/openapi.json --indent 2

api-types: ## Generate web API types from contracts/openapi.json
	cd web && pnpm api:types

api-types-check: ## Fail if the generated web API types drifted from the contract
	cd web && pnpm api:types:check

fake-gowa-test: ## Run the fake Gowa stub tests
	cd deploy/dev/fake_gowa && uv run pytest

MIGRATE = docker compose exec -T api python manage.py migrate --noinput
BOOTSTRAP_CREW = $(MIGRATE) && docker compose exec -T api python manage.py bootstrap_crew --name "Crew de prueba" --chat-id 120363000000000000@g.us --admin-phone $(E2E_PHONE)
E2E_RUN = cd web && pnpm install --frozen-lockfile && pnpm exec playwright install chromium && E2E_BASE_URL=http://localhost:3000 FAKE_GOWA_URL=http://localhost:4000 E2E_PHONE=$(E2E_PHONE) pnpm test:e2e

# e2e runs against its own throwaway data dir so it never touches the dev DB and always starts clean.
e2e e2e-keep: export DATA_DIR := ./data/e2e

bootstrap-dev-crew: ## Create the dev crew and its admin (E2E_PHONE) in the running stack
	$(BOOTSTRAP_CREW)

e2e: ## Run the Playwright login e2e on a fresh stack and data dir, then tear it down
	@rm -rf $(DATA_DIR); trap 'docker compose down -v' EXIT; docker compose up --build -d --wait && $(BOOTSTRAP_CREW) && $(E2E_RUN)

e2e-keep: ## Run the e2e like `e2e` but leave the stack running for debugging
	@rm -rf $(DATA_DIR)
	docker compose up --build -d --wait
	$(BOOTSTRAP_CREW)
	$(E2E_RUN)

FIXTURE ?= api/messaging/tests/fixtures/gowa/group_command_ping.json

bot-smoke: ## Dev stack + fake Gowa: replay /viaje ping, expect pong, duplicate on replay, tick (own data dir, torn down after)
	./deploy/scripts/bot_smoke.sh

replay: ## Replay a recorded Gowa webhook against the local api (make replay FIXTURE=<path>)
	cd api && uv run python manage.py replay_gowa ../$(FIXTURE)

deploy: ## Print the Pi deployment pointer (deploys run on the Pi)
	@echo "Run deploy/scripts/deploy.sh on the Pi; see deploy/README.md"
