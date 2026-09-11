# ==============================================================================
# Production Dockerfile for Frontend Service (Block Health Chain Web Client)
# Multi-Stage Build: Node 20 LTS (Vite Build) -> Nginx Alpine (Static Hosting)
# Optimized for DigitalOcean App Platform & Container Runtimes
# ==============================================================================

# --- Stage 1: Build Artifacts ---
FROM node:20-alpine AS builder
WORKDIR /app

# Build arguments for Vite compilation (baked into client-side JS bundles at build time)
ARG VITE_API_URL
ARG VITE_APP_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm ci

# Copy full frontend application source
COPY . .

# Run production Vite build (generates /app/dist)
RUN npm run build

# --- Stage 2: Production Nginx Server ---
FROM nginx:1.25-alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx configuration with SPA fallback routing and caching
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

# Launch Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
