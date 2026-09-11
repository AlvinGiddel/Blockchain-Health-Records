# ==============================================================================
# Production Dockerfile for Backend Service (Block Health Chain API)
# Optimized for DigitalOcean App Platform & Local Standalone Container Deployments
# Multi-Stage Build using official Node.js 20 LTS Alpine
# ==============================================================================

# --- Stage 1: Dependency Installation ---
FROM node:20-alpine AS deps
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies (bcryptjs is pure JS, no native build tools required)
RUN npm ci --only=production --ignore-scripts

# --- Stage 2: Lean Production Runtime ---
FROM node:20-alpine AS runner
WORKDIR /app

# Configure production environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Copy installed production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy backend application source code
COPY . .

# Expose backend API port (matching process.env.PORT || 5000)
EXPOSE 5000

# Health check to ensure Express listener and background services are active
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-5000}/api/health || exit 1

# Start server using standard Node runtime (triggers !process.env.VERCEL guard in server.js)
CMD ["node", "server.js"]
