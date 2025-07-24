#!/bin/bash

# Postman Governance Stack - One-Command Deployment Script
# Automated setup for production deployment with Docker Compose

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}🚀 Postman Governance Stack - Automated Deployment${NC}"
echo "============================================================="
echo

# Parse command line arguments
DEPLOYMENT_TYPE="production"
SKIP_SECURITY=false
GRAFANA_DOMAIN=""
API_DOMAIN=""
ENABLE_TLS=true
BACKUP_EXISTING=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --dev|--development)
      DEPLOYMENT_TYPE="development"
      ENABLE_TLS=false
      shift
      ;;
    --staging)
      DEPLOYMENT_TYPE="staging"
      shift
      ;;
    --production)
      DEPLOYMENT_TYPE="production"
      shift
      ;;
    --skip-security)
      SKIP_SECURITY=true
      shift
      ;;
    --grafana-domain)
      GRAFANA_DOMAIN="$2"
      shift 2
      ;;
    --api-domain)
      API_DOMAIN="$2"
      shift 2
      ;;
    --no-tls)
      ENABLE_TLS=false
      shift
      ;;
    --no-backup)
      BACKUP_EXISTING=false
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo
      echo "Options:"
      echo "  --dev, --development    Deploy for development (default: production)"
      echo "  --staging              Deploy for staging environment"
      echo "  --production           Deploy for production environment"
      echo "  --skip-security        Skip security setup (not recommended)"
      echo "  --grafana-domain       Grafana domain name (e.g., dashboards.company.com)"
      echo "  --api-domain           API domain name (e.g., api.company.com)"
      echo "  --no-tls              Disable TLS/SSL (not recommended for production)"
      echo "  --no-backup           Skip backup of existing deployment"
      echo "  -h, --help            Show this help message"
      echo
      echo "Examples:"
      echo "  $0                                    # Production deployment with defaults"
      echo "  $0 --dev                             # Development deployment"
      echo "  $0 --grafana-domain grafana.acme.com # Production with custom domain"
      echo "  $0 --staging --no-tls                # Staging without TLS"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Unknown argument: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}📋 Deployment Configuration:${NC}"
echo "• Environment: $DEPLOYMENT_TYPE"
echo "• TLS Enabled: $ENABLE_TLS"
echo "• Security Setup: $([ "$SKIP_SECURITY" = true ] && echo "Skipped" || echo "Enabled")"
echo "• Grafana Domain: ${GRAFANA_DOMAIN:-"localhost"}"
echo "• API Domain: ${API_DOMAIN:-"localhost"}"
echo "• Backup Existing: $BACKUP_EXISTING"
echo

# Check prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

if ! command_exists docker; then
    echo -e "${RED}❌ Docker is required but not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker Compose is required but not installed${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker daemon is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites verified${NC}"
echo

# Backup existing deployment if requested
if [ "$BACKUP_EXISTING" = true ] && [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    echo -e "${BLUE}💾 Backing up existing deployment...${NC}"
    BACKUP_DIR="$PROJECT_ROOT/backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup configuration files
    [ -f "$PROJECT_ROOT/.env" ] && cp "$PROJECT_ROOT/.env" "$BACKUP_DIR/"
    [ -f "$PROJECT_ROOT/docker-compose.yml" ] && cp "$PROJECT_ROOT/docker-compose.yml" "$BACKUP_DIR/"
    [ -d "$PROJECT_ROOT/grafana" ] && cp -r "$PROJECT_ROOT/grafana" "$BACKUP_DIR/"
    [ -d "$PROJECT_ROOT/data" ] && cp -r "$PROJECT_ROOT/data" "$BACKUP_DIR/"
    
    echo -e "${GREEN}✅ Backup created at: $BACKUP_DIR${NC}"
    echo
fi

# Setup security credentials
if [ "$SKIP_SECURITY" = false ]; then
    echo -e "${BLUE}🔐 Setting up security...${NC}"
    if [ -f "$SCRIPT_DIR/setup-security.sh" ]; then
        # Run security setup non-interactively for automation
        export POSTMAN_API_KEY="${POSTMAN_API_KEY:-}"
        bash "$SCRIPT_DIR/setup-security.sh" --automated
    else
        echo -e "${YELLOW}⚠️ Security setup script not found. Creating minimal secure config...${NC}"
        
        # Generate basic security credentials
        JWT_SECRET=$(openssl rand -base64 64 | tr -d "\n")
        ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-16)
        SERVICE_KEY="PGSK-$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)"
        
        # Create .env if it doesn't exist
        if [ ! -f "$PROJECT_ROOT/.env" ]; then
            cat > "$PROJECT_ROOT/.env" <<EOF
# Generated by automated deployment
POSTMAN_API_KEY=PMAK-your-api-key-here
JWT_SECRET=$JWT_SECRET
GOVERNANCE_ADMIN_PASSWORD=$ADMIN_PASSWORD
GOVERNANCE_SERVICE_KEY=$SERVICE_KEY
AUTHENTICATION_ENABLED=true
NODE_ENV=$DEPLOYMENT_TYPE
EOF
            chmod 600 "$PROJECT_ROOT/.env"
        fi
    fi
    echo -e "${GREEN}✅ Security configured${NC}"
else
    echo -e "${YELLOW}⚠️ Security setup skipped (not recommended for production)${NC}"
fi

# Create deployment-specific Docker Compose file
echo -e "${BLUE}🐳 Creating Docker Compose configuration...${NC}"

COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
COMPOSE_OVERRIDE=""

case "$DEPLOYMENT_TYPE" in
    "development")
        COMPOSE_OVERRIDE="$PROJECT_ROOT/docker-compose.dev.yml"
        ;;
    "staging")
        COMPOSE_OVERRIDE="$PROJECT_ROOT/docker-compose.staging.yml"
        ;;
    "production")
        COMPOSE_OVERRIDE="$PROJECT_ROOT/docker-compose.prod.yml"
        ;;
esac

# Base Docker Compose configuration
cat > "$COMPOSE_FILE" <<EOF
version: '3.8'

services:
  governance-collector:
    build:
      context: ./collector
      dockerfile: Dockerfile
    container_name: postman-governance-collector
    restart: unless-stopped
    environment:
      - NODE_ENV=$DEPLOYMENT_TYPE
    env_file:
      - .env
    ports:
      - "3001:3001"
    volumes:
      - ./data:/app/data
      - ./config:/app/config:ro
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - postman-governance

  grafana:
    image: grafana/grafana:latest
    container_name: postman-grafana
    restart: unless-stopped
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_ADMIN_PASSWORD:-admin}
      - GF_SECURITY_SECRET_KEY=\${GRAFANA_SECRET_KEY:-your-secret-key}
      - GF_SERVER_DOMAIN=\${GRAFANA_DOMAIN:-localhost}
      - GF_SERVER_ROOT_URL=\${GRAFANA_ROOT_URL:-http://localhost:3000}
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro
    depends_on:
      - governance-collector
    networks:
      - postman-governance

  nginx:
    image: nginx:alpine
    container_name: postman-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - governance-collector
      - grafana
    networks:
      - postman-governance

volumes:
  grafana-data:
    driver: local

networks:
  postman-governance:
    driver: bridge
EOF

# Create environment-specific overrides
if [ "$DEPLOYMENT_TYPE" = "development" ]; then
    cat > "$COMPOSE_OVERRIDE" <<EOF
version: '3.8'

services:
  governance-collector:
    build:
      target: development
    volumes:
      - ./collector/src:/app/src
      - ./collector/test:/app/test
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
    command: ["npm", "run", "dev"]

  grafana:
    environment:
      - GF_LOG_LEVEL=debug
      - GF_SECURITY_ALLOW_EMBEDDING=true
    ports:
      - "3000:3000"
EOF
elif [ "$DEPLOYMENT_TYPE" = "production" ]; then
    cat > "$COMPOSE_OVERRIDE" <<EOF
version: '3.8'

services:
  governance-collector:
    build:
      target: production
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "0.5"
        reservations:
          memory: 256M
          cpus: "0.25"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  grafana:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.3"
    environment:
      - GF_LOG_LEVEL=info
      - GF_ANALYTICS_REPORTING_ENABLED=false
      - GF_ANALYTICS_CHECK_FOR_UPDATES=false
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  nginx:
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: "0.2"
EOF
fi

# Create nginx configuration
echo -e "${BLUE}🌐 Setting up reverse proxy...${NC}"
mkdir -p "$PROJECT_ROOT/nginx/conf.d"

if [ "$ENABLE_TLS" = true ]; then
    # TLS-enabled configuration
    cat > "$PROJECT_ROOT/nginx/conf.d/default.conf" <<EOF
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name ${API_DOMAIN:-_} ${GRAFANA_DOMAIN:-_};
    return 301 https://\$server_name\$request_uri;
}

# API Server (HTTPS)
server {
    listen 443 ssl http2;
    server_name ${API_DOMAIN:-localhost};

    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://governance-collector:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

# Grafana Server (HTTPS)
server {
    listen 443 ssl http2;
    server_name ${GRAFANA_DOMAIN:-localhost};

    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://grafana:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
else
    # HTTP-only configuration
    cat > "$PROJECT_ROOT/nginx/conf.d/default.conf" <<EOF
# API Server
server {
    listen 80;
    server_name ${API_DOMAIN:-localhost};

    location / {
        proxy_pass http://governance-collector:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
    }
}

# Grafana Server
server {
    listen 80;
    server_name ${GRAFANA_DOMAIN:-localhost};

    location / {
        proxy_pass http://grafana:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
    }
}
EOF
fi

# Create necessary directories
mkdir -p "$PROJECT_ROOT/data"
mkdir -p "$PROJECT_ROOT/logs"
mkdir -p "$PROJECT_ROOT/grafana/provisioning/datasources"
mkdir -p "$PROJECT_ROOT/grafana/provisioning/dashboards"
mkdir -p "$PROJECT_ROOT/grafana/dashboards"

# Set up Grafana provisioning
cat > "$PROJECT_ROOT/grafana/provisioning/datasources/postman.yml" <<EOF
apiVersion: 1

datasources:
  - name: Postman Governance API
    type: infinity
    url: http://governance-collector:3001
    access: proxy
    isDefault: true
    jsonData:
      url: http://governance-collector:3001
      timeout: 60
      max_connections: 10
EOF

cat > "$PROJECT_ROOT/grafana/provisioning/dashboards/postman.yml" <<EOF
apiVersion: 1

providers:
  - name: 'Postman Governance Dashboards'
    orgId: 1
    folder: 'Postman Governance'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
EOF

# Generate TLS certificates if needed
if [ "$ENABLE_TLS" = true ]; then
    echo -e "${BLUE}🔒 Setting up TLS certificates...${NC}"
    mkdir -p "$PROJECT_ROOT/certs"
    
    if [ ! -f "$PROJECT_ROOT/certs/server.crt" ]; then
        # Generate self-signed certificates for development/staging
        if [ "$DEPLOYMENT_TYPE" != "production" ]; then
            echo -e "${YELLOW}⚠️ Generating self-signed certificates for $DEPLOYMENT_TYPE${NC}"
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout "$PROJECT_ROOT/certs/server.key" \
                -out "$PROJECT_ROOT/certs/server.crt" \
                -subj "/C=US/ST=State/L=City/O=Organization/CN=${API_DOMAIN:-localhost}"
            chmod 600 "$PROJECT_ROOT/certs"/*
        else
            echo -e "${RED}❌ Production deployment requires valid TLS certificates${NC}"
            echo "Please provide valid certificates in the certs/ directory:"
            echo "• certs/server.crt - Certificate file"
            echo "• certs/server.key - Private key file"
            echo
            echo "For Let's Encrypt certificates, run:"
            echo "certbot certonly --standalone -d $API_DOMAIN -d $GRAFANA_DOMAIN"
            exit 1
        fi
    fi
fi

# Build and start services
echo -e "${BLUE}🏗️ Building and starting services...${NC}"

cd "$PROJECT_ROOT"

# Pull latest images
echo "Pulling latest Docker images..."
if [ -f "$COMPOSE_OVERRIDE" ]; then
    docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" pull --ignore-pull-failures
else
    docker-compose -f "$COMPOSE_FILE" pull --ignore-pull-failures
fi

# Build services
echo "Building services..."
if [ -f "$COMPOSE_OVERRIDE" ]; then
    docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" build --no-cache
else
    docker-compose -f "$COMPOSE_FILE" build --no-cache
fi

# Start services
echo "Starting services..."
if [ -f "$COMPOSE_OVERRIDE" ]; then
    docker-compose -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE" up -d
else
    docker-compose -f "$COMPOSE_FILE" up -d
fi

# Wait for services to be healthy
echo -e "${BLUE}⏳ Waiting for services to start...${NC}"
sleep 10

# Check service health
RETRY_COUNT=0
MAX_RETRIES=30

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f -s "http://localhost:3001/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Governance Collector is healthy${NC}"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for Governance Collector... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 5
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}❌ Governance Collector failed to start properly${NC}"
    echo "Check logs with: docker-compose logs governance-collector"
    exit 1
fi

# Verify Grafana
if curl -f -s "http://localhost:3000/api/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Grafana is healthy${NC}"
else
    echo -e "${YELLOW}⚠️ Grafana may still be starting up${NC}"
fi

# Print deployment summary
echo
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo "=============================================="
echo
echo -e "${BLUE}📋 Access Information:${NC}"

if [ "$ENABLE_TLS" = true ]; then
    echo "• Governance API: https://${API_DOMAIN:-localhost}"
    echo "• Grafana Dashboard: https://${GRAFANA_DOMAIN:-localhost}"
else
    echo "• Governance API: http://${API_DOMAIN:-localhost}:3001"
    echo "• Grafana Dashboard: http://${GRAFANA_DOMAIN:-localhost}:3000"
fi

echo
echo -e "${BLUE}🔐 Default Credentials:${NC}"
echo "• Grafana: admin / \${GRAFANA_ADMIN_PASSWORD} (check .env file)"

if [ "$SKIP_SECURITY" = false ]; then
    echo "• API Authentication: Check SECURITY_CREDENTIALS.txt"
fi

echo
echo -e "${BLUE}🛠️ Management Commands:${NC}"
echo "• View logs: docker-compose logs -f"
echo "• Stop services: docker-compose down"
echo "• Restart services: docker-compose restart"
echo "• Update services: docker-compose pull && docker-compose up -d"
echo

if [ -f "$PROJECT_ROOT/SECURITY_CREDENTIALS.txt" ]; then
    echo -e "${RED}🚨 IMPORTANT:${NC}"
    echo "• Security credentials are saved in SECURITY_CREDENTIALS.txt"
    echo "• Delete this file after saving credentials securely"
    echo "• Change default passwords immediately"
fi

echo
echo -e "${GREEN}Deployment complete! 🚀${NC}"