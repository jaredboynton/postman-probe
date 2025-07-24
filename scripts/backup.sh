#!/bin/bash
set -euo pipefail

# Postman Governance Stack Backup Script
# Creates a complete backup of the deployment including database and configuration

echo "🗄️  Creating Postman Governance Stack Backup"
echo "=============================================="

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Check if Docker Compose is available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    print_error "Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Create backup directory with timestamp
BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Creating backup in: $BACKUP_DIR"

# Backup database
echo ""
echo "📊 Backing up database..."
if $COMPOSE_CMD ps collector | grep -q "Up"; then
    if docker compose exec -T collector test -f /app/data/governance.db 2>/dev/null; then
        # Create database backup using SQLite backup command
        $COMPOSE_CMD exec -T collector sqlite3 /app/data/governance.db ".backup /app/data/backup.db"
        $COMPOSE_CMD cp collector:/app/data/backup.db "$BACKUP_DIR/governance.db"
        $COMPOSE_CMD exec -T collector rm -f /app/data/backup.db
        print_success "Database backed up successfully"
        
        # Get database stats
        local db_size=$(du -h "$BACKUP_DIR/governance.db" | cut -f1)
        local record_count=$($COMPOSE_CMD exec -T collector sqlite3 /app/data/governance.db "SELECT count(*) FROM governance_metrics;" 2>/dev/null || echo "0")
        echo "  Database size: $db_size"
        echo "  Metrics records: $record_count"
    else
        print_warning "Database file not found - may not be initialized yet"
    fi
else
    print_warning "Collector service not running - cannot backup database"
fi

# Backup configuration files
echo ""
echo "⚙️  Backing up configuration..."
if [[ -d "config" ]]; then
    cp -r config "$BACKUP_DIR/"
    print_success "Configuration files backed up"
else
    print_warning "Config directory not found"
fi

# Backup environment file
if [[ -f ".env" ]]; then
    cp .env "$BACKUP_DIR/"
    print_success "Environment file backed up"
else
    print_warning "No .env file found"
fi

# Backup Docker Compose file
if [[ -f "docker-compose.yml" ]]; then
    cp docker-compose.yml "$BACKUP_DIR/"
    print_success "Docker Compose file backed up"
fi

# Backup custom scripts if they exist
if [[ -d "scripts" ]]; then
    cp -r scripts "$BACKUP_DIR/"
    print_success "Custom scripts backed up"
fi

# Create backup metadata
cat > "$BACKUP_DIR/backup-info.json" << EOF
{
  "backup_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "backup_version": "1.0.0",
  "hostname": "$(hostname)",
  "docker_compose_version": "$($COMPOSE_CMD version --short 2>/dev/null || echo 'unknown')",
  "services_running": [
$(docker compose ps --services --filter status=running | sed 's/^/    "/' | sed 's/$/"/' | paste -sd, -)
  ],
  "backup_contents": [
$(find "$BACKUP_DIR" -type f -not -name "backup-info.json" | sed "s|$BACKUP_DIR/||" | sed 's/^/    "/' | sed 's/$/"/' | paste -sd, -)
  ]
}
EOF

# Create compressed archive
echo ""
echo "📦 Creating compressed archive..."
tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR"

# Generate checksum
sha256sum "${BACKUP_DIR}.tar.gz" > "${BACKUP_DIR}.tar.gz.sha256"

# Get final size
ARCHIVE_SIZE=$(du -h "${BACKUP_DIR}.tar.gz" | cut -f1)

# Cleanup temporary directory
rm -rf "$BACKUP_DIR"

# Success summary
echo ""
echo "🎉 Backup completed successfully!"
echo "================================="
echo "📁 Archive: ${BACKUP_DIR}.tar.gz"
echo "📏 Size: $ARCHIVE_SIZE"
echo "🔐 Checksum: ${BACKUP_DIR}.tar.gz.sha256"
echo ""
echo "To restore this backup:"
echo "  ./scripts/restore.sh ${BACKUP_DIR}.tar.gz"
echo ""
print_success "Backup process completed"