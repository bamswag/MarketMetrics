FROM node:22-alpine AS frontend-build

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /srv/marketmetrics

RUN addgroup --system marketmetrics \
    && adduser --system --ingroup marketmetrics --home /srv/marketmetrics marketmetrics

COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

COPY --chown=marketmetrics:marketmetrics . ./
COPY --from=frontend-build --chown=marketmetrics:marketmetrics \
    /build/frontend/dist ./frontend/dist

USER marketmetrics

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
