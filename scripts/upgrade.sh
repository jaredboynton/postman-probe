#!/bin/bash
set -euo pipefail

# Postman Governance Stack Upgrade Script
# Safely upgrades the stack to the latest version with backup and rollback support

echo "⬆️  Postman Governance Stack Upgrade"
echo "====================================="

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if Docker Compose is available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    print_error "Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Parse command line arguments
SKIP_BACKUP=false
TARGET_VERSION=""
ROLLBACK=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --version)
            TARGET_VERSION="$2"
            shift 2
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --skip-backup    Skip creating backup before upgrade"
            echo "  --version TAG    Upgrade to specific version (default: latest)"
            echo "  --rollback       Rollback to previous version"
            echo "  --help           Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                        # Upgrade to latest version"
            echo "  $0 --version v1.2.0       # Upgrade to specific version"
            echo "  $0 --skip-backup          # Upgrade without backup"
            echo "  $0 --rollback             # Rollback to previous version"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Handle rollback
if [[ "$ROLLBACK" == true ]]; then
    echo "🔄 Rolling back to previous version..."
    
    # Find the most recent backup
    LATEST_BACKUP=$(ls -t backup-*.tar.gz 2>/dev/null | head -1 || echo "")
    
    if [[ -z "$LATEST_BACKUP" ]]; then
        print_error "No backup files found for rollback"
        echo "Available backups:"
        ls -la backup-*.tar.gz 2>/dev/null || echo "  (none)"
        exit 1
    fi
    
    print_info "Rolling back using: $LATEST_BACKUP"
    
    # Use restore script for rollback
    if [[ -f "scripts/restore.sh" ]]; then
        ./scripts/restore.sh "$LATEST_BACKUP"
    else
        print_error "Restore script not found"
        exit 1
    fi
    
    print_success "Rollback completed"
    exit 0
fi

# Get current version info
echo ""
echo "📋 Current Status:"
if $COMPOSE_CMD ps --services > /dev/null 2>&1; then
    echo "  Services: $($COMPOSE_CMD ps --services | wc -l) defined"
    echo "  Running: $($COMPOSE_CMD ps --services --filter status=running | wc -l) active"
    
    # Get current image versions
    if $COMPOSE_CMD ps collector | grep -q "Up"; then
        local collector_image=$($COMPOSE_CMD images collector --format json 2>/dev/null | jq -r '.Tag' 2>/dev/null || echo "unknown")
        echo "  Collector version: $collector_image"
    fi
else
    print_warning "Docker Compose project not found or not initialized"
fi

# Determine target version
if [[ -z "$TARGET_VERSION" ]]; then
    TARGET_VERSION="latest"
fi

print_info "Target version: $TARGET_VERSION"

# Pre-upgrade checks
echo ""
echo "🔍 Pre-upgrade checks..."

# Check available disk space
AVAILABLE_SPACE=$(df . | tail -1 | awk '{print $4}')
if [[ $AVAILABLE_SPACE -lt 1048576 ]]; then  # Less than 1GB
    print_warning "Low disk space available: $(df -h . | tail -1 | awk '{print $4}')"
    echo "Upgrade may fail if insufficient space for image downloads."
    read -p "Continue anyway? (y/N): " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if services are healthy before upgrade
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Current services are healthy"
else
    print_warning "Current services may not be healthy"
    echo "You may want to check service status before upgrading:"
    echo "  docker compose logs"
    echo ""
    read -p "Continue with upgrade? (y/N): " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create backup before upgrade
if [[ "$SKIP_BACKUP" == false ]]; then
    echo ""
    echo "💾 Creating pre-upgrade backup..."
    
    if [[ -f "scripts/backup.sh" ]]; then
        ./scripts/backup.sh
        print_success "Pre-upgrade backup completed"
    else
        print_warning "Backup script not found - skipping backup"
        read -p "Continue without backup? (y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    print_warning "Skipping backup as requested"
fi

# Pull latest images
echo ""
echo "📥 Pulling updated images..."
if [[ "$TARGET_VERSION" == "latest" ]]; then
    $COMPOSE_CMD pull
else
    # Update compose file to use specific version
    if [[ -f "docker-compose.yml" ]]; then
        # Create temporary compose file with specific version
        sed "s/:latest/:$TARGET_VERSION/g" docker-compose.yml > docker-compose.upgrade.yml
        $COMPOSE_CMD -f docker-compose.upgrade.yml pull
        mv docker-compose.upgrade.yml docker-compose.yml
    fi
fi

print_success "Images updated successfully"

# Stop services gracefully
echo ""
echo "⏹️  Stopping services for upgrade..."
$COMPOSE_CMD down --timeout 30
print_success "Services stopped"

# Check for database migrations or upgrades
echo ""
echo "🗄️  Checking for database updates..."
if [[ -f "data/governance.db" ]]; then
    # Backup database before potential schema changes
    cp data/governance.db "data/governance.db.pre-upgrade.$(date +%Y%m%d-%H%M%S)"
    print_success "Database backup created"
else
    print_info "No existing database found"
fi

# Start services with new images
echo ""
echo "🚀 Starting upgraded services..."
$COMPOSE_CMD up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to initialize..."
local max_attempts=60
local attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
        print_success "Services are responding"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        print_error "Services failed to start within timeout"
        echo ""
        echo "🔍 Troubleshooting steps:"
        echo "  1. Check logs: docker compose logs"
        echo "  2. Check service status: docker compose ps"
        echo "  3. Try manual restart: docker compose restart"
        echo ""
        echo "If issues persist, you can rollback:"
        echo "  $0 --rollback"
        exit 1
    fi
    
    echo -n "."
    sleep 2
    ((attempt++))
done

echo ""

# Verify upgrade success
echo ""
echo "🧪 Verifying upgrade..."

# Check service health
local health_status="unknown"
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    health_response=$(curl -s http://localhost:3001/health 2>/dev/null || echo "{}")
    health_status=$(echo "$health_response" | jq -r '.overall' 2>/dev/null || echo "unknown")
fi

if [[ "$health_status" == "healthy" ]]; then
    print_success "All services are healthy"
else
    print_warning "Services may not be fully healthy (status: $health_status)"
fi

# Check Grafana
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    print_success "Grafana is accessible"
else
    print_warning "Grafana may not be fully ready yet"
fi

# Get new version info
echo ""
echo "📋 Post-upgrade Status:"
if $COMPOSE_CMD ps collector | grep -q "Up"; then
    local new_collector_image=$($COMPOSE_CMD images collector --format json 2>/dev/null | jq -r '.Tag' 2>/dev/null || echo "unknown")
    echo "  Collector version: $new_collector_image"
fi

# Check database integrity
if [[ -f "data/governance.db" ]]; then
    local record_count=$($COMPOSE_CMD exec -T collector sqlite3 /app/data/governance.db "SELECT count(*) FROM governance_metrics;" 2>/dev/null || echo "0")
    echo "  Database records: $record_count"
fi

# Cleanup old images
echo ""
echo "🧹 Cleaning up old images..."
docker image prune -f --filter "dangling=true" > /dev/null 2>&1 || true
print_success "Cleanup completed"

# Final status
echo ""
echo "🎉 Upgrade completed successfully!"
echo "================================="
echo ""
echo "📊 Access your dashboards:"
echo "  Grafana: http://localhost:3000"
echo "  API: http://localhost:3001"
echo "  Health: http://localhost:3001/health"
echo ""
echo "🔍 Monitor services:"
echo "  docker compose ps"
echo "  docker compose logs -f"
echo ""
echo "💾 Backup files created:"
ls -la backup-*.tar.gz 2>/dev/null | tail -3 || echo "  (none)"
echo ""
print_success "Upgrade process completed successfully"

# Optionally run post-upgrade tests
echo ""
read -p "Run deployment validation tests? (y/N): " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [[ -f "test-deployment.sh" ]]; then
        echo ""
        ./test-deployment.sh
    else
        print_warning "Test script not found"
    fi
fi