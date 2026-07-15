# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Build-time args for Vite env vars (inlined at build time, not runtime)
ARG VITE_WS_EXCHANGE=ws://localhost:8765
ARG VITE_WS_SIGNALS=ws://localhost:8766
ENV VITE_WS_EXCHANGE=${VITE_WS_EXCHANGE}
ENV VITE_WS_SIGNALS=${VITE_WS_SIGNALS}

COPY package*.json ./
RUN npm ci --production=false || npm install --silent

COPY . .
RUN npm run build

# Production stage — serve static files with nginx
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
    CMD wget -q --spider http://localhost:3000/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
