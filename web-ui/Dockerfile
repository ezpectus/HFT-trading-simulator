# Build stage
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --silent

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
