#!/bin/bash
set -euo pipefail

# Postman Governance Stack Setup Script
# This script helps customers deploy the Postman Governance Stack securely

echo "🚀 Postman Governance Stack Setup"
echo "=================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if Docker is installed and running
check_docker() {
    print_step "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        echo "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    print_status "Docker is installed and running"
}

# Check if Docker Compose is available
check_docker_compose() {
    print_step "Checking Docker Compose availability..."
    
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        print_error "Docker Compose is not available. Please install Docker Compose."
        echo "Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    print_status "Docker Compose is available: $COMPOSE_CMD"
}

# Validate Postman API key format
validate_api_key() {
    local api_key="$1"
    
    if [[ ! $api_key =~ ^PMAK-[a-zA-Z0-9]{20,}-[a-zA-Z0-9]{20,}$ ]]; then
        print_error "Invalid Postman API key format. Expected format: PMAK-xxxxxxxxxx-xxxxxxxxxx"
        return 1
    fi
    
    return 0
}

# Test Postman API connectivity
test_postman_api() {
    local api_key="$1"
    
    print_step "Testing Postman API connectivity..."
    
    local response=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-API-Key: $api_key" \
        -H "Content-Type: application/json" \
        "https://api.getpostman.com/me")
    
    if [ "$response" = "200" ]; then
        print_status "Postman API connection successful"
        return 0
    else
        print_error "Postman API connection failed (HTTP $response)"
        return 1
    fi
}

# Generate secure secrets
generate_secrets() {
    print_step "Generating secure secrets..."
    
    # Generate random passwords and keys
    GRAFANA_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    GRAFANA_SECRET=$(openssl rand -hex 32)
    
    print_status "Secure secrets generated"
}

# Create environment file
create_env_file() {
    local api_key="$1"
    
    print_step "Creating environment configuration..."
    
    cat > .env << EOF
# Postman Governance Stack Configuration
# Generated on $(date)

# Postman API Configuration
POSTMAN_API_KEY=$api_key

# Security Configuration
GRAFANA_ADMIN_PASSWORD=$GRAFANA_PASSWORD
GRAFANA_SECRET_KEY=$GRAFANA_SECRET

# Default Configuration
DATABASE_PATH=/app/data/governance.db
API_PORT=3001
API_HOST=0.0.0.0
COLLECTION_SCHEDULE=0 */6 * * *
LOG_LEVEL=INFO
POSTMAN_RATE_LIMIT=280
NODE_ENV=production
EOF

    print_status "Environment file created: .env"
}

# Create Docker secrets files
create_docker_secrets() {
    local api_key="$1"
    
    print_step "Creating Docker secret files..."
    
    # Create secrets directory if it doesn't exist
    mkdir -p secrets
    
    # Create secret files for docker-compose
    echo "$api_key" > secrets/postman-api-key.txt
    echo "$GRAFANA_SECRET" > secrets/jwt-secret.txt
    
    # Set appropriate permissions
    chmod 600 secrets/postman-api-key.txt
    chmod 600 secrets/jwt-secret.txt
    
    print_status "Docker secret files created successfully"
    return 0
}

# Initialize data directories
init_directories() {
    print_step "Initializing data directories..."
    
    # Create data directories with proper permissions
    mkdir -p data/grafana
    mkdir -p data/governance
    mkdir -p logs
    
    # Set permissions for Grafana
    chown -R 472:472 data/grafana 2>/dev/null || {
        print_warning "Could not set Grafana data permissions. You may need to run as root."
    }
    
    print_status "Data directories initialized"
}

# Pull Docker images
pull_images() {
    print_step "Pulling Docker images..."
    
    $COMPOSE_CMD pull
    
    print_status "Docker images pulled successfully"
}

# Build collector image
build_collector() {
    print_step "Building governance collector image..."
    
    $COMPOSE_CMD build collector
    
    print_status "Governance collector image built"
}

# Start services
start_services() {
    print_step "Starting services..."
    
    $COMPOSE_CMD up -d
    
    print_status "Services started successfully"
}

# Wait for services to be healthy
wait_for_health() {
    print_step "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
            print_status "Governance collector is healthy"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "Services failed to become healthy within timeout"
            return 1
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    # Check Grafana
    attempt=1
    while [ $attempt -le $max_attempts ]; do
        if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
            print_status "Grafana is healthy"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            print_error "Grafana failed to become healthy within timeout"
            return 1
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    echo ""
    print_status "All services are healthy"
}

# Display final information
show_completion_info() {
    echo ""
    echo "🎉 Setup Complete!"
    echo "=================="
    echo ""
    echo "Services:"
    echo "  📊 Grafana Dashboard: http://localhost:3000"
    echo "     Username: admin"
    echo "     Password: $GRAFANA_PASSWORD"
    echo ""
    echo "  🔍 Governance API: http://localhost:3001"
    echo "     Health Check: http://localhost:3001/health"
    echo "     Metrics: http://localhost:3001/metrics"
    echo ""
    echo "Management Commands:"
    echo "  🔄 Restart services: $COMPOSE_CMD restart"
    echo "  📋 View logs: $COMPOSE_CMD logs -f"
    echo "  ⏹️  Stop services: $COMPOSE_CMD down"
    echo "  🗑️  Remove all data: $COMPOSE_CMD down -v"
    echo ""
    echo "Important Notes:"
    echo "  • Data is persisted in ./data/ directory"
    echo "  • Logs are available in ./logs/ directory"
    echo "  • Configuration can be modified in ./config/"
    echo "  • Governance data collection runs every 6 hours"
    echo ""
    print_status "Save your Grafana password: $GRAFANA_PASSWORD"
}

# Main setup function
main() {
    echo ""
    print_step "Starting Postman Governance Stack setup..."
    
    # Prerequisite checks
    check_docker
    check_docker_compose
    
    # Get Postman API key
    POSTMAN_API_KEY=""
    
    # Check if .env file exists and contains API key
    if [ -f ".env" ]; then
        print_step "Found existing .env file, checking for API key..."
        POSTMAN_API_KEY=$(grep "^POSTMAN_API_KEY=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        
        if [ -n "$POSTMAN_API_KEY" ]; then
            print_status "Using existing Postman API key from .env file"
        fi
    fi
    
    # If no API key found, prompt for it
    if [ -z "$POSTMAN_API_KEY" ]; then
        echo ""
        echo "Please provide your Postman API key."
        echo "You can find this at: https://postman.postman.co/settings/me/api-keys"
        echo ""
        read -p "Postman API Key: " -r POSTMAN_API_KEY
        
        if [ -z "$POSTMAN_API_KEY" ]; then
            print_error "Postman API key is required"
            exit 1
        fi
    fi
    
    # Validate API key
    if ! validate_api_key "$POSTMAN_API_KEY"; then
        exit 1
    fi
    
    # Test API connectivity
    if ! test_postman_api "$POSTMAN_API_KEY"; then
        print_error "Please check your API key and network connectivity"
        exit 1
    fi
    
    # Generate secrets
    generate_secrets
    
    # Create configuration
    create_env_file "$POSTMAN_API_KEY"
    
    # Try to create Docker secrets (may fail if not in swarm mode)
    create_docker_secrets "$POSTMAN_API_KEY" || true
    
    # Initialize directories
    init_directories
    
    # Pull and build images
    pull_images
    build_collector
    
    # Start services
    start_services
    
    # Wait for health
    wait_for_health
    
    # Show completion info
    show_completion_info
}

# Run main function
main "$@"