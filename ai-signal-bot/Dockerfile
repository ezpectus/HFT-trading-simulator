# ── Build stage: install dependencies ──
FROM python:3.12-slim AS builder

WORKDIR /app

# Install system dependencies for matplotlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Runtime stage: slim image with only runtime libs ──
FROM python:3.12-slim

WORKDIR /app

# Install runtime system libraries (no -dev packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libffi8 libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r appuser && useradd -r -g appuser -m appuser

# Copy installed packages from builder
COPY --from=builder /root/.local /home/appuser/.local

# Copy application source
COPY . .

RUN chown -R appuser:appuser /app
USER appuser

# Ensure user packages are on PATH
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8766 9090

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8766/health', timeout=5)" || exit 1

CMD ["python", "run.py"]
