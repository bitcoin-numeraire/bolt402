.PHONY: build test lint fmt check doc clean ci \
       regtest-up regtest-init regtest-test regtest-down regtest \
       regtest-logs regtest-status

# Default target
all: check

# Build all crates
build:
	cargo build --workspace

# Run all tests
test:
	cargo test --workspace

# Run clippy lints
lint:
	cargo clippy --workspace --all-targets -- -D warnings

# Check formatting
fmt:
	cargo fmt --all -- --check

# Format code (fix in place)
fmt-fix:
	cargo fmt --all

# Full check: fmt + lint + test
check: fmt lint test

# Build documentation
doc:
	cargo doc --workspace --no-deps

# Open documentation in browser
doc-open:
	cargo doc --workspace --no-deps --open

# Clean build artifacts
clean:
	cargo clean

# CI pipeline (same as GitHub Actions)
ci: fmt lint test doc
	@echo "CI checks passed."

# ─── Regtest integration tests ───────────────────────────────────────

REGTEST_COMPOSE := tests/regtest/docker-compose.yml

# Start the regtest Docker stack
regtest-up:
	docker compose -f $(REGTEST_COMPOSE) up -d

# Initialize the regtest network (fund wallets, open channels, export env)
regtest-init:
	./tests/regtest/scripts/init-regtest.sh

# Run regtest integration tests
regtest-test:
	cargo test -p bolt402-regtest -- --nocapture

# Tear down the regtest stack and remove volumes
regtest-down:
	docker compose -f $(REGTEST_COMPOSE) down -v

# Full regtest cycle: up → init → test → down
regtest: regtest-up regtest-init regtest-test
	@echo "Regtest tests passed. Run 'make regtest-down' to clean up."

# Show regtest Docker logs (useful for debugging)
regtest-logs:
	docker compose -f $(REGTEST_COMPOSE) logs --tail=100

# Show regtest service status
regtest-status:
	docker compose -f $(REGTEST_COMPOSE) ps
