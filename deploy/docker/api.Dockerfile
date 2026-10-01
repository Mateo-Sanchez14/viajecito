# syntax=docker/dockerfile:1
# Build context: repository root.  Targets: dev (compose) and prod (default, last stage).
#
# The virtualenv lives in /opt/venv, not /app/.venv, so the dev bind mount (./api:/app) does not
# shadow it.

# ---- builder: resolves dependencies with uv -------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0 \
    UV_COMPILE_BYTECODE=1
WORKDIR /app
COPY api/pyproject.toml api/uv.lock ./

# ---- dev: all dependency groups, Django runserver, code arrives through a bind mount --------
FROM builder AS dev
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.dev
COPY api/ ./
RUN mkdir -p /data
EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py runserver 0.0.0.0:8000"]

# ---- prod-deps: runtime dependencies only ----------------------------------------------------
FROM builder AS prod-deps
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# ---- prod: slim runtime image, non-root, data under /data -------------------------------------
FROM python:3.13-slim-bookworm AS prod
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    DATABASE_PATH=/data/db.sqlite3 \
    MEDIA_ROOT=/data/media \
    STATIC_ROOT=/data/static
RUN useradd --system --uid 1000 --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /data \
    && chown app:app /data
WORKDIR /app
COPY --from=prod-deps /opt/venv /opt/venv
COPY api/ ./
COPY deploy/docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
USER app
VOLUME ["/data"]
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
