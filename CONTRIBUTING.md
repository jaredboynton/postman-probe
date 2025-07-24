# Contributing to Postman Governance Stack

We welcome contributions to the Postman Governance Stack! This document provides guidelines for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Security Considerations](#security-considerations)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected vs actual behavior**
- **Environment details** (OS, Docker version, Node.js version)
- **Log output** or error messages
- **Screenshots** if applicable

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) when available.

### Suggesting Enhancements

Enhancement suggestions are welcome! Please:

- Use a clear and descriptive title
- Provide detailed description of the proposed feature
- Explain why this enhancement would be useful
- Consider the scope and complexity

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) when available.

### Contributing Code

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes** following our coding standards
4. **Add or update tests** as needed
5. **Update documentation** if required
6. **Commit your changes** (`git commit -m 'Add amazing feature'`)
7. **Push to the branch** (`git push origin feature/amazing-feature`)
8. **Open a Pull Request**

## Development Setup

### Prerequisites

- Node.js 18.0.0 or higher
- Docker 20.10+ and Docker Compose 2.0+
- Git

### Local Development

1. **Clone the repository:**
```bash
git clone https://github.com/your-org/postman-governance-stack.git
cd postman-governance-stack
```

2. **Set up environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Install dependencies:**
```bash
cd collector
npm install
```

4. **Run security setup:**
```bash
./scripts/setup-security.sh
```

5. **Start development environment:**
```bash
./scripts/deploy.sh --dev
```

6. **Run tests:**
```bash
cd collector
npm test
```

### Development Workflow

- **Database:** Uses SQLite with file storage in `data/governance/`
- **Logs:** Available in `logs/` directory
- **Configuration:** Modify `config/governance-collector.yml` for settings
- **Hot reload:** Development mode supports code changes without restart

## Pull Request Process

### Before Submitting

- [ ] All tests pass (`npm test`)
- [ ] Code follows project style guidelines
- [ ] Documentation is updated
- [ ] Security scan passes (`./security-scan.sh`)
- [ ] Integration tests work (`npm run test:integration`)

### PR Requirements

1. **Clear description** of changes and motivation
2. **Reference any related issues** (#123)
3. **Include test coverage** for new functionality
4. **Update documentation** as needed
5. **Follow semantic commit messages**

### Review Process

- All PRs require review from maintainers
- CI/CD pipeline must pass
- Security scanning must pass
- At least 80% test coverage required
- Documentation must be updated for user-facing changes

## Coding Standards

### JavaScript/Node.js

- **ES6+ syntax** preferred
- **Consistent formatting** using our ESLint configuration
- **Meaningful variable names** and function names
- **JSDoc comments** for all public functions
- **Error handling** with proper logging
- **Async/await** preferred over Promises

### Code Style

```javascript
/**
 * Calculate governance metrics for a collection
 * @param {Object} collection - The Postman collection
 * @param {Object} options - Calculation options
 * @returns {Promise<Object>} Governance metrics
 */
async function calculateGovernanceMetrics(collection, options) {
  try {
    const metrics = {
      documentation: await calculateDocumentationScore(collection),
      testing: await calculateTestingScore(collection),
      monitoring: await calculateMonitoringScore(collection)
    };
    
    return metrics;
  } catch (error) {
    this.logger.error('Failed to calculate governance metrics', {
      collectionId: collection.id,
      error: error.message
    });
    throw error;
  }
}
```

### Security Guidelines

- **Never commit secrets** or API keys
- **Validate all inputs** from external sources
- **Use parameterized queries** for database operations
- **Sanitize log output** to prevent information leakage
- **Follow principle of least privilege**

### Database

- **Use transactions** for multi-step operations
- **Index frequently queried columns**
- **Handle connection errors gracefully**
- **Use prepared statements** to prevent SQL injection

### Docker

- **Multi-stage builds** for smaller images
- **Non-root user** for security
- **Health checks** for all services
- **Resource limits** in production

## Testing Guidelines

### Test Structure

```
collector/test/
├── unit/           # Unit tests for individual modules
├── integration/    # Integration tests for API endpoints
├── security/       # Security-focused tests
└── fixtures/       # Test data and mocks
```

### Writing Tests

```javascript
describe('GovernanceCalculator', () => {
  let calculator;
  
  beforeEach(() => {
    calculator = new GovernanceCalculator(mockClient, config, mockLogger);
  });
  
  test('should calculate documentation score correctly', async () => {
    const collection = createMockCollection();
    const score = await calculator.calculateDocumentationScore(collection);
    
    expect(score).toBe(85);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Documentation score calculated')
    );
  });
});
```

### Test Coverage

- **Aim for 80%+ coverage** overall
- **100% coverage** for security-critical functions
- **Test error conditions** and edge cases
- **Mock external dependencies** (Postman API, database)
- **Integration tests** for complete workflows

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# Security tests
npm run test:security

# Coverage report
npm run test:coverage
```

## Security Considerations

### Reporting Security Issues

**DO NOT** create public issues for security vulnerabilities. Instead:

1. Email security concerns to: [security@yourproject.com]
2. Include detailed description and steps to reproduce
3. Allow reasonable time for fix before public disclosure
4. See [SECURITY.md](SECURITY.md) for full policy

### Security Best Practices

- **Secrets management:** Use environment variables, never commit secrets
- **Input validation:** Validate and sanitize all external inputs
- **Authentication:** Implement proper authentication and authorization
- **Logging:** Audit sensitive operations, sanitize log output
- **Dependencies:** Keep dependencies updated, scan for vulnerabilities

### Security Testing

```bash
# Run security audit
npm audit

# Container security scan
./security-scan.sh

# Dependency vulnerability check
npm run security:check
```

## Documentation

### Code Documentation

- **JSDoc comments** for all public APIs
- **README updates** for new features
- **Architecture documentation** for significant changes
- **API documentation** for new endpoints

### User Documentation

- **Update README.md** for user-facing changes
- **Deployment guide** for infrastructure changes
- **Troubleshooting** for common issues
- **Examples** for new features

## Getting Help

- **GitHub Issues:** For bugs and feature requests
- **GitHub Discussions:** For questions and ideas  
- **Documentation:** Check README.md and docs/ directory
- **Discord/Slack:** [Community chat link if available]

## Recognition

Contributors are recognized in:
- [AUTHORS.md](AUTHORS.md) file
- Release notes for significant contributions
- GitHub contributor statistics

Thank you for contributing to Postman Governance Stack! 🚀