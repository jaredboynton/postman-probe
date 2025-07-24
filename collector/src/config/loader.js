/**
 * Configuration Loader - YAML Configuration File Management
 * 
 * Secure configuration loading and validation system for the Postman Governance Collector.
 * Handles YAML configuration parsing, validation, environment variable overrides, and
 * enterprise deployment scenarios with Docker secrets and configuration management.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

/**
 * Configuration Loader Class
 * 
 * Static utility class for loading, validating, and processing YAML configuration files.
 * Supports multiple configuration sources, environment variable overrides, and
 * comprehensive validation for enterprise deployment scenarios.
 * 
 * @class ConfigLoader
 * @description Enterprise configuration management for governance monitoring
 * 
 * Dependencies:
 * - fs: File system operations for reading configuration files
 * - yaml: YAML parsing and validation library
 * - process.env: Environment variable access for overrides
 * 
 * Called by: GovernanceCollectorApp.initialize()
 * Calls into: File system, environment variables, YAML parser
 * 
 * @complexity O(1) - Static methods only, no instance state
 */
class ConfigLoader {
  /**
   * Load and parse YAML configuration with validation and overrides
   * 
   * Main configuration loading method that handles multiple configuration sources,
   * performs comprehensive validation, and applies environment variable overrides.
   * Designed for enterprise deployment with Docker secrets and containerized environments.
   * 
   * @async
   * @method load
   * @static
   * @param {string|null} configPath - Optional explicit path to configuration file
   * @throws {Error} When configuration file is not found
   * @throws {Error} When YAML parsing fails
   * @throws {Error} When configuration validation fails
   * @throws {Error} When environment override application fails
   * 
   * Configuration source priority:
   * 1. Explicit configPath parameter (highest priority)
   * 2. CONFIG_PATH environment variable
   * 3. Default Docker container path: /app/config/governance-collector.yml
   * 
   * Validation process:
   * 1. File existence check
   * 2. YAML syntax validation
   * 3. Required section validation
   * 4. Business rule validation (weights, schedules, etc.)
   * 5. Environment variable override application
   * 
   * Dependencies:
   * - fs.existsSync(): File existence validation
   * - fs.readFileSync(): Configuration file reading
   * - yaml.parse(): YAML content parsing
   * - validateConfig(): Configuration structure validation
   * - applyEnvOverrides(): Environment variable processing
   * 
   * Called by: GovernanceCollectorApp.initialize()
   * Calls into: validateConfig(), applyEnvOverrides()
   * 
   * @complexity O(n) where n is the number of configuration keys for validation
   * @returns {Promise<Object>} Parsed and validated configuration object
   */
  static async load(configPath = null) {
    const defaultPath = '/app/config/governance-collector.yml';
    const envPath = process.env.CONFIG_PATH;
    const finalPath = configPath || envPath || defaultPath;
    
    try {
      if (!fs.existsSync(finalPath)) {
        throw new Error(`Configuration file not found: ${finalPath}`);
      }
      
      const fileContent = fs.readFileSync(finalPath, 'utf8');
      const config = yaml.parse(fileContent);
      
      // Validate required configuration sections
      this.validateConfig(config);
      
      // Apply environment variable overrides
      this.applyEnvOverrides(config);
      
      return config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }
  
  /**
   * Validate configuration structure and business rules
   * 
   * Comprehensive validation of the loaded configuration to ensure all required
   * sections are present and business rules are satisfied. Prevents runtime errors
   * by catching configuration issues early in the application startup process.
   * 
   * @method validateConfig
   * @static
   * @private
   * @param {Object} config - Parsed configuration object to validate
   * @throws {Error} When required configuration sections are missing
   * @throws {Error} When required configuration values are missing
   * @throws {Error} When governance weights don't sum to 1.0
   * @throws {Error} When configuration values are invalid
   * 
   * Validation checks performed:
   * 1. Required top-level sections (collection, database, api, postman, governance, logging)
   * 2. Critical configuration values (schedule, database path, API port)
   * 3. Business rules (governance weights must sum to 1.0 for proper scoring)
   * 4. Data type validation (implicit through usage)
   * 
   * Business rule: Governance weights validation
   * - Weights represent the relative importance of different governance areas
   * - Must sum to exactly 1.0 (with 0.001 tolerance for floating point precision)
   * - Ensures overall governance scores are properly normalized
   * 
   * Dependencies:
   * - Object.values(): Extract weight values for summation
   * - Array.reduce(): Calculate sum of governance weights
   * - Math.abs(): Floating point comparison with tolerance
   * 
   * Called by: load()
   * 
   * @complexity O(n) where n is the number of governance weights to validate
   * @returns {void} - Throws on validation failure, silent success
   */
  static validateConfig(config) {
    const required = [
      'collection',
      'database',
      'api',
      'postman',
      'governance',
      'logging'
    ];
    
    for (const section of required) {
      if (!config[section]) {
        throw new Error(`Missing required configuration section: ${section}`);
      }
    }
    
    // Validate specific settings
    if (!config.collection.schedule) {
      throw new Error('Collection schedule is required');
    }
    
    if (!config.database.path) {
      throw new Error('Database path is required');
    }
    
    if (!config.api.port) {
      throw new Error('API port is required');
    }
    
    // Validate governance weights sum to 1.0
    const weights = config.governance.weights;
    const sum = Object.values(weights).reduce((acc, val) => acc + val, 0);
    if (Math.abs(sum - 1.0) > 0.001) {
      throw new Error(`Governance weights must sum to 1.0, got ${sum}`);
    }
  }
  
  /**
   * Apply environment variable overrides to configuration
   * 
   * Processes environment variables to override specific configuration values,
   * enabling runtime configuration changes without modifying YAML files.
   * Essential for Docker deployments, CI/CD pipelines, and multi-environment setups.
   * 
   * @method applyEnvOverrides
   * @static
   * @private
   * @param {Object} config - Configuration object to modify with overrides
   * 
   * Supported environment variable overrides:
   * - COLLECTION_SCHEDULE: Cron expression for data collection frequency
   * - DATABASE_PATH: SQLite database file location
   * - API_PORT: HTTP server port number
   * - LOG_LEVEL: Logging verbosity (DEBUG, INFO, WARN, ERROR)
   * - POSTMAN_RATE_LIMIT: API requests per minute limit
   * 
   * Type conversion handling:
   * - String values: Used directly (schedule, database path, log level)
   * - Integer values: Parsed with parseInt() and base 10 (port, rate limit)
   * - Validation: Implicit through downstream usage and existing validation
   * 
   * Security considerations:
   * - Only specific whitelisted environment variables are processed
   * - No dynamic environment variable processing to prevent injection
   * - Integer parsing prevents string injection for numeric values
   * 
   * Dependencies:
   * - process.env: Node.js environment variable access
   * - parseInt(): String to integer conversion with radix
   * 
   * Called by: load()
   * 
   * @complexity O(1) - Fixed number of environment variables checked
   * @returns {void} - Modifies config object in place
   */
  static applyEnvOverrides(config) {
    // Allow environment variables to override specific settings
    if (process.env.COLLECTION_SCHEDULE) {
      config.collection.schedule = process.env.COLLECTION_SCHEDULE;
    }
    
    if (process.env.DATABASE_PATH) {
      config.database.path = process.env.DATABASE_PATH;
    }
    
    if (process.env.API_PORT) {
      config.api.port = parseInt(process.env.API_PORT, 10);
    }
    
    if (process.env.LOG_LEVEL) {
      config.logging.level = process.env.LOG_LEVEL;
    }
    
    if (process.env.POSTMAN_RATE_LIMIT) {
      config.postman.rate_limit.requests_per_minute = parseInt(process.env.POSTMAN_RATE_LIMIT, 10);
    }
  }
}

module.exports = ConfigLoader;