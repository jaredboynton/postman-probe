/**
 * Database Manager - SQLite Database Operations and Schema Management
 * 
 * Enterprise-grade SQLite database manager for the Postman Governance Collector.
 * Handles database initialization, schema management, data persistence, and querying
 * with support for transactions, indexing, and time series data storage.
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

/**
 * Database Manager Class
 * 
 * Comprehensive SQLite database management system for governance metrics storage.
 * Provides secure data persistence, transactional operations, and optimized querying
 * for time series governance data with proper indexing and schema management.
 * 
 * @class DatabaseManager
 * @description Enterprise SQLite database management for governance monitoring
 * 
 * Database schema includes:
 * - governance_metrics: Time series governance scores and organizational data
 * - governance_violations: Compliance violations with workspace mapping
 * - workspace_admins: Administrator contact information for violations
 * - collection_metadata: Collection-level governance and organizational data
 * - system_metadata: Application configuration and runtime metadata
 * 
 * Dependencies:
 * - sqlite3: SQLite database engine with Node.js bindings
 * - fs: File system operations for database directory management
 * - path: Path manipulation for database file location
 * 
 * Called by: GovernanceCollectorApp for all data persistence operations
 * Calls into: SQLite database engine, file system
 * 
 * @complexity O(1) for initialization, O(n) for data operations where n is record count
 */
class DatabaseManager {
  /**
   * Initialize Database Manager instance
   * 
   * Sets up the database manager with configuration and logging dependencies.
   * Does not establish database connection - that happens in initialize().
   * 
   * @constructor
   * @param {Object} config - Database configuration including path and SQLite settings
   * @param {Object} logger - Logger instance for database operation logging
   * 
   * Configuration expected:
   * - config.path: Database file path
   * - config.pragma_settings: SQLite PRAGMA configuration
   * - config.wal_mode: Write-Ahead Logging mode setting
   * 
   * @complexity O(1) - Simple instance variable initialization
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.db = null;
  }
  
  /**
   * Initialize database connection and schema
   * 
   * Complete database initialization sequence including directory creation,
   * connection establishment, SQLite configuration, and schema setup.
   * Must be called before any database operations.
   * 
   * @async
   * @method initialize
   * @throws {Error} When database directory creation fails
   * @throws {Error} When database connection fails
   * @throws {Error} When SQLite configuration fails
   * @throws {Error} When schema initialization fails
   * 
   * Initialization sequence:
   * 1. Create database directory if it doesn't exist
   * 2. Establish SQLite database connection
   * 3. Configure SQLite PRAGMA settings (WAL mode, cache, etc.)
   * 4. Initialize database schema with tables and indexes
   * 5. Log successful initialization
   * 
   * Dependencies:
   * - path.dirname(): Extract directory from database path
   * - fs.existsSync(): Check directory existence
   * - fs.mkdirSync(): Create database directory
   * - sqlite3.Database(): Create database connection
   * - configureSQLite(): Apply SQLite performance settings
   * - initializeSchema(): Create tables and indexes
   * 
   * Called by: GovernanceCollectorApp.initialize()
   * Calls into: configureSQLite(), initializeSchema()
   * 
   * @complexity O(1) - Linear initialization operations
   * @returns {Promise<void>} Resolves when database is ready for operations
   */
  async initialize() {
    try {
      // Ensure data directory exists
      const dbDir = path.dirname(this.config.path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        this.logger.info('Created database directory', { path: dbDir });
      }
      
      // Open database connection
      this.db = new sqlite3.Database(this.config.path, (err) => {
        if (err) {
          throw new Error(`Failed to open database: ${err.message}`);
        }
      });
      
      // Configure SQLite settings
      await this.configureSQLite();
      
      // Initialize schema
      await this.initializeSchema();
      
      this.logger.info('Database initialized successfully', {
        path: this.config.path,
        walMode: this.config.wal_mode
      });
      
    } catch (error) {
      this.logger.error('Database initialization failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Configure SQLite performance and reliability settings
   * 
   * Applies PRAGMA settings for optimal performance in production environments.
   * Configures WAL mode for concurrent access, cache size for performance,
   * and synchronization level for data integrity vs. speed balance.
   * 
   * @async
   * @method configureSQLite
   * @private
   * @throws {Error} When PRAGMA statement execution fails
   * 
   * SQLite settings applied:
   * - synchronous: Data integrity vs. performance balance (NORMAL recommended)
   * - cache_size: Memory cache for database pages (negative = KB, positive = pages)
   * - temp_store: Temporary table storage location (MEMORY for performance)
   * - journal_mode: Transaction logging mode (WAL for concurrent access)
   * 
   * Performance considerations:
   * - WAL mode enables concurrent readers with single writer
   * - Larger cache_size improves query performance
   * - MEMORY temp_store reduces disk I/O for temporary operations
   * - NORMAL synchronous balances integrity and performance
   * 
   * Dependencies:
   * - this.config.pragma_settings: Configuration for SQLite PRAGMA values
   * - this.db.run(): Execute PRAGMA statements
   * 
   * Called by: initialize()
   * 
   * @complexity O(1) - Fixed number of PRAGMA statements
   * @returns {Promise<void>} Resolves when all PRAGMA settings are applied
   */
  async configureSQLite() {
    const settings = this.config.pragma_settings;
    
    return new Promise((resolve, reject) => {
      const statements = [
        `PRAGMA synchronous = ${settings.synchronous}`,
        `PRAGMA cache_size = ${settings.cache_size}`,
        `PRAGMA temp_store = ${settings.temp_store}`,
        `PRAGMA journal_mode = ${settings.journal_mode}`
      ];
      
      let completed = 0;
      const total = statements.length;
      
      statements.forEach(statement => {
        this.db.run(statement, (err) => {
          if (err) {
            reject(new Error(`Failed to configure SQLite: ${err.message}`));
            return;
          }
          
          completed++;
          if (completed === total) {
            resolve();
          }
        });
      });
    });
  }
  
  /**
   * Initialize database schema with tables and indexes
   * 
   * Creates the complete database schema for governance monitoring including
   * all tables, constraints, and performance indexes. Designed for time series
   * data storage with efficient querying and workspace-based organization.
   * 
   * @async
   * @method initializeSchema
   * @private
   * @throws {Error} When schema creation fails
   * 
   * Database schema design:
   * 
   * **governance_metrics table:**
   * - Time series storage for governance scores and organizational metrics
   * - Includes overall, documentation, testing, monitoring, organization scores
   * - Organizational insights (workspaces, collections, users, forks, etc.)
   * - JSON storage for raw metrics data
   * 
   * **governance_violations table:**
   * - Compliance violations with severity levels and workspace mapping
   * - Links violations to specific entities (collections, users, etc.)
   * - Administrator contact information for remediation
   * 
   * **workspace_admins table:**
   * - Administrator contact directory for violation notifications
   * - Unique constraint on workspace_id + admin_user_id
   * 
   * **collection_metadata table:**
   * - Collection-level governance and organizational data
   * - Specification status, endpoint counts, testing coverage
   * 
   * **system_metadata table:**
   * - Key-value storage for application configuration and runtime data
   * 
   * **Performance indexes:**
   * - Timestamp indexes for time series queries
   * - Foreign key indexes for joins
   * - Violation type/severity indexes for filtering
   * 
   * Dependencies:
   * - this.db.exec(): Execute multi-statement SQL schema
   * 
   * Called by: initialize()
   * 
   * @complexity O(1) - Fixed schema creation operations
   * @returns {Promise<void>} Resolves when schema is created successfully
   */
  async initializeSchema() {
    const schema = `
      -- Governance metrics table
      CREATE TABLE IF NOT EXISTS governance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        collection_id TEXT NOT NULL,
        
        -- Overall scores
        overall_score REAL NOT NULL,
        documentation_score REAL NOT NULL,
        testing_score REAL NOT NULL,
        monitoring_score REAL NOT NULL,
        organization_score REAL NOT NULL,
        
        -- Detailed metrics
        total_workspaces INTEGER NOT NULL,
        total_collections INTEGER NOT NULL,
        total_users INTEGER NOT NULL,
        total_forks INTEGER NOT NULL,
        total_postbot_uses INTEGER NOT NULL,
        total_mocks INTEGER NOT NULL DEFAULT 0,
        total_monitors INTEGER NOT NULL DEFAULT 0,
        
        -- User management
        orphaned_users INTEGER NOT NULL,
        user_groups INTEGER NOT NULL,
        
        -- Collection insights
        collections_without_specs INTEGER NOT NULL,
        documented_endpoints INTEGER NOT NULL,
        total_endpoints INTEGER NOT NULL,
        tested_endpoints INTEGER NOT NULL,
        
        -- Organization insights
        team_workspaces INTEGER NOT NULL,
        private_workspaces INTEGER NOT NULL,
        
        -- Raw data (JSON)
        raw_metrics TEXT
      );
      
      -- Governance violations table
      CREATE TABLE IF NOT EXISTS governance_violations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        collection_id TEXT NOT NULL,
        violation_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        workspace_id TEXT,
        workspace_name TEXT,
        severity TEXT NOT NULL,
        description TEXT NOT NULL,
        workspace_admin_email TEXT
      );
      
      -- Workspace administrators table
      CREATE TABLE IF NOT EXISTS workspace_admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        workspace_id TEXT NOT NULL,
        workspace_name TEXT NOT NULL,
        admin_user_id TEXT NOT NULL,
        admin_email TEXT NOT NULL,
        admin_name TEXT NOT NULL,
        UNIQUE(workspace_id, admin_user_id)
      );
      
      -- Collection metadata table
      CREATE TABLE IF NOT EXISTS collection_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        collection_id TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        workspace_name TEXT NOT NULL,
        has_specification BOOLEAN NOT NULL,
        endpoint_count INTEGER NOT NULL,
        documented_endpoints INTEGER NOT NULL,
        tested_endpoints INTEGER NOT NULL,
        fork_count INTEGER NOT NULL
      );
      
      -- System metadata table
      CREATE TABLE IF NOT EXISTS system_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes separately
      CREATE INDEX IF NOT EXISTS idx_governance_timestamp ON governance_metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_governance_collection_id ON governance_metrics(collection_id);
      
      CREATE INDEX IF NOT EXISTS idx_violations_timestamp ON governance_violations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_violations_collection_id ON governance_violations(collection_id);
      CREATE INDEX IF NOT EXISTS idx_violations_type ON governance_violations(violation_type);
      CREATE INDEX IF NOT EXISTS idx_violations_severity ON governance_violations(severity);
      
      CREATE INDEX IF NOT EXISTS idx_admins_workspace_id ON workspace_admins(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_admins_email ON workspace_admins(admin_email);
      
      CREATE INDEX IF NOT EXISTS idx_collections_collection_id ON collection_metadata(collection_id);
      CREATE INDEX IF NOT EXISTS idx_collections_workspace_id ON collection_metadata(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_collections_timestamp ON collection_metadata(timestamp);
    `;
    
    return new Promise((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) {
          reject(new Error(`Failed to initialize schema: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * Store governance metrics and violations in database transaction
   * 
   * Main data storage method that persists all governance data atomically.
   * Uses database transactions to ensure data consistency and generates
   * unique collection IDs for tracking data collection cycles.
   * 
   * @async
   * @method storeMetrics
   * @param {Object} metrics - Governance metrics data from calculator
   * @param {Object} violations - Governance violations by type
   * @throws {Error} When transaction fails or data storage fails
   * 
   * Transaction workflow:
   * 1. Generate unique collection ID for this data collection cycle
   * 2. Begin database transaction for atomicity
   * 3. Store main governance metrics (scores, counts, etc.)
   * 4. Store governance violations with workspace mapping
   * 5. Store workspace administrator information (if available)
   * 6. Store collection metadata (if available)
   * 7. Commit transaction or rollback on failure
   * 
   * Data consistency:
   * - All data for a collection cycle has the same collection_id
   * - Transaction ensures all-or-nothing storage
   * - Rollback on any failure prevents partial data
   * 
   * Dependencies:
   * - run(): Execute SQL statements with transaction control
   * - storeMainMetrics(): Store governance metrics table data
   * - storeViolations(): Store violations table data
   * - storeWorkspaceAdmins(): Store admin contact information
   * - storeCollectionMetadata(): Store collection-level metadata
   * 
   * Called by: GovernanceCollectorApp.runCollection()
   * Calls into: storeMainMetrics(), storeViolations(), storeWorkspaceAdmins(), storeCollectionMetadata()
   * 
   * @complexity O(n) where n is the total number of violations and collections
   * @returns {Promise<void>} Resolves when all data is stored successfully
   */
  async storeMetrics(metrics, violations) {
    const collectionId = `collection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Begin transaction
      await this.run('BEGIN TRANSACTION');
      
      // Store main metrics
      await this.storeMainMetrics(collectionId, metrics);
      
      // Store violations
      await this.storeViolations(collectionId, violations);
      
      // Store workspace admins
      if (metrics.workspaceAdmins) {
        await this.storeWorkspaceAdmins(metrics.workspaceAdmins);
      }
      
      // Store collection metadata
      if (metrics.collectionMetadata) {
        await this.storeCollectionMetadata(metrics.collectionMetadata);
      }
      
      // Commit transaction
      await this.run('COMMIT');
      
      this.logger.info('Metrics stored successfully', {
        collectionId,
        metricsStored: Object.keys(metrics).length,
        violationsStored: Object.values(violations).reduce((sum, arr) => sum + arr.length, 0)
      });
      
    } catch (error) {
      await this.run('ROLLBACK');
      this.logger.error('Failed to store metrics', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Store main governance metrics in database
   * 
   * Persists the primary governance metrics data including scores, organizational
   * insights, and user management statistics. Uses null coalescing to handle
   * missing data gracefully and stores raw metrics as JSON for future analysis.
   * 
   * @async
   * @method storeMainMetrics
   * @private
   * @param {string} collectionId - Unique identifier for this data collection cycle
   * @param {Object} metrics - Governance metrics data from calculator
   * @throws {Error} When SQL execution fails
   * 
   * Data mapping from metrics object:
   * - overallGovernanceScore: Overall governance score (0-100)
   * - documentationCoverage: Documentation analysis results
   * - testCoverage: Testing coverage analysis
   * - monitoringCoverage: Monitoring setup analysis
   * - organizationStructure: Workspace organization analysis
   * - organizationalInsights: Organizational statistics
   * - userManagement: User and group management data
   * 
   * Data safety:
   * - Uses null coalescing (?. and ||) to handle missing nested properties
   * - Defaults to 0 for numeric values to prevent NULL database entries
   * - Stores complete raw metrics as JSON for future analysis
   * 
   * Dependencies:
   * - run(): Execute parameterized SQL statement
   * - JSON.stringify(): Serialize raw metrics data
   * 
   * Called by: storeMetrics()
   * 
   * @complexity O(1) - Single INSERT statement
   * @returns {Promise<Object>} Database operation result with lastID and changes
   */
  async storeMainMetrics(collectionId, metrics) {
    const stmt = `
      INSERT INTO governance_metrics (
        collection_id, overall_score, documentation_score, testing_score,
        monitoring_score, organization_score, total_workspaces, total_collections,
        total_users, total_forks, total_postbot_uses, total_mocks, total_monitors,
        orphaned_users, user_groups, collections_without_specs, documented_endpoints, 
        total_endpoints, tested_endpoints, team_workspaces, private_workspaces, raw_metrics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      collectionId,
      metrics.overallGovernanceScore || 0,
      metrics.documentationCoverage?.score || 0,
      metrics.testCoverage?.score || 0,
      metrics.monitoringCoverage?.score || 0,
      metrics.organizationStructure?.score || 0,
      metrics.organizationalInsights?.totalWorkspaces || 0,
      metrics.organizationalInsights?.totalCollections || 0,
      metrics.userManagement?.totalUsers || 0,
      metrics.organizationalInsights?.totalForks || 0,
      metrics.userManagement?.totalPostbotUses || 0,
      metrics.organizationalInsights?.totalMocks || 0,
      metrics.organizationalInsights?.totalMonitors || 0,
      metrics.userManagement?.orphanedUsers || 0,
      metrics.userManagement?.totalUserGroups || 0,
      metrics.organizationalInsights?.collectionsWithoutSpecs || 0,
      metrics.documentationCoverage?.documentedEndpoints || 0,
      metrics.documentationCoverage?.totalEndpoints || 0,
      metrics.testCoverage?.testedEndpoints || 0,
      metrics.organizationStructure?.teamWorkspaces || 0,
      metrics.organizationStructure?.privateWorkspaces || 0,
      JSON.stringify(metrics)
    ];
    
    return this.run(stmt, values);
  }
  
  /**
   * Store governance violations with workspace mapping
   * 
   * Processes and stores all governance violations by type, mapping them to
   * workspaces and administrators for remediation tracking. Flattens nested
   * violation data structure into individual database records.
   * 
   * @async
   * @method storeViolations
   * @private
   * @param {string} collectionId - Unique identifier for this data collection cycle
   * @param {Object} violations - Violations grouped by type from calculator
   * @throws {Error} When SQL execution fails
   * 
   * Data structure processing:
   * - Input: Object with violation types as keys and arrays of violations as values
   * - Output: Flattened individual violation records with workspace mapping
   * - Missing data handling: Provides defaults for all fields
   * 
   * Violation fields mapped:
   * - violation_type: Type of governance violation
   * - entity_id: ID of the violating entity (collection, user, etc.)
   * - entity_name: Human-readable name of the violating entity
   * - workspace_id: Associated workspace ID for context
   * - workspace_name: Human-readable workspace name
   * - severity: Violation severity level (critical, high, medium, low)
   * - description: Detailed violation description
   * - workspace_admin_email: Administrator contact for remediation
   * 
   * Performance consideration:
   * - Uses sequential INSERTs for data integrity
   * - Could be optimized with batch INSERT for large datasets
   * 
   * Dependencies:
   * - Object.entries(): Process violations by type
   * - run(): Execute parameterized SQL statements
   * 
   * Called by: storeMetrics()
   * 
   * @complexity O(n) where n is the total number of violations across all types
   * @returns {Promise<void>} Resolves when all violations are stored
   */
  async storeViolations(collectionId, violations) {
    const stmt = `
      INSERT INTO governance_violations (
        collection_id, violation_type, entity_id, entity_name,
        workspace_id, workspace_name, severity, description, workspace_admin_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const allViolations = [];
    Object.entries(violations).forEach(([type, items]) => {
      items.forEach(item => {
        allViolations.push([
          collectionId,
          type,
          item.id || item.entityId || 'unknown',
          item.name || item.entityName || 'Unknown',
          item.workspaceId || null,
          item.workspaceName || null,
          item.severity || 'medium',
          item.description || `${type} violation`,
          item.workspaceAdminEmail || null
        ]);
      });
    });
    
    // Batch insert violations
    for (const violation of allViolations) {
      await this.run(stmt, violation);
    }
  }
  
  /**
   * Store workspace administrator contact information
   * 
   * Maintains an up-to-date directory of workspace administrators for violation
   * notifications and governance communication. Uses INSERT OR REPLACE to
   * handle administrator changes over time.
   * 
   * @async
   * @method storeWorkspaceAdmins
   * @private
   * @param {Array<Object>} admins - Array of administrator records
   * @throws {Error} When SQL execution fails
   * 
   * Administrator record structure:
   * - workspaceId: Unique workspace identifier
   * - workspaceName: Human-readable workspace name
   * - userId: Administrator user ID
   * - email: Administrator email for notifications
   * - name: Administrator display name
   * 
   * Data management:
   * - Uses INSERT OR REPLACE for upsert behavior
   * - Unique constraint on (workspace_id, admin_user_id) prevents duplicates
   * - Updates existing records when administrator data changes
   * 
   * Dependencies:
   * - run(): Execute parameterized SQL statement
   * 
   * Called by: storeMetrics()
   * 
   * @complexity O(n) where n is the number of administrators
   * @returns {Promise<void>} Resolves when all administrators are stored
   */
  async storeWorkspaceAdmins(admins) {
    const stmt = `
      INSERT OR REPLACE INTO workspace_admins (
        workspace_id, workspace_name, admin_user_id, admin_email, admin_name
      ) VALUES (?, ?, ?, ?, ?)
    `;
    
    for (const admin of admins) {
      await this.run(stmt, [
        admin.workspaceId,
        admin.workspaceName,
        admin.userId,
        admin.email,
        admin.name
      ]);
    }
  }
  
  /**
   * Store collection-level governance metadata
   * 
   * Maintains detailed governance information for individual collections
   * including specification status, endpoint counts, and testing coverage.
   * Used for collection-level governance analysis and reporting.
   * 
   * @async
   * @method storeCollectionMetadata
   * @private
   * @param {Array<Object>} collections - Array of collection metadata records
   * @throws {Error} When SQL execution fails
   * 
   * Collection metadata structure:
   * - id: Unique collection identifier
   * - name: Collection display name
   * - workspaceId: Parent workspace identifier
   * - workspaceName: Parent workspace name
   * - hasSpecification: Boolean indicating API specification presence
   * - endpointCount: Total number of API endpoints
   * - documentedEndpoints: Count of documented endpoints
   * - testedEndpoints: Count of endpoints with tests
   * - forkCount: Number of collection forks
   * 
   * Data management:
   * - Uses INSERT OR REPLACE for upsert behavior
   * - Updates collection metadata as governance analysis evolves
   * - Maintains historical tracking through timestamp field
   * 
   * Dependencies:
   * - run(): Execute parameterized SQL statement
   * 
   * Called by: storeMetrics()
   * 
   * @complexity O(n) where n is the number of collections
   * @returns {Promise<void>} Resolves when all collection metadata is stored
   */
  async storeCollectionMetadata(collections) {
    const stmt = `
      INSERT OR REPLACE INTO collection_metadata (
        collection_id, collection_name, workspace_id, workspace_name,
        has_specification, endpoint_count, documented_endpoints,
        tested_endpoints, fork_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    for (const collection of collections) {
      await this.run(stmt, [
        collection.id,
        collection.name,
        collection.workspaceId,
        collection.workspaceName,
        collection.hasSpecification,
        collection.endpointCount,
        collection.documentedEndpoints,
        collection.testedEndpoints,
        collection.forkCount
      ]);
    }
  }
  
  /**
   * Query historical governance metrics with time bucketing
   * 
   * Retrieves time series governance data aggregated by time intervals
   * for trend analysis and historical dashboards. Supports both hourly
   * and daily aggregation with average score calculations.
   * 
   * @async
   * @method getHistoricalMetrics
   * @param {string} from - Start date/time in ISO format
   * @param {string} to - End date/time in ISO format
   * @param {string} [interval='hour'] - Time bucket interval ('hour' or 'day')
   * @throws {Error} When SQL execution fails
   * 
   * Time bucketing:
   * - 'hour': Groups data by hour (YYYY-MM-DD HH:00:00)
   * - 'day': Groups data by day (YYYY-MM-DD)
   * - Uses SQLite strftime() for efficient time grouping
   * 
   * Aggregation:
   * - Calculates average scores across all data points in each time bucket
   * - Includes data_points count for statistical significance
   * - Handles missing data gracefully through SQL aggregation
   * 
   * Return format:
   * - time_bucket: Formatted time bucket string
   * - avg_overall_score: Average overall governance score
   * - avg_documentation_score: Average documentation coverage score
   * - avg_testing_score: Average testing coverage score
   * - avg_monitoring_score: Average monitoring coverage score
   * - avg_organization_score: Average organization structure score
   * - data_points: Number of raw data points in this bucket
   * 
   * Dependencies:
   * - all(): Execute query and return multiple rows
   * - SQLite strftime(): Time formatting and grouping
   * 
   * Called by: GET /api/governance/metrics endpoint
   * 
   * @complexity O(n log n) where n is the number of metrics records (due to GROUP BY)
   * @returns {Promise<Array<Object>>} Array of time-bucketed governance metrics
   */
  async getHistoricalMetrics(from, to, interval = 'hour') {
    const groupBy = interval === 'day' ? 
      "strftime('%Y-%m-%d', timestamp)" :
      "strftime('%Y-%m-%d %H:00:00', timestamp)";
    
    const stmt = `
      SELECT 
        ${groupBy} as time_bucket,
        AVG(overall_score) as avg_overall_score,
        AVG(documentation_score) as avg_documentation_score,
        AVG(testing_score) as avg_testing_score,
        AVG(monitoring_score) as avg_monitoring_score,
        AVG(organization_score) as avg_organization_score,
        COUNT(*) as data_points
      FROM governance_metrics
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY ${groupBy}
      ORDER BY time_bucket
    `;
    
    return this.all(stmt, [from, to]);
  }

  /**
   * Get latest governance metrics summary for current status
   * 
   * Retrieves the most recent governance metrics data for dashboard
   * stat panels and current status displays. Provides fallback defaults
   * for systems with no historical data.
   * 
   * @async
   * @method getLatestMetricsSummary
   * @throws {Error} When SQL execution fails
   * 
   * Data retrieved:
   * - Governance scores (overall, documentation, testing, monitoring, organization)
   * - Organizational counts (workspaces, collections, users, forks)
   * - Platform usage (mocks, monitors, Postbot uses)
   * - Governance issues (orphaned users, collections without specs)
   * - Collection timestamp for data freshness indication
   * 
   * Fallback behavior:
   * - Returns zero-filled object if no metrics exist yet
   * - Prevents dashboard errors during initial deployment
   * - Maintains consistent data structure for consumers
   * 
   * Query optimization:
   * - Uses ORDER BY timestamp DESC LIMIT 1 for efficiency
   * - Leverages timestamp index for fast retrieval
   * - Single row result minimizes memory usage
   * 
   * Dependencies:
   * - get(): Execute query and return single row
   * 
   * Called by: 
   * - GET /api/governance/summary endpoint
   * - Prometheus metrics generation
   * - Dashboard stat panels
   * 
   * @complexity O(log n) where n is the number of metrics records (due to index scan)
   * @returns {Promise<Object>} Latest governance metrics or zero-filled defaults
   */
  async getLatestMetricsSummary() {
    const stmt = `
      SELECT 
        overall_score as avg_overall_score,
        documentation_score as avg_documentation_score,
        testing_score as avg_testing_score,
        monitoring_score as avg_monitoring_score,
        organization_score as avg_organization_score,
        total_workspaces,
        total_collections,
        total_users,
        total_forks,
        total_postbot_uses,
        total_mocks,
        total_monitors,
        orphaned_users,
        collections_without_specs,
        timestamp
      FROM governance_metrics 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;
    
    const result = await this.get(stmt);
    return result || {
      avg_overall_score: 0,
      avg_documentation_score: 0,
      avg_testing_score: 0,
      avg_monitoring_score: 0,
      avg_organization_score: 0,
      total_workspaces: 0,
      total_collections: 0,
      total_users: 0,
      total_forks: 0,
      total_postbot_uses: 0,
      total_mocks: 0,
      total_monitors: 0,
      orphaned_users: 0,
      collections_without_specs: 0
    };
  }
  
  /**
   * Query historical governance violations within date range
   * 
   * Retrieves governance violations that occurred within a specific time period,
   * grouped by violation type and entity to avoid duplicates. Used for
   * historical analysis and trend identification.
   * 
   * @async
   * @method getHistoricalViolations
   * @param {string} from - Start date/time in ISO format
   * @param {string} to - End date/time in ISO format
   * @throws {Error} When SQL execution fails
   * 
   * Grouping strategy:
   * - Groups by violation_type and entity_id to consolidate duplicate violations
   * - Shows latest occurrence timestamp for each unique violation
   * - Counts total occurrences of each violation within the time range
   * 
   * Return data:
   * - violation_type: Type of governance violation
   * - severity: Violation severity level
   * - count: Number of occurrences within the time range
   * - entity_name: Name of the violating entity
   * - workspace_name: Associated workspace name
   * - description: Violation description
   * - latest_occurrence: Most recent occurrence timestamp
   * 
   * Sort order:
   * - Orders by latest_occurrence DESC to show most recent violations first
   * - Helps prioritize recent governance issues
   * 
   * Dependencies:
   * - all(): Execute query and return multiple rows
   * 
   * Called by: GET /api/governance/violations endpoint with date parameters
   * 
   * @complexity O(n log n) where n is the number of violations (due to GROUP BY and ORDER BY)
   * @returns {Promise<Array<Object>>} Array of grouped historical violations
   */
  async getHistoricalViolations(from, to) {
    const stmt = `
      SELECT 
        violation_type,
        severity,
        COUNT(*) as count,
        entity_name,
        workspace_name,
        description,
        MAX(timestamp) as latest_occurrence
      FROM governance_violations
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY violation_type, entity_id
      ORDER BY latest_occurrence DESC
    `;
    
    return this.all(stmt, [from, to]);
  }
  
  /**
   * Get all current governance violations without date filtering
   * 
   * Retrieves all governance violations in the database, grouped by
   * violation type and entity. Used for comprehensive violation analysis
   * and dashboard displays showing the complete governance state.
   * 
   * @async
   * @method getCurrentViolations
   * @throws {Error} When SQL execution fails
   * 
   * Grouping behavior:
   * - Groups by violation_type and entity_id to avoid showing duplicates
   * - Shows count of each unique violation across all collection cycles
   * - Displays latest occurrence timestamp for each violation
   * 
   * Use cases:
   * - Dashboard violation overview
   * - Complete governance state assessment
   * - Long-term violation trend analysis
   * 
   * Performance consideration:
   * - Scans entire violations table
   * - Consider adding time-based filtering for large datasets
   * - Leverages indexes on violation_type and timestamp
   * 
   * Dependencies:
   * - all(): Execute query and return multiple rows
   * 
   * Called by: Internal violation analysis methods
   * 
   * @complexity O(n log n) where n is the total number of violations (due to GROUP BY and ORDER BY)
   * @returns {Promise<Array<Object>>} Array of all grouped violations
   */
  async getCurrentViolations() {
    const stmt = `
      SELECT 
        violation_type,
        severity,
        COUNT(*) as count,
        entity_name,
        workspace_name,
        description,
        MAX(timestamp) as latest_occurrence
      FROM governance_violations
      GROUP BY violation_type, entity_id
      ORDER BY latest_occurrence DESC
    `;
    
    return this.all(stmt);
  }
  
  /**
   * Get violation summary statistics by type
   * 
   * Provides aggregated violation counts by type for high-level governance
   * dashboards and Prometheus metrics. Shows the distribution of violation
   * types across the entire organization.
   * 
   * @async
   * @method getViolationSummary
   * @throws {Error} When SQL execution fails
   * 
   * Aggregation:
   * - Groups all violations by violation_type
   * - Counts total occurrences of each violation type
   * - Orders by count DESC to show most common violations first
   * 
   * Use cases:
   * - Prometheus metrics generation
   * - Dashboard summary statistics
   * - Violation type distribution analysis
   * - Priority identification for governance improvements
   * 
   * Return data:
   * - violation_type: Type of governance violation
   * - count: Total number of violations of this type
   * 
   * Performance:
   * - Efficient aggregation using GROUP BY
   * - Leverages violation_type index
   * - Small result set suitable for frequent polling
   * 
   * Dependencies:
   * - all(): Execute query and return multiple rows
   * 
   * Called by:
   * - Prometheus metrics endpoint
   * - GET /api/governance/violations endpoint (default)
   * - Dashboard summary components
   * 
   * @complexity O(n) where n is the number of unique violation types (typically small)
   * @returns {Promise<Array<Object>>} Array of violation type summaries
   */
  async getViolationSummary() {
    const stmt = `
      SELECT 
        violation_type,
        COUNT(*) as count
      FROM governance_violations
      GROUP BY violation_type 
      ORDER BY count DESC
    `;
    
    return this.all(stmt);
  }

  /**
   * Get detailed violations for actionable dashboard table
   * 
   * Retrieves comprehensive violation information with administrator contacts
   * and actionable descriptions for the "Actionable Governance Violations" dashboard.
   * Includes JOIN with workspace administrators and human-readable action items.
   * 
   * @async
   * @method getDetailedViolations
   * @param {number} [limit=50] - Maximum number of violations to return
   * @throws {Error} When SQL execution fails
   * 
   * Data enrichment:
   * - Joins with workspace_admins table for administrator contact information
   * - Uses COALESCE to provide fallback admin contact resolution
   * - Transforms violation types into human-readable action descriptions
   * - Filters out violations with empty or null entity names
   * 
   * Human-readable action mapping:
   * - collectionsWithoutSpecs → "Collection missing API specification"
   * - missingDocumentation → "Endpoints lack proper documentation"
   * - untestedCollections → "Collection has no test coverage"
   * - orphanedUsers → "User not assigned to any workspace"
   * - unusedEnvironments → "Environment not actively used"
   * - Falls back to original description for other types
   * 
   * Sorting priority:
   * - Primary: Severity level (critical=1, high=2, medium=3, low=4)
   * - Secondary: Timestamp DESC (most recent first within severity)
   * - Ensures most critical and recent violations appear first
   * 
   * CSV/JSON format support:
   * - Data structure designed for both JSON API and CSV export
   * - Column names match expected dashboard table headers
   * - Admin contact resolution for notification workflows
   * 
   * Dependencies:
   * - all(): Execute query and return multiple rows
   * - LEFT JOIN: Connect violations with administrator information
   * - CASE/COALESCE: Data transformation and fallback handling
   * 
   * Called by: GET /api/governance/violations/detailed endpoint
   * 
   * @complexity O(n log n) where n is the number of violations (due to JOIN and ORDER BY)
   * @returns {Promise<Array<Object>>} Array of detailed violations with admin contacts
   */
  async getDetailedViolations(limit = 50) {
    const stmt = `
      SELECT 
        gv.violation_type,
        gv.entity_name,
        gv.workspace_name,
        gv.severity,
        gv.description,
        gv.workspace_admin_email,
        gv.timestamp,
        COALESCE(wa.admin_email, gv.workspace_admin_email, 'No admin found') as admin_contact,
        CASE 
          WHEN gv.violation_type = 'collectionsWithoutSpecs' THEN 'Collection missing API specification'
          WHEN gv.violation_type = 'missingDocumentation' THEN 'Endpoints lack proper documentation'
          WHEN gv.violation_type = 'untestedCollections' THEN 'Collection has no test coverage'
          WHEN gv.violation_type = 'orphanedUsers' THEN 'User not assigned to any workspace'
          WHEN gv.violation_type = 'unusedEnvironments' THEN 'Environment not actively used'
          ELSE gv.description
        END as action_needed
      FROM governance_violations gv
      LEFT JOIN workspace_admins wa ON gv.workspace_id = wa.workspace_id
      WHERE gv.entity_name IS NOT NULL 
        AND gv.entity_name != ''
      ORDER BY 
        CASE gv.severity 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END,
        gv.timestamp DESC
      LIMIT ?
    `;
    
    return this.all(stmt, [limit]);
  }
  
  /**
   * Get metric trends for specific governance metrics
   * 
   * Analyzes trends for individual governance metrics over a specified time period.
   * Groups data by day and calculates averages for trend visualization and analysis.
   * 
   * @async
   * @method getMetricTrends
   * @param {string} metric - Database column name for the metric to analyze
   * @param {string} [period='7d'] - Time period in format 'Nd' (e.g., '7d', '30d')
   * @throws {Error} When SQL execution fails or metric column is invalid
   * 
   * Supported metrics:
   * - overall_score: Overall governance score
   * - documentation_score: Documentation coverage score
   * - testing_score: Testing coverage score
   * - monitoring_score: Monitoring coverage score
   * - organization_score: Organization structure score
   * - Any numeric column from governance_metrics table
   * 
   * Period parsing:
   * - Extracts numeric value from period string (e.g., '30d' → 30)
   * - Defaults to 7 days if parsing fails
   * - Uses SQLite datetime() function for date arithmetic
   * 
   * Data aggregation:
   * - Groups by calendar day using strftime('%Y-%m-%d')
   * - Calculates average value for each day
   * - Orders chronologically for trend visualization
   * 
   * Return format:
   * - date: Calendar date in YYYY-MM-DD format
   * - value: Average metric value for that day
   * 
   * Security note:
   * - Metric parameter is used directly in SQL (potential injection risk)
   * - Should validate metric parameter against allowed column names
   * 
   * Dependencies:
   * - all(): Execute query and return multiple rows
   * - SQLite strftime(): Date formatting and grouping
   * - SQLite datetime(): Date arithmetic for period calculation
   * 
   * Called by: GET /api/governance/trends endpoint
   * 
   * @complexity O(n log n) where n is the number of metrics in the time period
   * @returns {Promise<Array<Object>>} Array of daily trend data points
   */
  async getMetricTrends(metric, period = '7d') {
    const days = parseInt(period.replace('d', ''), 10) || 7;
    const stmt = `
      SELECT 
        strftime('%Y-%m-%d', timestamp) as date,
        AVG(${metric}) as value
      FROM governance_metrics
      WHERE timestamp >= datetime('now', '-${days} days')
      GROUP BY strftime('%Y-%m-%d', timestamp)
      ORDER BY date
    `;
    
    return this.all(stmt);
  }
  
  // Helper methods for database operations
  /**
   * Execute SQL statement with parameters (INSERT, UPDATE, DELETE)
   * 
   * Primary method for executing SQL statements that modify data.
   * Uses parameterized queries to prevent SQL injection and provides
   * detailed execution results including affected rows and generated IDs.
   * 
   * @async
   * @method run
   * @private
   * @param {string} sql - SQL statement with parameter placeholders (?)
   * @param {Array} [params=[]] - Array of parameter values
   * @throws {Error} When SQL execution fails
   * 
   * Security features:
   * - Uses parameterized queries to prevent SQL injection
   * - Parameters are properly escaped by SQLite driver
   * - Supports prepared statement optimization
   * 
   * Return value:
   * - lastID: ID of the last inserted row (for INSERT statements)
   * - changes: Number of rows affected by the statement
   * - Useful for verifying operation success and getting generated keys
   * 
   * Context binding:
   * - Uses function() instead of arrow function to preserve 'this' context
   * - 'this' refers to the SQLite statement context, not the class instance
   * - Provides access to lastID and changes properties
   * 
   * Dependencies:
   * - this.db.run(): SQLite database connection run method
   * 
   * Called by: All data modification methods in this class
   * 
   * @complexity O(1) for the wrapper, actual complexity depends on SQL operation
   * @returns {Promise<Object>} Object with lastID and changes properties
   */
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }
  
  /**
   * Execute SQL query and return all matching rows
   * 
   * Primary method for executing SELECT queries that return multiple rows.
   * Uses parameterized queries for security and returns complete result sets
   * for data analysis and reporting.
   * 
   * @async
   * @method all
   * @private
   * @param {string} sql - SQL SELECT statement with parameter placeholders (?)
   * @param {Array} [params=[]] - Array of parameter values
   * @throws {Error} When SQL execution fails
   * 
   * Security features:
   * - Uses parameterized queries to prevent SQL injection
   * - Parameters are properly escaped by SQLite driver
   * - Safe for user-controlled input values
   * 
   * Memory considerations:
   * - Loads entire result set into memory
   * - Suitable for most governance queries (typically small datasets)
   * - Consider pagination for very large result sets
   * 
   * Use cases:
   * - Historical data queries
   * - Violation summaries
   * - Metrics aggregation
   * - Dashboard data retrieval
   * 
   * Dependencies:
   * - this.db.all(): SQLite database connection all method
   * 
   * Called by: All query methods that return multiple rows
   * 
   * @complexity O(n) where n is the number of rows returned
   * @returns {Promise<Array<Object>>} Array of row objects
   */
  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
  
  /**
   * Execute SQL query and return first matching row
   * 
   * Method for executing SELECT queries that return a single row or need
   * only the first result. Optimized for queries with LIMIT 1 or unique
   * constraints where only one row is expected.
   * 
   * @async
   * @method get
   * @private
   * @param {string} sql - SQL SELECT statement with parameter placeholders (?)
   * @param {Array} [params=[]] - Array of parameter values
   * @throws {Error} When SQL execution fails
   * 
   * Return behavior:
   * - Returns single row object if found
   * - Returns undefined if no rows match
   * - Stops processing after first row (performance optimization)
   * 
   * Security features:
   * - Uses parameterized queries to prevent SQL injection
   * - Parameters are properly escaped by SQLite driver
   * - Safe for user-controlled input values
   * 
   * Common use cases:
   * - Latest metrics summary (ORDER BY timestamp DESC LIMIT 1)
   * - Configuration value retrieval
   * - Existence checks
   * - Single record lookups by ID
   * 
   * Performance:
   * - More efficient than all() for single-row queries
   * - Uses less memory as only one row is loaded
   * - Can benefit from query optimization with proper indexes
   * 
   * Dependencies:
   * - this.db.get(): SQLite database connection get method
   * 
   * Called by: Methods that need single row results
   * 
   * @complexity O(log n) for indexed queries, O(n) for table scans
   * @returns {Promise<Object|undefined>} Single row object or undefined
   */
  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }
  
  /**
   * Compatibility alias for get() method
   * 
   * Provides backward compatibility with health checker and other components
   * that expect a generic 'query' method. Simply delegates to get() method
   * for single-row query execution.
   * 
   * @async
   * @method query
   * @param {string} sql - SQL SELECT statement with parameter placeholders (?)
   * @param {Array} [params=[]] - Array of parameter values
   * @throws {Error} When SQL execution fails
   * 
   * Compatibility purpose:
   * - Health checker expects query() method for database connectivity tests
   * - Other legacy components may use query() instead of get()
   * - Maintains consistent API across different database implementations
   * 
   * Implementation:
   * - Direct delegation to get() method
   * - No additional processing or overhead
   * - Maintains same security and performance characteristics
   * 
   * Dependencies:
   * - get(): Primary single-row query method
   * 
   * Called by: HealthChecker and legacy compatibility consumers
   * 
   * @complexity Same as get() method
   * @returns {Promise<Object|undefined>} Single row object or undefined
   */
  async query(sql, params = []) {
    // Alias for compatibility with health checker
    return this.get(sql, params);
  }
  
  /**
   * Close database connection gracefully
   * 
   * Properly closes the SQLite database connection during application shutdown.
   * Ensures all pending operations complete and resources are released cleanly.
   * Part of the graceful shutdown process.
   * 
   * @async
   * @method close
   * @throws Never throws - errors are logged but not propagated
   * 
   * Shutdown behavior:
   * - Waits for pending database operations to complete
   * - Closes database connection if it exists
   * - Handles case where database was never initialized
   * - Always resolves (never rejects) for reliable shutdown
   * 
   * Error handling:
   * - Database close errors are logged but not thrown
   * - Ensures shutdown process continues even if close fails
   * - Provides logging for troubleshooting connection issues
   * 
   * Resource cleanup:
   * - Releases SQLite database file locks
   * - Frees memory allocated for database connection
   * - Allows clean application termination
   * 
   * Dependencies:
   * - this.db.close(): SQLite database connection close method
   * - this.logger: Logger instance for close event logging
   * 
   * Called by: 
   * - GovernanceCollectorApp.shutdown()
   * - Application SIGTERM/SIGINT handlers
   * 
   * @complexity O(1) - Simple connection cleanup
   * @returns {Promise<void>} Always resolves when connection is closed or was never open
   */
  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            this.logger.error('Error closing database', { error: err.message });
          } else {
            this.logger.info('Database connection closed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = DatabaseManager;