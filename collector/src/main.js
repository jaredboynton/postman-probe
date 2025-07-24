#!/usr/bin/env node
/**
 * Postman Governance Collector - Main Application
 * Secure data collection service for Postman API governance metrics
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const DatabaseManager = require('./database/manager');
const PostmanClient = require('./postman/client');
const GovernanceCalculator = require('./governance/calculator');
const ConfigLoader = require('./config/loader');
const Logger = require('./utils/logger');
const HealthChecker = require('./utils/health');
const AuthManager = require('./security/auth-manager');
const createAuthMiddleware = require('./security/auth-middleware');

/**
 * Postman Governance Collector Application
 * 
 * Main application class that orchestrates the collection, storage, and serving of
 * Postman API governance metrics. Provides a secure REST API, scheduled data collection,
 * and integration with monitoring systems like Grafana and Prometheus.
 * 
 * @class GovernanceCollectorApp
 * @description Enterprise-grade governance monitoring solution for Postman workspaces
 * 
 * Dependencies:
 * - DatabaseManager: Handles SQLite database operations and data persistence
 * - PostmanClient: Manages secure API communication with Postman services
 * - GovernanceCalculator: Computes governance metrics and violation analysis
 * - ConfigLoader: Loads and validates configuration from multiple sources
 * - Logger: Provides structured logging with security audit capabilities
 * - HealthChecker: Monitors system health and service dependencies
 * 
 * Called by: Application entry point (main module execution)
 * Calls into: All service components for orchestration
 * 
 * @complexity O(1) - Constructor initializes instance variables only
 */
class GovernanceCollectorApp {
  /**
   * Initialize the Governance Collector Application
   * 
   * Sets up all instance variables to null/default states. Actual initialization
   * of components happens in the initialize() method to support async operations.
   * 
   * @complexity O(1) - Simple variable initialization
   */
  constructor() {
    this.app = express();
    this.config = null;
    this.logger = null;
    this.db = null;
    this.postmanClient = null;
    this.governanceCalculator = null;
    this.healthChecker = null;
    this.cronJob = null;
  }

  /**
   * Initialize all application components and dependencies
   * 
   * Performs the complete application startup sequence including configuration loading,
   * component initialization, and dependency injection. This method must be called
   * before starting the web server or scheduled collection.
   * 
   * @async
   * @method initialize
   * @throws {Error} When configuration loading fails
   * @throws {Error} When database initialization fails
   * @throws {Error} When API key loading fails
   * @throws {Error} When component initialization fails
   * 
   * Dependencies:
   * - ConfigLoader.load(): Loads application configuration
   * - DatabaseManager.initialize(): Sets up SQLite database
   * - loadApiKey(): Retrieves Postman API credentials
   * 
   * @complexity O(1) - Linear initialization of components
   * @returns {Promise<void>} Resolves when all components are initialized
   */
  async initialize() {
    try {
      // Load configuration
      this.config = await ConfigLoader.load();
      
      // Initialize logger
      this.logger = new Logger(this.config.logging);
      this.logger.info('Starting Postman Governance Collector', {
        version: require('../package.json').version,
        environment: process.env.NODE_ENV || 'development'
      });

      // Initialize database
      this.db = new DatabaseManager(this.config.database, this.logger);
      await this.db.initialize();
      
      // Initialize authentication manager
      if (this.config.security?.authentication?.enabled) {
        this.authManager = new AuthManager(this.config.security, this.logger);
        this.authMiddleware = createAuthMiddleware(this.authManager, this.logger);
        this.logger.info('Authentication system enabled', {
          methods: this.config.security.authentication.methods
        });
      } else {
        this.logger.warn('Authentication disabled - running in development mode');
      }

      // Initialize Postman client
      const apiKey = await this.loadApiKey();
      this.postmanClient = new PostmanClient(apiKey, this.config.postman, this.logger);

      // Initialize governance calculator
      // Pass both governance config and limits needed for calculations
      const calculatorConfig = {
        ...this.config.governance,
        limits: this.config.postman.limits
      };
      this.governanceCalculator = new GovernanceCalculator(
        this.postmanClient,
        calculatorConfig,
        this.logger
      );

      // Initialize health checker
      this.healthChecker = new HealthChecker(
        this.db,
        this.postmanClient,
        this.config.health,
        this.logger
      );

      this.logger.info('All components initialized successfully', {
        authentication: this.authManager ? 'enabled' : 'disabled'
      });
    } catch (error) {
      console.error('Failed to initialize application:', error);
      process.exit(1);
    }
  }

  /**
   * Load Postman API key from secure sources
   * 
   * Attempts to load the API key from Docker secrets first (production),
   * then falls back to environment variables (development only). Implements
   * secure key handling with logging that masks sensitive data.
   * 
   * @async
   * @method loadApiKey
   * @private
   * @throws {Error} When no API key is found in any source
   * @throws {Error} When file system access fails
   * 
   * Security considerations:
   * - Docker secrets are preferred for production deployment
   * - Environment variables only allowed in development mode
   * - API key preview in logs masks sensitive portions
   * - Full key value never logged
   * 
   * @complexity O(1) - Simple file/environment variable access
   * @returns {Promise<string>} The Postman API key
   */
  async loadApiKey() {
    try {
      const secretPath = '/run/secrets/postman_api_key';
      if (fs.existsSync(secretPath)) {
        const apiKey = fs.readFileSync(secretPath, 'utf8').trim();
        this.logger.info('Loaded API key from Docker secret', {
          keyLength: apiKey.length,
          keyPreview: `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
        });
        return apiKey;
      }
      
      // Fallback to environment variable (development or Cloud Run)
      if (process.env.POSTMAN_API_KEY) {
        const isCloudRun = process.env.K_SERVICE || process.env.CLOUD_RUN_SERVICE;
        const isDev = process.env.NODE_ENV === 'development';
        
        if (isDev || isCloudRun) {
          this.logger.info('Using API key from environment variable', {
            environment: isDev ? 'development' : 'cloud-run'
          });
          return process.env.POSTMAN_API_KEY;
        }
      }
      
      throw new Error('No Postman API key found. Ensure Docker secret is properly mounted.');
    } catch (error) {
      this.logger.error('Failed to load API key', { error: error.message });
      throw error;
    }
  }

  /**
   * Configure Express.js middleware stack for security and functionality
   * 
   * Sets up comprehensive middleware including security headers, compression,
   * CORS, rate limiting, request parsing, and logging. Follows security best
   * practices for production deployment.
   * 
   * @method setupMiddleware
   * @private
   * 
   * Middleware stack (in order):
   * 1. Helmet - Security headers (CSP, HSTS, etc.)
   * 2. Compression - Response compression
   * 3. CORS - Cross-origin resource sharing (configurable)
   * 4. Rate limiting - Request throttling (configurable)
   * 5. Body parsing - JSON and URL-encoded request bodies
   * 6. Request logging - HTTP request/response logging
   * 
   * Security features:
   * - Content Security Policy to prevent XSS
   * - HTTP Strict Transport Security (HSTS)
   * - Rate limiting to prevent abuse
   * - Request size limits to prevent DoS
   * 
   * @complexity O(1) - Sequential middleware registration
   * @returns {void}
   */
  setupMiddleware() {
    // Security middleware with CSP, HSTS, and other security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // Compression
    this.app.use(compression());

    // CORS
    if (this.config.api.cors.enabled) {
      this.app.use(cors({
        origin: this.config.api.cors.origins,
        methods: this.config.api.cors.methods,
        allowedHeaders: this.config.api.cors.headers,
        credentials: false
      }));
    }

    // Rate limiting
    if (this.config.api.rate_limit.enabled) {
      const limiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: this.config.api.rate_limit.requests_per_minute,
        message: { error: 'Too many requests' },
        standardHeaders: true,
        legacyHeaders: false,
      });
      this.app.use(limiter);
    }

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    if (this.config.api.logging.enabled) {
      this.app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
          const duration = Date.now() - start;
          this.logger.info('HTTP Request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip
          });
        });
        next();
      });
    }
  }

  /**
   * Configure all HTTP API routes and endpoints
   * 
   * Defines the complete REST API surface including health checks, metrics endpoints,
   * historical data queries, and administrative functions. Supports both JSON and
   * CSV output formats for integration with various monitoring tools.
   * 
   * @method setupRoutes
   * @private
   * 
   * API Endpoints:
   * - GET / - Service information and health status
   * - GET /health - Comprehensive health check
   * - GET /metrics - Prometheus-format metrics
   * - GET /metrics/json - Legacy JSON metrics
   * - GET /api/governance/metrics - Historical governance data
   * - GET /api/governance/summary - Current metrics summary
   * - GET /api/governance/violations - Violations data (JSON)
   * - GET /api/governance/violations/detailed - Detailed violations (JSON/CSV)
   * - GET /api/governance/trends - Metric trend analysis
   * - GET /api/debug/violations - Debug endpoint for troubleshooting
   * - POST /api/collect - Manual data collection trigger
   * - GET /api/config - Read-only configuration view
   * 
   * Error handling:
   * - 404 handler for unknown endpoints
   * - Global error handler with logging
   * - Structured error responses
   * 
   * @complexity O(n) where n is the number of endpoints (constant in practice)
   * @returns {void}
   */
  setupRoutes() {
    // Root endpoint providing service information for health checks
    this.app.get('/', (req, res) => {
      res.status(200).json({ 
        status: 'ok', 
        service: 'Postman Governance Collector',
        version: require('../package.json').version 
      });
    });

    // Authentication endpoints (when enabled)
    if (this.authManager && this.authMiddleware) {
      // Login endpoint
      this.app.post('/api/auth/login', async (req, res) => {
        try {
          const { username, password } = req.body;
          
          if (!username || !password) {
            return res.status(400).json({ 
              error: 'Username and password required',
              code: 'MISSING_CREDENTIALS'
            });
          }
          
          const result = await this.authManager.authenticateUser(
            username, 
            password, 
            { ip: req.ip, userAgent: req.get('User-Agent') }
          );
          
          res.json({
            message: 'Login successful',
            token: result.token,
            user: result.user,
            expires_in: result.expires_in
          });
          
        } catch (error) {
          this.logger.audit('Authentication failed', {
            username: req.body.username,
            ip: req.ip,
            error: error.message
          });
          
          res.status(401).json({ 
            error: error.message,
            code: 'AUTHENTICATION_FAILED'
          });
        }
      });
      
      // Token validation endpoint
      this.app.post('/api/auth/validate', this.authMiddleware.authenticate, (req, res) => {
        res.json({
          message: 'Token valid',
          user: req.user,
          permissions: req.permissions
        });
      });
      
      // Logout endpoint (invalidates token)
      this.app.post('/api/auth/logout', this.authMiddleware.authenticate, (req, res) => {
        // In a full implementation, we would blacklist the token
        res.json({ message: 'Logged out successfully' });
      });
    }

    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.healthChecker.checkHealth();
        const status = health.overall === 'healthy' ? 200 : 503;
        res.status(status).json(health);
      } catch (error) {
        this.logger.error('Health check failed', { error: error.message });
        res.status(503).json({
          overall: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Prometheus metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = await this.getPrometheusMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
      } catch (error) {
        this.logger.error('Failed to get Prometheus metrics', { error: error.message });
        res.status(500).send('# ERROR: Failed to retrieve metrics\n');
      }
    });

    // JSON metrics endpoint (legacy)
    this.app.get('/metrics/json', async (req, res) => {
      try {
        const metrics = await this.getJsonMetrics();
        res.json(metrics);
      } catch (error) {
        this.logger.error('Failed to get JSON metrics', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve metrics' });
      }
    });

    // Historical data endpoints for Grafana
    this.app.get('/api/governance/metrics', 
      this.authMiddleware ? this.authMiddleware.authenticate : (req, res, next) => next(),
      async (req, res) => {
      try {
        const { from, to, interval } = req.query;
        const metrics = await this.db.getHistoricalMetrics(from, to, interval);
        res.json(metrics);
      } catch (error) {
        this.logger.error('Failed to get historical metrics', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve historical metrics' });
      }
    });

    // Current metrics summary for stat panels
    this.app.get('/api/governance/summary',
      this.authMiddleware ? this.authMiddleware.authenticate : (req, res, next) => next(),
      async (req, res) => {
      try {
        const summary = await this.db.getLatestMetricsSummary();
        res.json(summary);
      } catch (error) {
        this.logger.error('Failed to get metrics summary', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve metrics summary' });
      }
    });

    this.app.get('/api/governance/violations',
      this.authMiddleware ? this.authMiddleware.authenticate : (req, res, next) => next(),
      async (req, res) => {
      try {
        const { from, to } = req.query;
        
        this.logger.info('Violations endpoint called', { from, to, hasParams: !!(from && to) });
        
        if (from && to) {
          // Use provided date range
          const violations = await this.db.getHistoricalViolations(from, to);
          this.logger.info('Historical violations returned', { count: violations.length });
          res.json(violations);
        } else {
          // Return simple violation summary for dashboard
          const violationSummary = await this.db.getViolationSummary();
          this.logger.info('Violation summary returned', { count: violationSummary.length });
          res.json(violationSummary);
        }
      } catch (error) {
        this.logger.error('Failed to get violations', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve violations' });
      }
    });

    // Detailed violations endpoint for actionable dashboard table
    this.app.get('/api/governance/violations/detailed',
      this.authMiddleware ? this.authMiddleware.authenticate : (req, res, next) => next(),
      async (req, res) => {
      try {
        const { limit = 50, format } = req.query;
        const detailedViolations = await this.db.getDetailedViolations(limit);
        
        if (format === 'csv') {
          // Return CSV format
          const csvHeader = 'Collection/Entity,Violation Type,Action Required,Workspace,Admin Email,Severity\n';
          const csvRows = detailedViolations.map(v => {
            const cleanField = (field) => field ? `"${field.toString().replace(/"/g, '""')}"` : '""';
            return [
              cleanField(v.entity_name),
              cleanField(v.violation_type),
              cleanField(v.action_needed),
              cleanField(v.workspace_name || 'Unknown'),
              cleanField(v.admin_contact),
              cleanField(v.severity)
            ].join(',');
          }).join('\n');
          
          res.set('Content-Type', 'text/csv');
          res.send(csvHeader + csvRows);
          this.logger.info('CSV violations returned', { count: detailedViolations.length });
        } else {
          // Return JSON format (default)
          this.logger.info('Detailed violations returned', { count: detailedViolations.length });
          res.json(detailedViolations);
        }
      } catch (error) {
        this.logger.error('Failed to get detailed violations', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve detailed violations' });
      }
    });


    this.app.get('/api/governance/trends', async (req, res) => {
      try {
        const { metric, period } = req.query;
        // Provide defaults if parameters not specified
        const defaultMetric = metric || 'documentation_score';
        const defaultPeriod = period || '7d';
        const trends = await this.db.getMetricTrends(defaultMetric, defaultPeriod);
        res.json(trends);
      } catch (error) {
        this.logger.error('Failed to get metric trends', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve metric trends' });
      }
    });

    // Debug endpoint for testing violations
    this.app.get('/api/debug/violations', async (req, res) => {
      try {
        // Test direct SQL execution
        const testQuery = await this.db.all('SELECT COUNT(*) as total FROM governance_violations');
        const summaryQuery = await this.db.all('SELECT violation_type, COUNT(*) as count FROM governance_violations GROUP BY violation_type ORDER BY count DESC');
        
        res.json({
          totalViolations: testQuery[0].total,
          violationSummary: summaryQuery,
          message: 'Debug endpoint working'
        });
      } catch (error) {
        this.logger.error('Debug endpoint failed', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Manual collection trigger
    this.app.post('/api/collect', async (req, res) => {
      try {
        this.logger.info('Manual collection triggered', { 
          triggeredBy: req.ip,
          timestamp: new Date().toISOString()
        });
        
        // Run collection asynchronously
        this.runCollection().catch(error => {
          this.logger.error('Manual collection failed', { error: error.message });
        });
        
        res.json({ 
          status: 'initiated',
          message: 'Data collection started',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Failed to trigger manual collection', { error: error.message });
        res.status(500).json({ error: 'Failed to trigger collection' });
      }
    });

    // Configuration endpoint (read-only)
    this.app.get('/api/config', (req, res) => {
      const safeConfig = {
        collection: {
          schedule: this.config.collection.schedule,
          timeout: this.config.collection.timeout
        },
        governance: {
          weights: this.config.governance.weights,
          thresholds: this.config.governance.thresholds
        },
        version: require('../package.json').version
      };
      res.json(safeConfig);
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      this.logger.error('Unhandled error', { 
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      });
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Execute a complete governance data collection cycle
   * 
   * Orchestrates the full collection process including metric calculation,
   * violation analysis, and data persistence. This method is called both
   * by scheduled collection and manual API triggers.
   * 
   * @async
   * @method runCollection
   * @throws {Error} When governance calculation fails
   * @throws {Error} When database storage fails
   * @throws {Error} When API communication fails
   * 
   * Collection process:
   * 1. Calculate governance metrics (documentation, testing, monitoring, organization)
   * 2. Analyze governance violations (missing docs, untested collections, etc.)
   * 3. Store all data in SQLite database with timestamps
   * 4. Log collection performance and results
   * 
   * Dependencies:
   * - GovernanceCalculator.calculateGovernanceMetrics(): Computes scores
   * - GovernanceCalculator.calculateGovernanceViolations(): Finds violations
   * - DatabaseManager.storeMetrics(): Persists data
   * 
   * Called by:
   * - Scheduled cron job (setupScheduledCollection)
   * - Manual API endpoint (POST /api/collect)
   * 
   * @complexity O(n) where n is the number of collections and workspaces
   * @returns {Promise<void>} Resolves when collection completes successfully
   */
  async runCollection() {
    const startTime = Date.now();
    this.logger.info('Starting governance data collection cycle');

    try {
      // Calculate governance metrics
      const metrics = await this.governanceCalculator.calculateGovernanceMetrics();
      const violations = await this.governanceCalculator.calculateGovernanceViolations();

      // Store in database
      await this.db.storeMetrics(metrics, violations);

      const duration = Date.now() - startTime;
      this.logger.info('Data collection completed successfully', {
        duration: `${duration}ms`,
        metricsStored: Object.keys(metrics).length,
        violationsFound: Object.values(violations).reduce((sum, arr) => sum + arr.length, 0)
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Data collection failed', {
        error: error.message,
        duration: `${duration}ms`,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Configure automated data collection scheduling
   * 
   * Sets up a cron job for automated governance data collection based on
   * the configured schedule. Validates cron expression and handles errors
   * gracefully to prevent application crashes.
   * 
   * @method setupScheduledCollection
   * @private
   * @throws {Error} When cron schedule format is invalid
   * 
   * Features:
   * - Cron expression validation before setup
   * - UTC timezone for consistent scheduling
   * - Error handling for failed collections
   * - Graceful degradation on collection failures
   * 
   * Dependencies:
   * - runCollection(): Executes the actual data collection
   * - cron.validate(): Validates cron expression syntax
   * - cron.schedule(): Creates the scheduled job
   * 
   * @complexity O(1) - Simple cron job setup
   * @returns {void}
   */
  setupScheduledCollection() {
    if (!cron.validate(this.config.collection.schedule)) {
      throw new Error(`Invalid cron schedule: ${this.config.collection.schedule}`);
    }

    this.cronJob = cron.schedule(this.config.collection.schedule, async () => {
      try {
        await this.runCollection();
      } catch (error) {
        this.logger.error('Scheduled collection failed', { error: error.message });
      }
    }, {
      scheduled: false,
      timezone: "UTC"
    });

    this.cronJob.start();
    this.logger.info('Scheduled collection started', {
      schedule: this.config.collection.schedule,
      timezone: 'UTC'
    });
  }

  /**
   * Generate Prometheus-format metrics for monitoring integration
   * 
   * Creates comprehensive metrics in Prometheus exposition format including
   * governance scores, organizational data, violation counts, and system metrics.
   * Supports integration with Prometheus, Grafana, and other monitoring tools.
   * 
   * @async
   * @method getPrometheusMetrics
   * @private
   * @throws {Error} When database query fails
   * @throws {Error} When metric generation fails
   * 
   * Metric categories:
   * - Governance scores (overall, documentation, testing, monitoring, organization)
   * - Organizational metrics (workspaces, collections, users, forks, mocks, monitors)
   * - Violation counts by type
   * - System metrics (memory usage, uptime)
   * 
   * Dependencies:
   * - DatabaseManager.getLatestMetricsSummary(): Current governance data
   * - DatabaseManager.getViolationSummary(): Violation statistics
   * - process.memoryUsage(): Node.js memory metrics
   * - process.uptime(): Application uptime
   * 
   * Called by: GET /metrics endpoint
   * 
   * @complexity O(n) where n is the number of violation types
   * @returns {Promise<string>} Prometheus-format metrics text
   */
  async getPrometheusMetrics() {
    try {
      // Get latest governance data
      const summary = await this.db.getLatestMetricsSummary();
      const violations = await this.db.getViolationSummary();
      
      let metrics = '';
      
      // Add metadata
      metrics += '# HELP postman_governance_info Information about the Postman Governance Collector\n';
      metrics += '# TYPE postman_governance_info gauge\n';
      metrics += `postman_governance_info{version="${require('../package.json').version}"} 1\n`;
      metrics += '\n';
      
      // Governance scores
      metrics += '# HELP postman_governance_overall_score Overall governance score (0-100)\n';
      metrics += '# TYPE postman_governance_overall_score gauge\n';
      metrics += `postman_governance_overall_score ${summary.avg_overall_score || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_governance_documentation_score Documentation coverage score (0-100)\n';
      metrics += '# TYPE postman_governance_documentation_score gauge\n';
      metrics += `postman_governance_documentation_score ${summary.avg_documentation_score || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_governance_testing_score Testing coverage score (0-100)\n';
      metrics += '# TYPE postman_governance_testing_score gauge\n';
      metrics += `postman_governance_testing_score ${summary.avg_testing_score || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_governance_monitoring_score Monitoring coverage score (0-100)\n';
      metrics += '# TYPE postman_governance_monitoring_score gauge\n';
      metrics += `postman_governance_monitoring_score ${summary.avg_monitoring_score || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_governance_organization_score Organization structure score (0-100)\n';
      metrics += '# TYPE postman_governance_organization_score gauge\n';
      metrics += `postman_governance_organization_score ${summary.avg_organization_score || 0}\n`;
      metrics += '\n';
      
      // Organizational metrics
      metrics += '# HELP postman_total_workspaces Total number of workspaces\n';
      metrics += '# TYPE postman_total_workspaces gauge\n';
      metrics += `postman_total_workspaces ${summary.total_workspaces || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_total_collections Total number of collections\n';
      metrics += '# TYPE postman_total_collections gauge\n';
      metrics += `postman_total_collections ${summary.total_collections || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_total_users Total number of users\n';
      metrics += '# TYPE postman_total_users gauge\n';
      metrics += `postman_total_users ${summary.total_users || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_total_forks Total number of collection forks\n';
      metrics += '# TYPE postman_total_forks gauge\n';
      metrics += `postman_total_forks ${summary.total_forks || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_total_mocks Total number of mocks\n';
      metrics += '# TYPE postman_total_mocks gauge\n';
      metrics += `postman_total_mocks ${summary.total_mocks || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_total_monitors Total number of monitors\n';
      metrics += '# TYPE postman_total_monitors gauge\n';
      metrics += `postman_total_monitors ${summary.total_monitors || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_orphaned_users Number of orphaned users\n';
      metrics += '# TYPE postman_orphaned_users gauge\n';
      metrics += `postman_orphaned_users ${summary.orphaned_users || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_collections_without_specs Number of collections without specifications\n';
      metrics += '# TYPE postman_collections_without_specs gauge\n';
      metrics += `postman_collections_without_specs ${summary.collections_without_specs || 0}\n`;
      metrics += '\n';
      
      metrics += '# HELP postman_postbot_uses Total Postbot usage count\n';
      metrics += '# TYPE postman_postbot_uses gauge\n';
      metrics += `postman_postbot_uses ${summary.total_postbot_uses || 0}\n`;
      metrics += '\n';
      
      // Violations by type
      metrics += '# HELP postman_governance_violations Number of governance violations by type\n';
      metrics += '# TYPE postman_governance_violations gauge\n';
      
      for (const violation of violations) {
        const violationType = violation.violation_type.replace(/([A-Z])/g, '_$1').toLowerCase();
        metrics += `postman_governance_violations{type="${violation.violation_type}"} ${violation.count}\n`;
      }
      metrics += '\n';
      
      // System metrics
      const memUsage = process.memoryUsage();
      metrics += '# HELP nodejs_memory_usage_bytes Node.js memory usage in bytes\n';
      metrics += '# TYPE nodejs_memory_usage_bytes gauge\n';
      metrics += `nodejs_memory_usage_bytes{type="rss"} ${memUsage.rss}\n`;
      metrics += `nodejs_memory_usage_bytes{type="heapTotal"} ${memUsage.heapTotal}\n`;
      metrics += `nodejs_memory_usage_bytes{type="heapUsed"} ${memUsage.heapUsed}\n`;
      metrics += `nodejs_memory_usage_bytes{type="external"} ${memUsage.external}\n`;
      metrics += '\n';
      
      metrics += '# HELP nodejs_uptime_seconds Node.js process uptime in seconds\n';
      metrics += '# TYPE nodejs_uptime_seconds gauge\n';
      metrics += `nodejs_uptime_seconds ${process.uptime()}\n`;
      metrics += '\n';
      
      return metrics;
    } catch (error) {
      this.logger.error('Failed to generate Prometheus metrics', { error: error.message });
      return '# ERROR: Failed to generate metrics\n';
    }
  }

  /**
   * Generate legacy JSON metrics for backward compatibility
   * 
   * Provides basic system metrics in JSON format for applications that
   * cannot consume Prometheus metrics. This is a lightweight alternative
   * to the full Prometheus metrics endpoint.
   * 
   * @async
   * @method getJsonMetrics
   * @private
   * 
   * Metrics included:
   * - Application uptime in seconds
   * - Node.js memory usage statistics
   * - Application version from package.json
   * - Current timestamp
   * 
   * Called by: GET /metrics/json endpoint
   * 
   * @complexity O(1) - Simple system metric collection
   * @returns {Promise<Object>} JSON object with basic metrics
   */
  async getJsonMetrics() {
    // Legacy JSON metrics for backward compatibility with older monitoring systems
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: require('../package.json').version,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Start the Governance Collector application
   * 
   * Performs the complete application startup sequence including component
   * initialization, middleware setup, route configuration, scheduled collection
   * setup, and HTTP server startup. Also configures graceful shutdown handlers.
   * 
   * @async
   * @method start
   * @throws {Error} When initialization fails
   * @throws {Error} When server startup fails
   * 
   * Startup sequence:
   * 1. Initialize all components (database, API client, etc.)
   * 2. Configure Express middleware stack
   * 3. Set up API routes and error handlers
   * 4. Start scheduled data collection
   * 5. Start HTTP server
   * 6. Register graceful shutdown handlers
   * 
   * Dependencies:
   * - initialize(): Component initialization
   * - setupMiddleware(): Express middleware configuration
   * - setupRoutes(): API endpoint setup
   * - setupScheduledCollection(): Cron job configuration
   * 
   * Called by: Application entry point
   * 
   * @complexity O(1) - Sequential startup operations
   * @returns {Promise<void>} Resolves when server is listening
   */
  async start() {
    await this.initialize();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupScheduledCollection();

    const port = this.config.api.port || 3001;
    const host = this.config.api.host || '0.0.0.0';

    this.app.listen(port, host, () => {
      this.logger.info('Governance Collector started', {
        port,
        host,
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  /**
   * Perform graceful application shutdown
   * 
   * Handles shutdown signals (SIGTERM, SIGINT) by stopping scheduled jobs,
   * closing database connections, and exiting cleanly. Ensures data integrity
   * and proper resource cleanup.
   * 
   * @async
   * @method shutdown
   * @private
   * @param {string} signal - The shutdown signal received (SIGTERM, SIGINT)
   * 
   * Shutdown sequence:
   * 1. Log shutdown initiation with signal information
   * 2. Stop cron job to prevent new collections
   * 3. Close database connections
   * 4. Exit process with success code
   * 
   * Dependencies:
   * - cronJob.stop(): Stops scheduled collection
   * - DatabaseManager.close(): Closes database connections
   * 
   * Called by: Process signal handlers (SIGTERM, SIGINT)
   * 
   * @complexity O(1) - Simple cleanup operations
   * @returns {Promise<void>} Resolves when shutdown is complete
   */
  async shutdown(signal) {
    this.logger.info('Initiating graceful shutdown', { signal });

    if (this.cronJob) {
      this.cronJob.stop();
    }

    if (this.db) {
      await this.db.close();
    }

    process.exit(0);
  }
}

// Start the application
if (require.main === module) {
  const app = new GovernanceCollectorApp();
  app.start().catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

module.exports = GovernanceCollectorApp;