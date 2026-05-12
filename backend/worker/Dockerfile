FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/opt/hf-cache \
    OMP_NUM_THREADS=4

RUN apt-get update && apt-get install -y --no-install-recommends \
        pandoc \
        libgl1 \
        libglib2.0-0 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download docling models so cold starts skip the ~500 MB fetch.
RUN python -c "from docling.document_converter import DocumentConverter; DocumentConverter()" \
    || echo "warning: docling pre-warm failed; models will download lazily"

COPY worker_app/ ./worker_app/

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn worker_app.main:app --host 0.0.0.0 --port ${PORT}"]
