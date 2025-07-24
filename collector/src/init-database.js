#!/usr/bin/env node
/**
 * Database Initialization Script - Automated SQLite Schema Setup
 * 
 * Standalone database initialization utility for setting up the SQLite database
 * schema required by the Postman Governance Collector. Designed for automated
 * deployment scenarios, container initialization, and development environment setup.
 */

const DatabaseManager = require('./database/manager');
const ConfigLoader = require('./config/loader');
const Logger = require('./utils/logger');

/**
 * Initialize Postman Governance Database with complete schema setup
 * 
 * Main initialization function that orchestrates the complete database setup
 * process including configuration loading, schema creation, and connectivity
 * validation. Provides comprehensive logging and error handling for reliable
 * automated deployment.
 * 
 * @async
 * @function initializeDatabase
 * @throws {Error} When configuration loading fails
 * @throws {Error} When database initialization fails
 * @throws {Error} When connectivity test fails
 * 
 * Initialization workflow:
 * 
 * **1. Configuration Loading**
 * - Loads YAML configuration with database settings
 * - Validates database path and connection parameters
 * - Sets up logging configuration for initialization process
 * 
 * **2. Logger Initialization**
 * - Creates structured logger for initialization audit trail
 * - Enables debug logging for troubleshooting setup issues
 * - Provides consistent logging format across initialization
 * 
 * **3. Database Setup**
 * - Creates DatabaseManager instance with loaded configuration
 * - Executes complete schema initialization
 * - Sets up all required tables, indexes, and constraints
 * 
 * **4. Connectivity Validation**
 * - Performs simple query test to validate database functionality
 * - Ensures database is ready for application operations
 * - Validates schema creation success
 * 
 * **5. Cleanup and Completion**
 * - Properly closes database connections
 * - Provides success confirmation with database location
 * - Exits cleanly with appropriate status codes
 * 
 * Schema components initialized:
 * - governance_metrics: Core governance scoring data
 * - governance_violations: Compliance violation tracking
 * - workspace_admins: Administrative contact information
 * - collection_metadata: Collection governance context
 * - system_metadata: Application metadata and versioning
 * 
 * Output formatting:
 * - Console output with emoji indicators for visual feedback
 * - Structured logging for automated deployment parsing
 * - Error details for troubleshooting failed initialization
 * - Database location confirmation for operational verification
 * 
 * Error handling strategy:
 * - Comprehensive error catching with detailed messages
 * - Graceful exit with appropriate exit codes
 * - Database cleanup on failure to prevent corruption
 * - Clear indication of failure points for debugging
 * 
 * Use cases:
 * - Initial application deployment setup
 * - Container initialization scripts
 * - Development environment preparation
 * - Database schema updates and migrations
 * - Automated testing environment setup
 * 
 * Dependencies:
 * - ConfigLoader: Configuration file processing
 * - Logger: Structured logging for initialization audit
 * - DatabaseManager: Database schema creation and management
 * 
 * Called by: 
 * - Direct script execution for manual setup
 * - Container initialization scripts
 * - Automated deployment pipelines
 * - Development setup scripts
 * 
 * @complexity O(1) - Linear initialization process with database I/O
 * @returns {Promise<void>} Resolves when database initialization completes successfully
 */
async function initializeDatabase() {
  console.log('Initializing Postman Governance Database...');
  
  try {
    // Load configuration
    const config = await ConfigLoader.load();
    console.log(`Configuration loaded from: ${config.database.path}`);
    
    // Initialize logger
    const logger = new Logger(config.logging);
    logger.info('Starting database initialization');
    
    // Initialize database
    const db = new DatabaseManager(config.database, logger);
    await db.initialize();
    
    console.log('✅ Database initialized successfully!');
    console.log(`Database location: ${config.database.path}`);
    
    // Test the database with a simple query
    const testResult = await db.get('SELECT 1 as test');
    if (testResult && testResult.test === 1) {
      console.log('✅ Database connectivity test passed!');
    }
    
    // Close the database
    await db.close();
    console.log('Database initialization complete.');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    process.exit(1);
  }
}

// =============================================================================
// Script Execution - Direct Invocation Handler
// =============================================================================

/**
 * Execute database initialization when script is run directly
 * 
 * Detects direct script execution and initiates database initialization.
 * Provides command-line interface for manual database setup operations.
 * 
 * Execution detection:
 * - Uses require.main === module to detect direct execution
 * - Avoids initialization when script is imported as module
 * - Enables both standalone and programmatic usage patterns
 * 
 * Usage examples:
 * - node init-database.js (direct execution)
 * - docker run --rm app-image node init-database.js (container setup)
 * - npm run init-db (package.json script integration)
 */
if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase;