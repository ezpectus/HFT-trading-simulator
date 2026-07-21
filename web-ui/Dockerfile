# Build stage
FROM node:26-slim AS builder

WORKDIR /app

# Build-time args for Vite env vars (inlined at build time, not runtime)
ARG VITE_WS_EXCHANGE=ws://localhost:8765
ARG VITE_WS_SIGNALS=ws://localhost:8766
ENV VITE_WS_EXCHANGE=${VITE_WS_EXCHANGE}
ENV VITE_WS_SIGNALS=${VITE_WS_SIGNALS}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage — serve static files with nginx (non-root)
FROM nginx:1.27-alpine

# Run nginx as the built-in `nginx` user (UID 101) for consistency with
# other services' prod Dockerfiles (appuser). Port 3000 is non-privileged.
RUN chown -R nginx:nginx /var/cache/nginx /var/run /usr/share/nginx/html /etc/nginx/conf.d

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

RUN chown -R nginx:nginx /usr/share/nginx/html

USER nginx

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
    CMD wget -q --spider http://localhost:3000/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
