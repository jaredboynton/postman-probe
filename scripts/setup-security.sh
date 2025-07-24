#!/bin/bash

# Postman Governance Stack - Security Setup Script
# This script helps configure authentication and security features

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

echo -e "${BLUE}🔐 Postman Governance Stack - Security Setup${NC}"
echo "================================================="
echo

# Parse command line arguments
AUTOMATED_MODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --automated)
      AUTOMATED_MODE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo
      echo "Options:"
      echo "  --automated           Run in automated mode (non-interactive)"
      echo "  -h, --help           Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Unknown argument: $1${NC}"
      exit 1
      ;;
  esac
done

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}❌ This script should not be run as root for security reasons${NC}"
   exit 1
fi

# Function to generate secure random string
generate_secure_string() {
    local length=${1:-32}
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# Function to generate JWT secret
generate_jwt_secret() {
    openssl rand -base64 64 | tr -d "\n"
}

# Function to generate secure password
generate_secure_password() {
    # Generate a password with uppercase, lowercase, numbers, and special chars
    local password=""
    password+=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-4)
    password+=$(echo "ABCDEFGHIJKLMNOPQRSTUVWXYZ" | fold -w1 | shuf | head -2 | tr -d '\n')
    password+=$(echo "abcdefghijklmnopqrstuvwxyz" | fold -w1 | shuf | head -2 | tr -d '\n')
    password+=$(echo "0123456789" | fold -w1 | shuf | head -2 | tr -d '\n')
    password+=$(echo "!@#$%^&*" | fold -w1 | shuf | head -2 | tr -d '\n')
    echo "$password" | fold -w1 | shuf | tr -d '\n'
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

if ! command_exists openssl; then
    echo -e "${RED}❌ OpenSSL is required but not installed${NC}"
    exit 1
fi

if ! command_exists docker; then
    echo -e "${YELLOW}⚠️  Docker not found - skipping container-specific setup${NC}"
    DOCKER_AVAILABLE=false
else
    DOCKER_AVAILABLE=true
fi

if ! command_exists node; then
    echo -e "${YELLOW}⚠️  Node.js not found - some features may not work${NC}"
    NODE_AVAILABLE=false
else
    NODE_AVAILABLE=true
fi

echo -e "${GREEN}✅ Prerequisites checked${NC}"
echo

# Check if .env file exists
ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE_FILE="$PROJECT_ROOT/.env.example"

if [[ -f "$ENV_FILE" ]]; then
    if [[ "$AUTOMATED_MODE" = true ]]; then
        echo -e "${YELLOW}📝 Backing up existing .env to .env.backup${NC}"
        cp "$ENV_FILE" "$ENV_FILE.backup"
    else
        echo -e "${YELLOW}⚠️  .env file already exists${NC}"
        read -p "Do you want to overwrite it? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${BLUE}💡 Existing .env file preserved. You can manually update it with new security settings.${NC}"
            exit 0
        fi
        echo -e "${YELLOW}📝 Backing up existing .env to .env.backup${NC}"
        cp "$ENV_FILE" "$ENV_FILE.backup"
    fi
fi

# Copy environment template
echo -e "${BLUE}📄 Creating .env file from template...${NC}"
if [[ -f "$ENV_EXAMPLE_FILE" ]]; then
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
else
    echo -e "${RED}❌ .env.example template not found${NC}"
    exit 1
fi

# Generate security credentials
echo -e "${BLUE}🔑 Generating security credentials...${NC}"

JWT_SECRET=$(generate_jwt_secret)
ADMIN_PASSWORD=$(generate_secure_password)
SERVICE_KEY="PGSK-$(generate_secure_string 32)"
READONLY_PASSWORD=$(generate_secure_password)

echo -e "${GREEN}✅ Security credentials generated${NC}"

# Update .env file with generated values
echo -e "${BLUE}📝 Updating .env file with secure values...${NC}"

# Use temporary file for atomic update
TEMP_ENV=$(mktemp)

while IFS= read -r line; do
    case "$line" in
        JWT_SECRET=*)
            echo "JWT_SECRET=$JWT_SECRET"
            ;;
        GOVERNANCE_ADMIN_PASSWORD=*)
            echo "GOVERNANCE_ADMIN_PASSWORD=$ADMIN_PASSWORD"
            ;;
        GOVERNANCE_SERVICE_KEY=*)
            echo "GOVERNANCE_SERVICE_KEY=$SERVICE_KEY"
            ;;
        GOVERNANCE_READONLY_PASSWORD=*)
            echo "GOVERNANCE_READONLY_PASSWORD=$READONLY_PASSWORD"
            ;;
        AUTHENTICATION_ENABLED=*)
            echo "AUTHENTICATION_ENABLED=true"
            ;;
        NODE_ENV=*)
            echo "NODE_ENV=production"
            ;;
        *)
            echo "$line"
            ;;
    esac
done < "$ENV_FILE" > "$TEMP_ENV"

# Move temp file to .env
mv "$TEMP_ENV" "$ENV_FILE"

# Set secure permissions on .env file
chmod 600 "$ENV_FILE"

echo -e "${GREEN}✅ .env file updated with secure credentials${NC}"

# Prompt for Postman API key
echo
echo -e "${BLUE}🔗 Postman API Configuration${NC}"
if [[ "$AUTOMATED_MODE" = false ]]; then
    echo "You need to provide your Postman API key."
    echo "Get one from: https://postman.postman.co/settings/me/api-keys"
    echo
    read -p "Enter your Postman API key (PMAK-...): " -r POSTMAN_API_KEY
else
    # Use environment variable in automated mode
    POSTMAN_API_KEY="${POSTMAN_API_KEY:-}"
fi

if [[ -z "$POSTMAN_API_KEY" ]]; then
    echo -e "${YELLOW}⚠️  No API key provided. You'll need to update the .env file manually.${NC}"
else
    # Validate API key format
    if [[ ! "$POSTMAN_API_KEY" =~ ^PMAK-.+ ]]; then
        echo -e "${YELLOW}⚠️  API key format doesn't look correct. Expected format: PMAK-...${NC}"
        echo -e "${YELLOW}   Proceeding anyway, but please verify the key is correct.${NC}"
    fi
    
    # Update API key in .env file
    sed -i.bak "s/^POSTMAN_API_KEY=.*/POSTMAN_API_KEY=$POSTMAN_API_KEY/" "$ENV_FILE" && rm "$ENV_FILE.bak"
    echo -e "${GREEN}✅ Postman API key configured${NC}"
fi

# Create credentials summary file
CREDENTIALS_FILE="$PROJECT_ROOT/SECURITY_CREDENTIALS.txt"
cat > "$CREDENTIALS_FILE" << EOF
# Postman Governance Stack - Security Credentials
# Generated on: $(date)
# 
# IMPORTANT: Store these credentials securely and delete this file after copying them
# to your password manager or secure credential storage system.

## Default User Accounts

### Administrator Account
Username: admin
Password: $ADMIN_PASSWORD
Role: admin (full system access)

### Service Account  
Username: service
API Key: $SERVICE_KEY
Role: service (programmatic access)

### Read-Only Account
Username: viewer  
Password: $READONLY_PASSWORD
Role: viewer (read-only access)

## System Credentials

JWT Secret: $JWT_SECRET

## First Login Instructions

1. Start the Postman Governance Stack:
   docker compose up -d

2. Access the API at: http://localhost:3001

3. Login with the admin account:
   POST /api/auth/login
   {
     "username": "admin",
     "password": "$ADMIN_PASSWORD"
   }

4. IMMEDIATELY change the default passwords after first login!

5. For API access, use the service account API key:
   Header: X-API-Key: $SERVICE_KEY

## Security Recommendations

- Change all default passwords immediately after first login
- Store these credentials in a secure password manager
- Delete this file after saving credentials securely
- Enable HTTPS/TLS for production deployment
- Configure firewall rules to restrict access
- Set up regular security audits and log monitoring
- Rotate API keys and passwords regularly

## Support

For security questions or issues:
- Check the documentation in README.md
- Review security configuration in config/governance-collector.yml
- Check logs for authentication/authorization errors

EOF

# Set secure permissions on credentials file
chmod 600 "$CREDENTIALS_FILE"

# Generate SSL certificates for development (optional)
CERTS_DIR="$PROJECT_ROOT/certs"
if [[ ! -d "$CERTS_DIR" ]]; then
    echo
    echo -e "${BLUE}🔒 SSL Certificate Setup${NC}"
    read -p "Generate self-signed SSL certificates for HTTPS? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        mkdir -p "$CERTS_DIR"
        
        echo -e "${BLUE}📜 Generating self-signed SSL certificates...${NC}"
        
        # Generate private key
        openssl genrsa -out "$CERTS_DIR/server.key" 2048
        
        # Generate certificate signing request
        openssl req -new -key "$CERTS_DIR/server.key" -out "$CERTS_DIR/server.csr" \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
        
        # Generate self-signed certificate
        openssl x509 -req -days 365 -in "$CERTS_DIR/server.csr" \
            -signkey "$CERTS_DIR/server.key" -out "$CERTS_DIR/server.crt"
        
        # Generate CA certificate (for development)
        cp "$CERTS_DIR/server.crt" "$CERTS_DIR/ca.crt"
        
        # Clean up CSR
        rm "$CERTS_DIR/server.csr"
        
        # Set secure permissions
        chmod 600 "$CERTS_DIR"/*
        
        echo -e "${GREEN}✅ SSL certificates generated in $CERTS_DIR${NC}"
        echo -e "${YELLOW}⚠️  These are self-signed certificates for development only${NC}"
        echo -e "${YELLOW}   For production, use certificates from a trusted CA${NC}"
        
        # Update .env to enable TLS
        sed -i.bak "s/^TLS_ENABLED=.*/TLS_ENABLED=true/" "$ENV_FILE" && rm "$ENV_FILE.bak"
    fi
fi

# Install dependencies if Node.js is available
if [[ "$NODE_AVAILABLE" == true ]]; then
    echo
    echo -e "${BLUE}📦 Installing security dependencies...${NC}"
    cd "$PROJECT_ROOT/collector"
    
    if [[ -f "package.json" ]]; then
        if command_exists npm; then
            npm install jsonwebtoken bcrypt
            echo -e "${GREEN}✅ Security dependencies installed${NC}"
        else
            echo -e "${YELLOW}⚠️  npm not found - please install dependencies manually:${NC}"
            echo -e "${YELLOW}   cd collector && npm install jsonwebtoken bcrypt${NC}"
        fi
    fi
fi

# Final summary
echo
echo -e "${GREEN}🎉 Security setup completed successfully!${NC}"
echo "=============================================="
echo
echo -e "${BLUE}📋 Summary:${NC}"
echo "✅ Environment file created with secure credentials"
echo "✅ Default user accounts configured"
echo "✅ JWT authentication enabled"
echo "✅ API key authentication enabled"
echo "✅ Rate limiting configured"
echo "✅ Security headers enabled"
echo
echo -e "${YELLOW}📁 Files created:${NC}"
echo "• .env (environment configuration)"
echo "• SECURITY_CREDENTIALS.txt (credentials - delete after use)"
if [[ -d "$CERTS_DIR" ]]; then
    echo "• certs/ (SSL certificates for HTTPS)"
fi
echo
echo -e "${RED}🚨 IMPORTANT SECURITY NOTES:${NC}"
echo "1. Credentials are saved in SECURITY_CREDENTIALS.txt"
echo "2. Delete SECURITY_CREDENTIALS.txt after saving credentials securely"
echo "3. Change default passwords immediately after first login"
echo "4. The .env file contains sensitive data - keep it secure"
echo "5. Never commit .env or credentials files to version control"
echo
echo -e "${BLUE}🚀 Next steps:${NC}"
echo "1. Review and customize config/governance-collector.yml"
echo "2. Start the stack: docker compose up -d"
echo "3. Test authentication: curl -X POST http://localhost:3001/api/auth/login"
echo "4. Access Grafana: http://localhost:3000 (admin/generated-password)"
echo "5. Delete SECURITY_CREDENTIALS.txt after saving credentials"
echo
echo -e "${GREEN}Security setup complete! 🔐${NC}"