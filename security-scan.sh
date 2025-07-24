#!/bin/bash
set -euo pipefail

# Postman Governance Stack Security Validation Script
# Performs security checks on the deployment

echo "🔒 Postman Governance Stack Security Scan"
echo "=========================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ISSUES_FOUND=0
WARNINGS_FOUND=0
PASSED_CHECKS=0

# Function to print colored output
print_pass() {
    echo -e "  ${GREEN}✅ PASS${NC} $1"
    ((PASSED_CHECKS++))
}

print_warn() {
    echo -e "  ${YELLOW}⚠️  WARN${NC} $1"
    ((WARNINGS_FOUND++))
}

print_fail() {
    echo -e "  ${RED}❌ FAIL${NC} $1"
    ((ISSUES_FOUND++))
}

print_info() {
    echo -e "  ${BLUE}ℹ️  INFO${NC} $1"
}

print_section() {
    echo ""
    echo -e "${BLUE}[CHECKING]${NC} $1"
    echo "----------------------------------------"
}

# Check if services are running
check_services_running() {
    print_section "Service Status"
    
    if docker compose ps | grep -q "Up"; then
        print_pass "Docker services are running"
    else
        print_fail "Docker services are not running"
        return 1
    fi
    
    # Check specific services
    local services=("collector" "grafana")
    for service in "${services[@]}"; do
        if docker compose ps "$service" | grep -q "Up"; then
            print_pass "$service service is running"
        else
            print_fail "$service service is not running"
        fi
    done
}

# Check container security
check_container_security() {
    print_section "Container Security"
    
    # Check if containers are running as non-root
    local collector_user=$(docker compose exec -T collector id -u 2>/dev/null || echo "error")
    if [[ "$collector_user" != "0" && "$collector_user" != "error" ]]; then
        print_pass "Collector running as non-root user (UID: $collector_user)"
    else
        print_fail "Collector running as root user"
    fi
    
    local grafana_user=$(docker compose exec -T grafana id -u 2>/dev/null || echo "error")
    if [[ "$grafana_user" != "0" && "$grafana_user" != "error" ]]; then
        print_pass "Grafana running as non-root user (UID: $grafana_user)"
    else
        print_fail "Grafana running as root user"
    fi
    
    # Check for privileged containers
    if docker compose config | grep -q "privileged: true"; then
        print_fail "Privileged containers detected"
    else
        print_pass "No privileged containers found"
    fi
    
    # Check for host network mode
    if docker compose config | grep -q "network_mode.*host"; then
        print_warn "Host network mode detected"
    else
        print_pass "No host network mode usage"
    fi
}

# Check secrets management
check_secrets() {
    print_section "Secrets Management"
    
    # Check if .env file exists and has proper permissions
    if [[ -f ".env" ]]; then
        local env_perms=$(stat -c "%a" .env 2>/dev/null || stat -f "%A" .env 2>/dev/null || echo "unknown")
        if [[ "$env_perms" == "600" || "$env_perms" == "-rw-------" ]]; then
            print_pass ".env file has secure permissions (600)"
        else
            print_warn ".env file permissions could be more restrictive (current: $env_perms)"
        fi
        
        # Check if API key is in .env
        if grep -q "POSTMAN_API_KEY=PMAK-" .env; then
            print_pass "Postman API key found in .env"
        else
            print_warn "Postman API key not found in .env file"
        fi
    else
        print_warn ".env file not found"
    fi
    
    # Check Docker secrets
    if docker secret ls 2>/dev/null | grep -q "postman_api_key"; then
        print_pass "Docker secret for Postman API key exists"
    else
        print_info "Docker secret not found (using .env fallback)"
    fi
    
    if docker secret ls 2>/dev/null | grep -q "grafana_admin_password"; then
        print_pass "Docker secret for Grafana password exists"
    else
        print_info "Grafana password secret not found (using .env fallback)"
    fi
}

# Check network security
check_network_security() {
    print_section "Network Security"
    
    # Check if services are bound to localhost only in production
    local grafana_port=$(docker compose port grafana 3000 2>/dev/null || echo "")
    if [[ "$grafana_port" == *"0.0.0.0:"* ]]; then
        print_warn "Grafana bound to all interfaces (0.0.0.0) - consider localhost only"
    else
        print_pass "Grafana network binding is secure"
    fi
    
    local collector_port=$(docker compose port collector 3001 2>/dev/null || echo "")
    if [[ "$collector_port" == *"0.0.0.0:"* ]]; then
        print_warn "Collector bound to all interfaces (0.0.0.0) - consider localhost only"
    else
        print_pass "Collector network binding is secure"
    fi
    
    # Check for custom networks
    if docker compose config | grep -q "networks:"; then
        print_pass "Custom Docker networks configured"
    else
        print_warn "Using default Docker network"
    fi
}

# Check data security
check_data_security() {
    print_section "Data Security"
    
    # Check volume permissions
    if [[ -d "data" ]]; then
        local data_perms=$(stat -c "%a" data 2>/dev/null || stat -f "%A" data 2>/dev/null || echo "unknown")
        print_info "Data directory permissions: $data_perms"
        
        # Check if SQLite database exists and has reasonable permissions
        if [[ -f "data/governance.db" ]]; then
            local db_perms=$(stat -c "%a" data/governance.db 2>/dev/null || stat -f "%A" data/governance.db 2>/dev/null || echo "unknown")
            print_info "Database file permissions: $db_perms"
            print_pass "SQLite database file exists"
        else
            print_info "SQLite database not yet created"
        fi
    else
        print_warn "Data directory not found"
    fi
    
    # Check for backup configuration
    if grep -q "backup:" config/governance-collector.yml 2>/dev/null; then
        print_pass "Database backup configuration found"
    else
        print_warn "Database backup not configured"
    fi
}

# Check configuration security
check_configuration() {
    print_section "Configuration Security"
    
    # Check Grafana configuration
    if [[ -f "config/grafana.ini" ]]; then
        if grep -q "allow_sign_up = false" config/grafana.ini; then
            print_pass "Grafana user registration disabled"
        else
            print_warn "Grafana user registration may be enabled"
        fi
        
        if grep -q "disable_gravatar = true" config/grafana.ini; then
            print_pass "Grafana Gravatar disabled"
        else
            print_warn "Grafana Gravatar not disabled"
        fi
        
        if grep -q "cookie_secure = true" config/grafana.ini; then
            print_pass "Grafana secure cookies enabled"
        else
            print_warn "Grafana secure cookies not enabled"
        fi
    else
        print_warn "Grafana configuration file not found"
    fi
    
    # Check collector configuration
    if [[ -f "config/governance-collector.yml" ]]; then
        if grep -q "mask_api_keys: true" config/governance-collector.yml; then
            print_pass "API key masking enabled in logs"
        else
            print_warn "API key masking not configured"
        fi
        
        if grep -q "audit:" config/governance-collector.yml; then
            print_pass "Audit logging configuration found"
        else
            print_warn "Audit logging not configured"
        fi
    else
        print_fail "Collector configuration file not found"
    fi
}

# Check API security
check_api_security() {
    print_section "API Security"
    
    # Test health endpoint
    if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
        print_pass "Health endpoint accessible"
        
        # Check if health endpoint returns proper JSON
        local health_response=$(curl -s http://localhost:3001/health)
        if echo "$health_response" | jq -e '.overall' > /dev/null 2>&1; then
            print_pass "Health endpoint returns valid JSON"
        else
            print_warn "Health endpoint response format issue"
        fi
    else
        print_warn "Health endpoint not accessible"
    fi
    
    # Test rate limiting (if service is running)
    if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
        print_info "Testing rate limiting..."
        local rate_limit_test=0
        for i in {1..10}; do
            if curl -sf http://localhost:3001/api/config > /dev/null 2>&1; then
                ((rate_limit_test++))
            fi
            sleep 0.1
        done
        
        if [[ $rate_limit_test -lt 10 ]]; then
            print_pass "Rate limiting appears to be working"
        else
            print_warn "Rate limiting may not be configured"
        fi
    fi
}

# Check for vulnerabilities (basic)
check_vulnerabilities() {
    print_section "Vulnerability Check"
    
    # Check if Trivy is available for container scanning
    if command -v trivy &> /dev/null; then
        print_info "Running Trivy vulnerability scan..."
        
        # Scan collector image
        local collector_image=$(docker compose config | grep "image:" | grep collector | awk '{print $2}' | head -1)
        if [[ -n "$collector_image" ]]; then
            local vuln_count=$(trivy image --format json "$collector_image" 2>/dev/null | jq '.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH" or .Severity == "CRITICAL") | length' 2>/dev/null | wc -l)
            if [[ "$vuln_count" -eq 0 ]]; then
                print_pass "No high/critical vulnerabilities found in collector image"
            else
                print_warn "Found $vuln_count high/critical vulnerabilities in collector image"
            fi
        fi
    else
        print_info "Trivy not available for vulnerability scanning"
        print_info "Install with: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin"
    fi
    
    # Check for known security files
    local security_files=(".dockerignore" "docker-compose.override.yml")
    for file in "${security_files[@]}"; do
        if [[ -f "$file" ]]; then
            print_pass "Security file $file exists"
        else
            print_info "Optional security file $file not found"
        fi
    done
}

# Main execution
main() {
    echo "Starting security validation..."
    echo ""
    
    # Run all checks
    check_services_running || true
    check_container_security
    check_secrets
    check_network_security
    check_data_security
    check_configuration
    check_api_security
    check_vulnerabilities
    
    # Summary
    echo ""
    echo "🔍 Security Scan Summary"
    echo "========================"
    echo -e "  ${GREEN}✅ Passed Checks: $PASSED_CHECKS${NC}"
    echo -e "  ${YELLOW}⚠️  Warnings: $WARNINGS_FOUND${NC}"
    echo -e "  ${RED}❌ Issues Found: $ISSUES_FOUND${NC}"
    echo ""
    
    if [[ $ISSUES_FOUND -eq 0 ]]; then
        echo -e "${GREEN}🎉 No critical security issues found!${NC}"
        echo ""
        if [[ $WARNINGS_FOUND -gt 0 ]]; then
            echo -e "${YELLOW}Consider addressing the warnings above for improved security.${NC}"
        fi
        exit 0
    else
        echo -e "${RED}🚨 Critical security issues detected!${NC}"
        echo "Please address the failed checks above before deploying to production."
        echo ""
        exit 1
    fi
}

# Check if Docker Compose is available
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Run main function
main "$@"