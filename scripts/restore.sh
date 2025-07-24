#!/bin/bash
set -euo pipefail

# Postman Governance Stack Restore Script
# Restores a complete backup of the deployment

echo "🔄 Postman Governance Stack Restore"
echo "===================================="

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

# Check arguments
if [[ $# -ne 1 ]]; then
    print_error "Usage: $0 <backup-file.tar.gz>"
    echo ""
    echo "Examples:"
    echo "  $0 backup-20250124-143022.tar.gz"
    echo "  $0 /path/to/backup-20250124-143022.tar.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Validate backup file
if [[ ! -f "$BACKUP_FILE" ]]; then
    print_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Check if Docker Compose is available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    print_error "Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

print_info "Restoring from: $BACKUP_FILE"

# Verify checksum if available
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [[ -f "$CHECKSUM_FILE" ]]; then
    echo ""
    echo "🔐 Verifying backup integrity..."
    if sha256sum -c "$CHECKSUM_FILE" --quiet; then
        print_success "Backup integrity verified"
    else
        print_error "Backup integrity check failed!"
        echo "The backup file may be corrupted or tampered with."
        read -p "Continue anyway? (y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    print_warning "No checksum file found - skipping integrity check"
fi

# Extract backup
echo ""
echo "📦 Extracting backup..."
BACKUP_DIR="${BACKUP_FILE%.tar.gz}"
tar -xzf "$BACKUP_FILE"

if [[ ! -d "$BACKUP_DIR" ]]; then
    print_error "Failed to extract backup or invalid backup structure"
    exit 1
fi

print_success "Backup extracted successfully"

# Show backup information if available
if [[ -f "$BACKUP_DIR/backup-info.json" ]]; then
    echo ""
    echo "📋 Backup Information:"
    if command -v jq &> /dev/null; then
        echo "  Date: $(jq -r '.backup_date' "$BACKUP_DIR/backup-info.json")"
        echo "  Hostname: $(jq -r '.hostname' "$BACKUP_DIR/backup-info.json")"
        echo "  Contents: $(jq -r '.backup_contents | join(", ")' "$BACKUP_DIR/backup-info.json")"
    else
        print_info "Install 'jq' to see detailed backup information"
    fi
fi

# Confirm restore operation
echo ""
print_warning "This will replace your current configuration and data!"
print_info "Current services will be stopped during the restore process."
echo ""
read -p "Are you sure you want to continue? (y/N): " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    rm -rf "$BACKUP_DIR"
    exit 0
fi

# Stop services
echo ""
echo "⏹️  Stopping services..."
$COMPOSE_CMD down || true
print_success "Services stopped"

# Restore database
echo ""
echo "📊 Restoring database..."
if [[ -f "$BACKUP_DIR/governance.db" ]]; then
    # Ensure data directory exists
    mkdir -p data
    
    # Copy database file
    cp "$BACKUP_DIR/governance.db" data/governance.db
    print_success "Database restored"
    
    # Set proper permissions
    chmod 644 data/governance.db
    
    # Show database info
    local db_size=$(du -h data/governance.db | cut -f1)
    echo "  Database size: $db_size"
else
    print_warning "No database backup found"
fi

# Restore configuration
echo ""
echo "⚙️  Restoring configuration..."
if [[ -d "$BACKUP_DIR/config" ]]; then
    # Backup current config if it exists
    if [[ -d "config" ]]; then
        mv config "config.backup.$(date +%Y%m%d-%H%M%S)"
        print_info "Current config backed up"
    fi
    
    cp -r "$BACKUP_DIR/config" .
    print_success "Configuration restored"
else
    print_warning "No configuration backup found"
fi

# Restore environment file
if [[ -f "$BACKUP_DIR/.env" ]]; then
    # Backup current .env if it exists
    if [[ -f ".env" ]]; then
        mv .env ".env.backup.$(date +%Y%m%d-%H%M%S)"
        print_info "Current .env backed up"
    fi
    
    cp "$BACKUP_DIR/.env" .
    print_success "Environment file restored"
else
    print_warning "No environment file backup found"
fi

# Restore Docker Compose file
if [[ -f "$BACKUP_DIR/docker-compose.yml" ]]; then
    # Backup current compose file if it exists
    if [[ -f "docker-compose.yml" ]]; then
        mv docker-compose.yml "docker-compose.yml.backup.$(date +%Y%m%d-%H%M%S)"
        print_info "Current Docker Compose file backed up"
    fi
    
    cp "$BACKUP_DIR/docker-compose.yml" .
    print_success "Docker Compose file restored"
fi

# Restore custom scripts
if [[ -d "$BACKUP_DIR/scripts" ]]; then
    # Backup current scripts if they exist
    if [[ -d "scripts" ]]; then
        mv scripts "scripts.backup.$(date +%Y%m%d-%H%M%S)"
        print_info "Current scripts backed up"
    fi
    
    cp -r "$BACKUP_DIR/scripts" .
    chmod +x scripts/*.sh
    print_success "Custom scripts restored"
fi

# Start services
echo ""
echo "🚀 Starting services..."
$COMPOSE_CMD up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 30

# Verify restoration
echo ""
echo "🧪 Verifying restoration..."

# Check service health
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Collector service is healthy"
else
    print_warning "Collector service health check failed"
fi

if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    print_success "Grafana service is healthy"
else
    print_warning "Grafana service health check failed"
fi

# Check database
if [[ -f "data/governance.db" ]]; then
    local record_count=$($COMPOSE_CMD exec -T collector sqlite3 /app/data/governance.db "SELECT count(*) FROM governance_metrics;" 2>/dev/null || echo "0")
    if [[ "$record_count" -gt 0 ]]; then
        print_success "Database contains $record_count metrics records"
    else
        print_warning "Database appears to be empty"
    fi
fi

# Cleanup
rm -rf "$BACKUP_DIR"

# Final status
echo ""
echo "🎉 Restore completed!"
echo "===================="
echo ""
echo "📊 Access your dashboards:"
echo "  Grafana: http://localhost:3000"
echo "  API: http://localhost:3001"
echo ""
echo "🔍 Check service status:"
echo "  docker compose ps"
echo "  docker compose logs -f"
echo ""
print_success "Restore process completed successfully"