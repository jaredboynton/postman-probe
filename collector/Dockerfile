# Multi-stage build for security and optimization
FROM node:18-alpine AS builder

# Install security updates and build tools first
RUN apk update && apk upgrade && \
    apk add --no-cache python3 make g++ && \
    rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Add package files first for better layer caching
COPY package*.json ./

# Install dependencies with security optimizations
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force && \
    # Remove unnecessary files to reduce layer size
    find node_modules -name "*.md" -delete && \
    find node_modules -name "*.ts" -delete && \
    find node_modules -name "test" -type d -exec rm -rf {} + 2>/dev/null || true

# Production stage - use specific Node.js version for reproducibility
FROM node:18.19.1-alpine3.19

# Metadata labels for better tracking
LABEL org.opencontainers.image.title="Postman Governance Collector"
LABEL org.opencontainers.image.description="Secure data collector for Postman API governance metrics"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Postman Governance Team"
LABEL org.opencontainers.image.licenses="MIT"

# Security: Create non-root user with explicit UID/GID
RUN addgroup -g 1001 governance && \
    adduser -D -u 1001 -G governance governance

# Security: Install security updates and minimal required packages
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
        sqlite \
        curl \
        dumb-init \
        ca-certificates && \
    # Remove package cache and temporary files
    rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Set working directory
WORKDIR /app

# Copy dependencies from builder stage with minimal privileges
COPY --from=builder --chown=governance:governance /app/node_modules ./node_modules

# Copy application source with proper ownership
COPY --chown=governance:governance ./src ./src
COPY --chown=governance:governance ./package.json ./
COPY --chown=governance:governance ./config/governance-collector.yml ./config/

# Create necessary directories with proper permissions and security
RUN mkdir -p /app/data /app/logs && \
    chown -R governance:governance /app/data /app/logs && \
    chmod 755 /app/data /app/logs && \
    # Create non-writable directories for security
    mkdir -p /app/config && \
    chmod 755 /app/config

# Add security: Remove write permissions from application code
RUN find /app/src -type f -exec chmod 444 {} \; && \
    find /app/src -type d -exec chmod 555 {} \; && \
    chmod 444 /app/package.json && \
    chmod -R 555 /app/node_modules

# Switch to non-root user early for security
USER governance

# Security: Verify non-root execution
RUN id && echo "Running as: $(whoami)"

# Expose port (documentation only)
EXPOSE 3001

# Health check with improved reliability
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD curl -f http://localhost:3001/health || exit 1

# Environment variables for production
ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false
ENV NODE_OPTIONS="--max-old-space-size=512"

# Use dumb-init to handle signals properly and prevent zombie processes
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start the application with explicit node binary
CMD ["node", "--enable-source-maps", "src/main.js"]