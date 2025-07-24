#!/bin/bash
set -euo pipefail

# Postman Governance Stack Manual Release Script
# Creates and packages a release for distribution

echo "📦 Postman Governance Stack Release Creation"
echo "============================================="

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

# Parse command line arguments
VERSION=""
SKIP_TESTS=false
SKIP_BUILD=false
DRY_RUN=false

show_help() {
    echo "Usage: $0 [OPTIONS] <version>"
    echo ""
    echo "Options:"
    echo "  --skip-tests     Skip running tests before release"
    echo "  --skip-build     Skip building Docker images"
    echo "  --dry-run        Show what would be done without executing"
    echo "  --help           Show this help message"
    echo ""
    echo "Arguments:"
    echo "  version          Release version (e.g., v1.0.0, v1.1.0)"
    echo ""
    echo "Examples:"
    echo "  $0 v1.0.0                    # Create release v1.0.0"
    echo "  $0 --skip-tests v1.0.1       # Create release without tests"
    echo "  $0 --dry-run v1.1.0          # Preview release creation"
    echo ""
    echo "Prerequisites:"
    echo "  - Git repository with clean working directory"
    echo "  - Docker and Docker Compose installed"
    echo "  - All changes committed and pushed"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        v*.*.*)
            VERSION="$1"
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate version argument
if [[ -z "$VERSION" ]]; then
    print_error "Version is required"
    echo ""
    show_help
    exit 1
fi

# Validate version format
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Invalid version format. Expected: vX.Y.Z (e.g., v1.0.0)"
    exit 1
fi

print_info "Release version: $VERSION"

if [[ "$DRY_RUN" == true ]]; then
    print_warning "DRY RUN MODE - No actual changes will be made"
fi

# Check prerequisites
echo ""
echo "🔍 Checking prerequisites..."

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a Git repository"
    exit 1
fi

# Check for clean working directory
if ! git diff-index --quiet HEAD --; then
    print_error "Working directory is not clean. Please commit or stash changes."
    git status --porcelain
    exit 1
fi

# Check if version tag already exists
if git tag | grep -q "^${VERSION}$"; then
    print_error "Tag $VERSION already exists"
    exit 1
fi

# Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    print_warning "Not on main branch (current: $CURRENT_BRANCH)"
    read -p "Continue with release from this branch? (y/N): " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

print_success "Prerequisites check passed"

# Check Docker (only if we need to build)
if [[ "$SKIP_BUILD" == false ]]; then
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed (required for building)"
        exit 1
    fi

    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        print_error "Docker Compose is not available"
        exit 1
    fi

    print_success "Docker environment ready"
else
    print_info "Skipping Docker checks (build disabled)"
fi

# Run tests if not skipped
if [[ "$SKIP_TESTS" == false ]]; then
    echo ""
    echo "🧪 Running tests..."
    
    if [[ "$DRY_RUN" == true ]]; then
        print_info "Would run: ./test-deployment.sh"
    else
        if [[ -f "test-deployment.sh" ]]; then
            ./test-deployment.sh
            print_success "Tests passed"
        else
            print_warning "Test script not found - skipping tests"
        fi
    fi
else
    print_warning "Skipping tests as requested"
fi

# Build Docker images if not skipped
if [[ "$SKIP_BUILD" == false ]]; then
    echo ""
    echo "🏗️  Building Docker images..."
    
    if [[ "$DRY_RUN" == true ]]; then
        print_info "Would run: $COMPOSE_CMD build"
    else
        $COMPOSE_CMD build
        print_success "Docker images built"
    fi
else
    print_warning "Skipping Docker build as requested"
fi

# Create release package
echo ""
echo "📦 Creating release package..."

PACKAGE_NAME="postman-governance-stack-${VERSION}"
RELEASE_DIR="release"

if [[ "$DRY_RUN" == true ]]; then
    print_info "Would create package: ${PACKAGE_NAME}.tar.gz"
    print_info "Would include files:"
    echo "  - config/"
    echo "  - collector/"
    echo "  - scripts/"
    echo "  - docker-compose.yml"
    echo "  - setup.sh"
    echo "  - README.md"
    echo "  - LICENSE"
    echo "  - CHANGELOG.md"
else
    # Clean previous release directory
    rm -rf "$RELEASE_DIR"
    mkdir -p "$RELEASE_DIR/$PACKAGE_NAME"
    
    # Copy core files
    cp -r config "$RELEASE_DIR/$PACKAGE_NAME/"
    cp -r collector "$RELEASE_DIR/$PACKAGE_NAME/"
    cp -r scripts "$RELEASE_DIR/$PACKAGE_NAME/"
    cp docker-compose.yml "$RELEASE_DIR/$PACKAGE_NAME/"
    cp .env.example "$RELEASE_DIR/$PACKAGE_NAME/"
    cp setup.sh "$RELEASE_DIR/$PACKAGE_NAME/"
    cp test-deployment.sh "$RELEASE_DIR/$PACKAGE_NAME/"
    cp security-scan.sh "$RELEASE_DIR/$PACKAGE_NAME/"
    cp README.md "$RELEASE_DIR/$PACKAGE_NAME/"
    cp LICENSE "$RELEASE_DIR/$PACKAGE_NAME/"
    cp CHANGELOG.md "$RELEASE_DIR/$PACKAGE_NAME/"
    
    # Make scripts executable
    chmod +x "$RELEASE_DIR/$PACKAGE_NAME"/*.sh
    chmod +x "$RELEASE_DIR/$PACKAGE_NAME/scripts"/*.sh
    
    # Update version in package.json
    if [[ -f "$RELEASE_DIR/$PACKAGE_NAME/collector/package.json" ]]; then
        # Remove 'v' prefix for package.json
        VERSION_NUMBER="${VERSION#v}"
        sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION_NUMBER\"/" "$RELEASE_DIR/$PACKAGE_NAME/collector/package.json"
        rm "$RELEASE_DIR/$PACKAGE_NAME/collector/package.json.bak"
    fi
    
    # Create archive
    cd "$RELEASE_DIR"
    tar -czf "${PACKAGE_NAME}.tar.gz" "$PACKAGE_NAME"
    
    # Generate checksums
    sha256sum "${PACKAGE_NAME}.tar.gz" > "${PACKAGE_NAME}.tar.gz.sha256"
    
    cd ..
    print_success "Release package created: ${RELEASE_DIR}/${PACKAGE_NAME}.tar.gz"
fi

# Create Git tag
echo ""
echo "🏷️  Creating Git tag..."

if [[ "$DRY_RUN" == true ]]; then
    print_info "Would create tag: $VERSION"
    print_info "Would update CHANGELOG.md with release date"
else
    # Update CHANGELOG with release date
    TODAY=$(date +%Y-%m-%d)
    if [[ -f "CHANGELOG.md" ]]; then
        sed -i.bak "s/## \[Unreleased\]/## [Unreleased]\n\n## [$VERSION] - $TODAY/" CHANGELOG.md
        rm CHANGELOG.md.bak
        git add CHANGELOG.md
        git commit -m "Release $VERSION"
    fi
    
    # Create annotated tag
    git tag -a "$VERSION" -m "Release $VERSION"
    print_success "Git tag created: $VERSION"
fi

# Show release summary
echo ""
echo "🎉 Release Summary"
echo "=================="
echo "📌 Version: $VERSION"
echo "📦 Package: ${PACKAGE_NAME}.tar.gz"
if [[ "$DRY_RUN" == false ]]; then
    echo "📏 Size: $(du -h "${RELEASE_DIR}/${PACKAGE_NAME}.tar.gz" | cut -f1)"
    echo "🔐 Checksum: $(cat "${RELEASE_DIR}/${PACKAGE_NAME}.tar.gz.sha256" | cut -d' ' -f1)"
fi
echo ""

if [[ "$DRY_RUN" == true ]]; then
    print_info "DRY RUN completed - no changes were made"
    echo "To create the actual release, run without --dry-run"
else
    print_success "Release created successfully!"
    echo ""
    echo "📤 Next steps:"
    echo "  1. Push the tag: git push origin $VERSION"
    echo "  2. Upload ${RELEASE_DIR}/${PACKAGE_NAME}.tar.gz to GitHub Releases"
    echo "  3. Upload ${RELEASE_DIR}/${PACKAGE_NAME}.tar.gz.sha256 for verification"
    echo ""
    echo "🐳 Docker images built locally:"
    echo "  Run 'docker images | grep postman-governance' to see images"
    echo ""
    echo "🌐 To push to GitHub and trigger automated release:"
    echo "  git push origin $VERSION"
fi