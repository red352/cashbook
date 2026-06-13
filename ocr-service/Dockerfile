# syntax=docker/dockerfile:1.7

FROM python:3.12-slim

WORKDIR /app

ARG OCR_PRELOAD_MODELS=false
ARG OCR_PERFORMANCE_MODE=turbo

ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PIP_NO_COMPILE=1
ENV PIP_CACHE_DIR=/tmp/pip-cache
ENV PYTHONDONTWRITEBYTECODE=1
ENV OCR_DEVICE=cpu
ENV OCR_LANG=ch
ENV OCR_VERSION=PP-OCRv6
ENV OCR_PERFORMANCE_MODE=${OCR_PERFORMANCE_MODE}
ENV OCR_ENABLE_MKLDNN=true
ENV OCR_CPU_THREADS=4
ENV OCR_REC_BATCH_SIZE=16
ENV OCR_MODEL_SOURCE=bos
ENV OCR_CACHE_HOME=/app/.paddlex-cache
ENV OCR_TEMP_DIR=/app/.paddlex-cache/tmp
ENV OCR_BAKED_CACHE_HOME=/opt/paddlex-cache
ENV OCR_MAX_SINGLE_IMAGE_HEIGHT=6000
ENV OCR_SLICE_HEIGHT=6000
ENV OCR_SLICE_OVERLAP=320

COPY requirements-base.txt requirements.txt ./
RUN --mount=type=cache,target=/tmp/pip-cache \
  pip install --no-compile -r requirements.txt

COPY app.py docker-entrypoint.sh ./
RUN chmod +x /app/docker-entrypoint.sh

RUN if [ "$OCR_PRELOAD_MODELS" = "true" ]; then \
    OCR_CACHE_HOME="$OCR_BAKED_CACHE_HOME" \
    OCR_TEMP_DIR="$OCR_BAKED_CACHE_HOME/tmp" \
    python -c "import app; print(app.health())"; \
  fi

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
