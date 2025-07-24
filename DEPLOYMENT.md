# Postman Governance Stack - Deployment Guide

This guide provides comprehensive instructions for deploying the Postman Governance Stack in various environments, from development to enterprise production.

## Table of Contents

- [Quick Start](#quick-start)
- [Deployment Methods](#deployment-methods)
- [Environment-Specific Configurations](#environment-specific-configurations)
- [Security Configuration](#security-configuration)
- [Monitoring and Observability](#monitoring-and-observability)
- [Scaling and Performance](#scaling-and-performance)
- [Troubleshooting](#troubleshooting)
- [Maintenance and Updates](#maintenance-and-updates)

## Quick Start

### One-Command Deployment

For the fastest deployment experience, use our automated deployment script:

```bash
# Production deployment with automatic security setup
./scripts/deploy.sh

# Development deployment
./scripts/deploy.sh --dev

# Custom domain deployment
./scripts/deploy.sh --grafana-domain dashboards.company.com --api-domain api.company.com
```

### Manual Docker Compose

If you prefer manual control:

```bash
# 1. Set up security credentials
./scripts/setup-security.sh

# 2. Start services
docker-compose up -d

# 3. Access the applications
# Grafana: http://localhost:3000
# API: http://localhost:3001
```

## Deployment Methods

### 1. Docker Compose (Recommended)

#### Prerequisites
- Docker 20.10+ and Docker Compose 2.0+
- 2GB RAM minimum, 4GB recommended
- 10GB disk space for logs and data

#### Basic Deployment
```bash
git clone <repository-url>
cd postman-governance-stack
./scripts/deploy.sh
```

#### Custom Configuration
```bash
# Copy and modify environment file
cp .env.example .env
vim .env

# Use specific compose file
docker-compose -f docker-compose.prod.yml up -d
```

### 2. Kubernetes Deployment

#### Helm Chart Deployment
```bash
# Add the Helm repository
helm repo add postman-governance ./helm/postman-governance

# Install with custom values
helm install governance postman-governance/postman-governance \
  --set api.domain=api.company.com \
  --set grafana.domain=dashboards.company.com \
  --set ingress.tls.enabled=true
```

#### Manual Kubernetes Manifests
```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/deployments.yaml
kubectl apply -f k8s/services.yaml
kubectl apply -f k8s/ingress.yaml
```

### 3. Cloud Platform Deployments

#### AWS ECS with Fargate
```bash
# Deploy using AWS CDK
cd aws-cdk
npm install
cdk bootstrap
cdk deploy PostmanGovernanceStack
```

#### Azure Container Instances
```bash
# Deploy using Azure CLI
az group create --name postman-governance --location eastus
az deployment group create \
  --resource-group postman-governance \
  --template-file azure/main.bicep \
  --parameters @azure/parameters.json
```

#### Google Cloud Run
```bash
# Build and deploy to Cloud Run
gcloud builds submit --tag gcr.io/PROJECT_ID/governance-collector
gcloud run deploy governance-collector \
  --image gcr.io/PROJECT_ID/governance-collector \
  --platform managed \
  --region us-central1
```

## Environment-Specific Configurations

### Development Environment

**Characteristics:**
- Single node deployment
- Simplified security
- Debug logging enabled
- Hot reloading for development

**Deployment:**
```bash
./scripts/deploy.sh --dev
```

**Configuration:**
```yaml
# docker-compose.dev.yml
services:
  governance-collector:
    build:
      target: development
    volumes:
      - ./collector/src:/app/src
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
    command: ["npm", "run", "dev"]
```

### Staging Environment

**Characteristics:**
- Production-like configuration
- Reduced resource allocation
- Enhanced monitoring
- Integration testing support

**Deployment:**
```bash
./scripts/deploy.sh --staging --grafana-domain staging-dashboards.company.com
```

**Configuration:**
```yaml
# docker-compose.staging.yml
services:
  governance-collector:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: "0.3"
    environment:
      - NODE_ENV=staging
      - LOG_LEVEL=info
```

### Production Environment

**Characteristics:**
- High availability
- Full security hardening
- Comprehensive monitoring
- Backup and disaster recovery

**Deployment:**
```bash
./scripts/deploy.sh --production \
  --grafana-domain dashboards.company.com \
  --api-domain api.company.com
```

**Configuration:**
```yaml
# docker-compose.prod.yml
services:
  governance-collector:
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 512M
          cpus: "0.5"
        reservations:
          memory: 256M
          cpus: "0.25"
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=warn
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Security Configuration

### Authentication Setup

#### Automated Security Setup
```bash
# Run with prompts
./scripts/setup-security.sh

# Run automated (for CI/CD)
POSTMAN_API_KEY="PMAK-xxx" ./scripts/setup-security.sh --automated
```

#### Manual Security Configuration

1. **Generate JWT Secret:**
```bash
openssl rand -base64 64
```

2. **Create API Keys:**
```bash
# Service account key
echo "PGSK-$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-32)"
```

3. **Set Strong Passwords:**
```bash
# Generate secure password
openssl rand -base64 16 | tr -d '=+/'
```

### TLS/SSL Configuration

#### Development (Self-Signed)
```bash
# Automatic generation during deployment
./scripts/deploy.sh --dev  # Generates self-signed certs
```

#### Production (Let's Encrypt)
```bash
# Using Certbot
certbot certonly --standalone \
  -d api.company.com \
  -d dashboards.company.com

# Copy certificates
cp /etc/letsencrypt/live/api.company.com/fullchain.pem ./certs/server.crt
cp /etc/letsencrypt/live/api.company.com/privkey.pem ./certs/server.key
```

#### Production (Corporate CA)
```bash
# Copy your corporate certificates
cp /path/to/corporate.crt ./certs/server.crt
cp /path/to/corporate.key ./certs/server.key
chmod 600 ./certs/*
```

### Network Security

#### Firewall Configuration
```bash
# Allow only necessary ports
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 3000/tcp  # Block direct Grafana access
ufw deny 3001/tcp  # Block direct API access
```

#### Docker Network Isolation
```yaml
# docker-compose.yml
networks:
  postman-governance:
    driver: bridge
    internal: true  # No external access
  web:
    driver: bridge  # Only nginx exposed
```

## Monitoring and Observability

### Health Checks

#### Application Health
```bash
# Check collector health
curl -f http://localhost:3001/health

# Check Grafana health
curl -f http://localhost:3000/api/health
```

#### Docker Health Status
```bash
# View container health
docker ps --filter "health=unhealthy"

# View health check logs
docker inspect --format='{{json .State.Health}}' postman-governance-collector
```

### Logging

#### Centralized Logging (ELK Stack)
```yaml
# docker-compose.yml
services:
  governance-collector:
    logging:
      driver: "fluentd"
      options:
        fluentd-address: "localhost:24224"
        tag: "governance.collector"
```

#### Log Rotation
```yaml
# docker-compose.yml
services:
  governance-collector:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Metrics and Alerting

#### Prometheus Integration
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'governance-collector'
    static_configs:
      - targets: ['governance-collector:3001']
    metrics_path: '/metrics'
```

#### Grafana Alerting
```json
{
  "alert": {
    "conditions": [
      {
        "query": {
          "params": ["A", "5m", "now"]
        },
        "reducer": {
          "type": "last",
          "params": []
        },
        "evaluator": {
          "params": [90],
          "type": "lt"
        }
      }
    ],
    "executionErrorState": "alerting",
    "frequency": "60s",
    "handler": 1,
    "name": "Governance Score Alert",
    "noDataState": "no_data"
  }
}
```

## Scaling and Performance

### Horizontal Scaling

#### Docker Swarm
```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.swarm.yml governance

# Scale services
docker service scale governance_collector=3
```

#### Kubernetes Horizontal Pod Autoscaler
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: governance-collector-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: governance-collector
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Database Optimization

#### SQLite Performance Tuning
```javascript
// config/governance-collector.yml
database:
  sqlite:
    options:
      journal_mode: WAL
      synchronous: NORMAL
      cache_size: -64000  # 64MB cache
      temp_store: MEMORY
      mmap_size: 268435456  # 256MB
```

#### Database Backup Strategy
```bash
# Automated backup script
#!/bin/bash
BACKUP_DIR="/app/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
sqlite3 /app/data/governance.db ".backup '$BACKUP_DIR/governance_$DATE.db'"

# Compress backup
gzip "$BACKUP_DIR/governance_$DATE.db"

# Clean old backups (keep 30 days)
find "$BACKUP_DIR" -name "governance_*.db.gz" -mtime +30 -delete
```

### Performance Monitoring

#### Resource Usage Monitoring
```bash
# Monitor container resources
docker stats postman-governance-collector

# Check database size
ls -lh /app/data/governance.db

# Monitor API response times
curl -w "@curl-format.txt" -s -o /dev/null http://localhost:3001/api/governance/summary
```

## Troubleshooting

### Common Issues

#### 1. Container Won't Start
```bash
# Check logs
docker-compose logs governance-collector

# Common causes:
# - Missing environment variables
# - Database permissions
# - Port conflicts
```

#### 2. Authentication Failures
```bash
# Verify JWT secret
echo $JWT_SECRET | base64 -d

# Check user creation
docker-compose exec governance-collector npm run create-user

# Reset admin password
docker-compose exec governance-collector npm run reset-admin
```

#### 3. Database Issues
```bash
# Check database integrity
sqlite3 /app/data/governance.db "PRAGMA integrity_check;"

# Rebuild indexes
sqlite3 /app/data/governance.db "REINDEX;"

# Check disk space
df -h /app/data
```

#### 4. API Rate Limiting
```bash
# Check Postman API limits
curl -H "X-API-Key: $POSTMAN_API_KEY" \
  https://api.getpostman.com/me

# Adjust rate limiting
# Edit config/governance-collector.yml
postman:
  rate_limit: 250  # Reduce from 280
```

### Debug Mode

#### Enable Debug Logging
```bash
# Temporary debug mode
docker-compose exec governance-collector \
  env LOG_LEVEL=debug npm start

# Persistent debug mode
echo "LOG_LEVEL=debug" >> .env
docker-compose restart governance-collector
```

#### Trace API Calls
```bash
# Enable API tracing
echo "TRACE_API_CALLS=true" >> .env
docker-compose restart governance-collector

# View trace logs
docker-compose logs -f governance-collector | grep "API_TRACE"
```

## Maintenance and Updates

### Regular Maintenance

#### Daily Tasks
```bash
#!/bin/bash
# daily-maintenance.sh

# Check service health
docker-compose ps

# Backup database
./scripts/backup-database.sh

# Clean old logs
docker system prune -f
```

#### Weekly Tasks
```bash
#!/bin/bash
# weekly-maintenance.sh

# Update Docker images
docker-compose pull

# Analyze database
sqlite3 /app/data/governance.db "ANALYZE;"

# Check disk usage
df -h /app/data /app/logs
```

#### Monthly Tasks
```bash
#!/bin/bash
# monthly-maintenance.sh

# Full backup
./scripts/full-backup.sh

# Security audit
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image postman-governance-collector:latest

# Update certificates (if needed)
certbot renew --nginx
```

### Updates and Upgrades

#### Application Updates
```bash
# Update to latest version
git pull origin main
docker-compose build --no-cache
docker-compose up -d
```

#### Database Migrations
```bash
# Run migrations
docker-compose exec governance-collector npm run migrate

# Verify migration
docker-compose exec governance-collector npm run migrate:status
```

#### Rollback Procedure
```bash
# Create rollback point
docker tag postman-governance-collector:latest \
  postman-governance-collector:rollback-$(date +%Y%m%d)

# Rollback if needed
docker-compose down
docker tag postman-governance-collector:rollback-20231201 \
  postman-governance-collector:latest
docker-compose up -d
```

## Support and Documentation

### Getting Help
- **Documentation**: Check README.md and inline code documentation
- **Logs**: Always check `docker-compose logs` for detailed error information
- **Health Checks**: Use `/health` endpoint for service status
- **Configuration**: Validate YAML configuration files before deployment

### Best Practices
1. **Always test deployments in staging first**
2. **Use environment-specific configuration files**
3. **Implement proper backup and monitoring**
4. **Keep secrets secure and rotate regularly**
5. **Monitor resource usage and scale appropriately**
6. **Keep software updated for security patches**

---

For more specific deployment scenarios or enterprise customization, please refer to the enterprise support documentation or contact the development team.