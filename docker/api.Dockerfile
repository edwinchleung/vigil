# syntax=docker/dockerfile:1

FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/* \
  && curl -LsSf https://astral.sh/uv/install.sh | sh

ENV PATH="/root/.local/bin:${PATH}"
# PyTorch 2.11 on PyPI pulls multi-GB CUDA deps on Linux; use CPU wheels in containers.
ENV UV_LINK_MODE=copy

COPY pyproject.toml uv.lock README.md ./
RUN uv venv \
  && uv pip install "torch==2.11.0" --index-url https://download.pytorch.org/whl/cpu \
  && uv export --frozen --no-dev --no-emit-project --no-hashes \
    | grep -vE '^(torch|triton|nvidia-|cuda-)' \
    > /tmp/requirements.txt \
  && uv pip install -r /tmp/requirements.txt

COPY app ./app
RUN uv pip install --no-deps -e .

ENV EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2
RUN .venv/bin/python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/health || exit 1

CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
