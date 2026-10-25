# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
