.PHONY: dev-web dev-api
# Next.js (repo root) — same as `bun run dev`
dev-web:
	bun run dev
# FastAPI — requires `uv` (https://docs.astral.sh/uv/)
dev-api:
	cd backend && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
