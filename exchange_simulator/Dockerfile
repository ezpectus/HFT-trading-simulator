# ── Build stage: install dependencies ──
FROM python:3.14-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Runtime stage: slim image with only runtime deps ──
FROM python:3.14-slim

WORKDIR /app

# Create non-root user and copy packages
RUN groupadd -r appuser && useradd -r -g appuser -m appuser
COPY --from=builder /root/.local /home/appuser/.local
COPY . .

RUN chown -R appuser:appuser /app
USER appuser

# Ensure user packages are on PATH
ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8765 8775

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
    CMD python -c "import socket; socket.create_connection(('localhost', 8765), timeout=5)" || exit 1

CMD ["python", "-m", "exchange_simulator", "--no-visualizer"]
