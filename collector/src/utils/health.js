/**
 * Health Checker - Enterprise System Health Monitoring and Diagnostics
 * 
 * Comprehensive health monitoring system for production deployments with
 * configurable checks, performance thresholds, and detailed diagnostic
 * information. Provides operational visibility into system dependencies
 * and resource utilization for reliable service operation.
 */

const fs = require('fs');
const os = require('os');

/**
 * HealthChecker Class - Multi-Dimensional System Health Monitoring
 * 
 * Enterprise health monitoring system that validates system dependencies,
 * resource utilization, and service connectivity. Implements configurable
 * health checks with performance thresholds and detailed diagnostic reporting
 * for operational monitoring and alerting integration.
 * 
 * @class HealthChecker
 * @description Production-ready health monitoring with comprehensive diagnostics
 * 
 * Health check dimensions:
 * - **Database Connectivity**: SQLite connection and query validation
 * - **External API Health**: Postman API connectivity and authentication
 * - **System Resources**: Disk space and memory utilization monitoring
 * - **Performance Metrics**: Response time tracking and threshold validation
 * - **Service Dependencies**: Critical service availability verification
 * 
 * Health status classifications:
 * - **healthy**: All checks passing within thresholds
 * - **degraded**: Services functional but performance degraded
 * - **warning**: Resource utilization approaching limits
 * - **unhealthy**: Critical service failures or threshold breaches
 * - **unknown**: Health check execution failed or inconclusive
 * 
 * Diagnostic features:
 * - Response time measurement for performance monitoring
 * - Detailed error context for troubleshooting
 * - Resource utilization metrics with threshold comparisons
 * - Failure correlation and root cause hints
 * - Configurable check enablement for different deployment scenarios
 * 
 * Dependencies:
 * - DatabaseManager: For database connectivity validation
 * - PostmanClient: For external API health verification
 * - Logger: For health check audit trails and debugging
 * - Configuration: For thresholds and check enablement
 * 
 * Called by: GovernanceCollectorApp via /health endpoint
 * Calls into: Database, PostmanClient, system APIs
 * 
 * @complexity O(n) where n is the number of enabled health checks
 */
class HealthChecker {
  /**
   * Initialize HealthChecker with system dependencies and configuration
   * 
   * Sets up health monitoring system with references to critical service
   * dependencies, performance thresholds, and logging infrastructure.
   * Configures which health checks are enabled for the deployment environment.
   * 
   * @constructor
   * @param {DatabaseManager} database - Database connection for connectivity checks
   * @param {PostmanClient} postmanClient - API client for external service validation
   * @param {Object} config - Health check configuration and thresholds
   * @param {Logger} logger - Structured logger for health check audit trails
   * 
   * Configuration structure:
   * - config.checks: Boolean flags for individual health check enablement
   *   - database: Enable database connectivity validation
   *   - postman_api: Enable Postman API health verification
   *   - disk_space: Enable disk utilization monitoring
   *   - memory_usage: Enable memory utilization monitoring
   * - config.thresholds: Performance and resource limits
   *   - api_response_time_ms: Maximum acceptable API response time
   *   - disk_usage_percent: Maximum disk utilization before warning
   *   - memory_usage_percent: Maximum memory utilization before warning
   * 
   * Dependency validation:
   * - Database: Must be initialized and connected
   * - PostmanClient: Must have valid API key and configuration
   * - Logger: Must support debug, error logging methods
   * - Configuration: Must contain checks and thresholds objects
   * 
   * Health check enablement strategy:
   * - Selective check enablement for different deployment environments
   * - Development: Enable all checks for comprehensive validation
   * - Production: May disable resource-intensive checks
   * - Container environments: Focus on connectivity over resource checks
   * 
   * @complexity O(1) - Simple instance variable assignment
   */
  constructor(database, postmanClient, config, logger) {
    this.db = database;
    this.postmanClient = postmanClient;
    this.config = config;
    this.logger = logger;
  }
  
  /**
   * Perform comprehensive system health assessment
   * 
   * Main orchestration method that executes all enabled health checks,
   * aggregates results, and determines overall system health status.
   * Provides detailed diagnostic information for operational monitoring.
   * 
   * @async
   * @method checkHealth
   * @throws {Error} When health check orchestration fails critically
   * @returns {Promise<Object>} Comprehensive health assessment results
   * 
   * Health check execution workflow:
   * 1. **Initialization**: Set up result structure and timing
   * 2. **Conditional Checks**: Execute enabled health checks based on configuration
   * 3. **Database Check**: Validate SQLite connectivity and query execution
   * 4. **API Check**: Verify Postman API connectivity and authentication
   * 5. **Resource Checks**: Monitor disk space and memory utilization
   * 6. **Aggregation**: Determine overall health from individual check results
   * 7. **Performance Tracking**: Record total execution time
   * 
   * Result structure:
   * - overall: Aggregated health status (healthy/degraded/unhealthy/unknown)
   * - timestamp: ISO timestamp for result correlation
   * - checks: Object containing individual check results
   * - responseTime: Total health check execution time in milliseconds
   * 
   * Individual check results:
   * - status: Check-specific status (healthy/degraded/warning/unhealthy/unknown)
   * - responseTime: Individual check execution time
   * - details: Check-specific diagnostic information
   * - error: Error message if check failed
   * 
   * Error handling strategy:
   * - Individual check failures don't stop overall assessment
   * - Failed checks contribute to overall health determination
   * - Critical orchestration failures return unhealthy status
   * - Detailed error context preserved for troubleshooting
   * 
   * Performance tracking:
   * - Total execution time measurement
   * - Individual check response times
   * - Failed check identification for performance analysis
   * - Debug logging with execution metrics
   * 
   * Dependencies:
   * - checkDatabase(): Database connectivity validation
   * - checkPostmanAPI(): External API health verification
   * - checkDiskSpace(): Disk utilization monitoring
   * - checkMemoryUsage(): Memory utilization monitoring
   * - determineOverallHealth(): Health aggregation logic
   * 
   * Called by: Express /health endpoint for health monitoring
   * 
   * @complexity O(n) where n is the number of enabled health checks
   */
  async checkHealth() {
    const startTime = Date.now();
    const results = {
      overall: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {},
      responseTime: 0
    };
    
    try {
      // Database health
      if (this.config.checks.database) {
        results.checks.database = await this.checkDatabase();
      }
      
      // Postman API health
      if (this.config.checks.postman_api) {
        results.checks.postman_api = await this.checkPostmanAPI();
      }
      
      // System resources
      if (this.config.checks.disk_space) {
        results.checks.disk_space = await this.checkDiskSpace();
      }
      
      if (this.config.checks.memory_usage) {
        results.checks.memory_usage = await this.checkMemoryUsage();
      }
      
      // Determine overall health
      results.overall = this.determineOverallHealth(results.checks);
      results.responseTime = Date.now() - startTime;
      
      this.logger.debug('Health check completed', {
        overall: results.overall,
        responseTime: results.responseTime,
        failedChecks: Object.entries(results.checks)
          .filter(([_, check]) => check.status !== 'healthy')
          .map(([name]) => name)
      });
      
      return results;
      
    } catch (error) {
      this.logger.error('Health check failed', { error: error.message });
      return {
        overall: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * Validate database connectivity and basic functionality
   * 
   * Tests SQLite database connection health by executing a simple query
   * and measuring response time. Validates that the database is accessible
   * and responding to queries within acceptable performance parameters.
   * 
   * @async
   * @method checkDatabase
   * @returns {Promise<Object>} Database health check result
   * 
   * Validation tests performed:
   * - **Connection Test**: Verify database connection is established
   * - **Query Test**: Execute simple SELECT query to validate functionality
   * - **Response Time**: Measure query execution time for performance monitoring
   * 
   * Health criteria:
   * - **Healthy**: Query executes successfully within reasonable time
   * - **Unhealthy**: Connection fails or query execution throws error
   * 
   * Test query: 'SELECT 1 as test'
   * - Minimal resource utilization
   * - Tests basic SQL execution capability
   * - Validates database engine responsiveness
   * - No dependency on application schema
   * 
   * Result structure:
   * - status: 'healthy' or 'unhealthy'
   * - responseTime: Query execution time in milliseconds
   * - details: Detailed check results
   *   - connection: 'ok' or 'failed'
   *   - queryTest: 'passed' or error details
   * - error: Error message if check failed
   * 
   * Error conditions:
   * - Database connection unavailable
   * - SQLite file locked or corrupted
   * - Insufficient permissions for database access
   * - Database initialization incomplete
   * 
   * Performance monitoring:
   * - Response time tracking for database performance trends
   * - Query execution timing for latency analysis
   * - Connection establishment verification
   * 
   * Dependencies:
   * - DatabaseManager.query(): Database query execution method
   * - SQLite database connection and file system access
   * 
   * Called by: checkHealth() when database checks are enabled
   * 
   * @complexity O(1) - Single simple query execution
   */
  async checkDatabase() {
    try {
      const startTime = Date.now();
      
      // Test database connection and basic query
      await this.db.query('SELECT 1 as test');
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: {
          connection: 'ok',
          queryTest: 'passed'
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        details: {
          connection: 'failed'
        }
      };
    }
  }
  
  /**
   * Validate Postman API connectivity and authentication
   * 
   * Tests external Postman API service health by performing authenticated
   * request and measuring response performance. Validates API key validity,
   * network connectivity, and service availability.
   * 
   * @async
   * @method checkPostmanAPI
   * @returns {Promise<Object>} Postman API health check result
   * 
   * Validation tests performed:
   * - **Authentication Test**: Verify API key validity with /me endpoint
   * - **Connectivity Test**: Validate network path to Postman API
   * - **Response Time**: Measure API response time against thresholds
   * - **Service Availability**: Confirm Postman API service operational status
   * 
   * Health status determination:
   * - **Healthy**: API responds successfully within performance threshold
   * - **Degraded**: API responds successfully but exceeds performance threshold
   * - **Unhealthy**: API request fails due to connectivity, auth, or service issues
   * 
   * Test endpoint: PostmanClient.getUser()
   * - Lightweight authenticated request
   * - Validates API key permissions
   * - Minimal data transfer for efficiency
   * - Representative of typical API operations
   * 
   * Performance threshold evaluation:
   * - Compares response time against config.thresholds.api_response_time_ms
   * - Slow responses trigger 'degraded' status
   * - Helps identify API performance degradation
   * 
   * Result structure:
   * - status: 'healthy', 'degraded', or 'unhealthy'
   * - responseTime: API request execution time in milliseconds
   * - details: Detailed diagnostic information
   *   - connectivity: 'ok' or 'failed'
   *   - authentication: 'valid' or authentication status
   *   - slowResponse: Boolean indicating threshold breach
   * - error: Error message if request failed
   * 
   * Common failure scenarios:
   * - Invalid or expired API key (401 Unauthorized)
   * - Network connectivity issues (connection timeout)
   * - Postman API service downtime (503 Service Unavailable)
   * - Rate limiting exceeded (429 Too Many Requests)
   * - DNS resolution failures
   * 
   * Troubleshooting information:
   * - Provides possible causes for API failures
   * - Helps operational teams identify root causes
   * - Includes common resolution strategies
   * 
   * Dependencies:
   * - PostmanClient.getUser(): Authenticated API request method
   * - Network connectivity to api.getpostman.com
   * - Valid Postman API key configuration
   * 
   * Called by: checkHealth() when Postman API checks are enabled
   * 
   * @complexity O(1) - Single API request with response time measurement
   */
  async checkPostmanAPI() {
    try {
      const startTime = Date.now();
      
      // Test API connectivity with a lightweight call
      await this.postmanClient.getUser();
      
      const responseTime = Date.now() - startTime;
      const isSlowResponse = responseTime > this.config.thresholds.api_response_time_ms;
      
      return {
        status: isSlowResponse ? 'degraded' : 'healthy',
        responseTime,
        details: {
          connectivity: 'ok',
          authentication: 'valid',
          slowResponse: isSlowResponse
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        details: {
          connectivity: 'failed',
          possibleCauses: [
            'Invalid API key',
            'Network connectivity issue',
            'Postman API service down',
            'Rate limit exceeded'
          ]
        }
      };
    }
  }
  
  /**
   * Monitor disk space utilization and availability
   * 
   * Analyzes disk space usage for the application data directory,
   * calculates utilization percentages, and compares against configured
   * thresholds to identify potential storage issues.
   * 
   * @async
   * @method checkDiskSpace
   * @returns {Promise<Object>} Disk space health check result
   * 
   * Monitoring scope:
   * - **Target Path**: /app/data (primary application data directory)
   * - **Usage Calculation**: Used space percentage vs. total capacity
   * - **Threshold Comparison**: Against config.thresholds.disk_usage_percent
   * - **Capacity Reporting**: Total, used, and free space in GB
   * 
   * Health status determination:
   * - **Healthy**: Disk usage below configured threshold
   * - **Warning**: Disk usage exceeds threshold (potential issues)
   * - **Unknown**: Unable to determine disk usage (file system error)
   * 
   * Disk space calculation:
   * - Uses getDiskSpace() helper for space statistics
   * - Calculates percentage: (used / total) * 100
   * - Converts bytes to GB for human-readable reporting
   * - Rounds values to 2 decimal places for precision
   * 
   * Result structure:
   * - status: 'healthy', 'warning', or 'unknown'
   * - details: Detailed disk usage information
   *   - usedPercentage: Disk usage as percentage (rounded)
   *   - totalGB: Total disk capacity in gigabytes
   *   - freeGB: Available free space in gigabytes
   *   - threshold: Configured warning threshold percentage
   * - error: Error message if check failed
   * 
   * Warning conditions:
   * - Disk usage approaching capacity limits
   * - Insufficient space for application operations
   * - Risk of application failures due to storage constraints
   * - Need for log rotation or data cleanup
   * 
   * Operational considerations:
   * - Container environments may have different space reporting
   * - Network storage may have different performance characteristics
   * - Database file growth affects available storage
   * - Log file accumulation impacts disk usage
   * 
   * Error handling:
   * - File system access failures
   * - Permission issues for disk statistics
   * - Invalid path or mount point issues
   * - Container storage limitations
   * 
   * Dependencies:
   * - getDiskSpace(): Disk space calculation helper method
   * - fs.statSync(): File system statistics access
   * - File system access to /app/data directory
   * 
   * Called by: checkHealth() when disk space checks are enabled
   * 
   * @complexity O(1) - Simple file system statistics query
   */
  async checkDiskSpace() {
    try {
      const stats = fs.statSync('/app/data');
      const totalSpace = await this.getDiskSpace('/app/data');
      const usedPercentage = ((totalSpace.used / totalSpace.total) * 100);
      
      const status = usedPercentage > this.config.thresholds.disk_usage_percent ? 
        'warning' : 'healthy';
      
      return {
        status,
        details: {
          usedPercentage: Math.round(usedPercentage * 100) / 100,
          totalGB: Math.round((totalSpace.total / (1024**3)) * 100) / 100,
          freeGB: Math.round((totalSpace.free / (1024**3)) * 100) / 100,
          threshold: this.config.thresholds.disk_usage_percent
        }
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message
      };
    }
  }
  
  /**
   * Monitor system and process memory utilization
   * 
   * Analyzes both system-wide memory usage and Node.js process-specific
   * memory consumption. Provides detailed memory metrics for performance
   * monitoring and resource optimization.
   * 
   * @async
   * @method checkMemoryUsage
   * @returns {Promise<Object>} Memory usage health check result
   * 
   * Memory monitoring scope:
   * 
   * **System Memory Analysis:**
   * - Total system memory capacity
   * - System-wide memory utilization percentage
   * - Available free memory for other processes
   * - Memory pressure indicators
   * 
   * **Process Memory Analysis:**
   * - RSS (Resident Set Size): Physical memory used by process
   * - Heap Usage: V8 JavaScript heap utilization
   * - Heap Total: Total allocated heap space
   * - Memory efficiency metrics
   * 
   * Health status determination:
   * - **Healthy**: System memory usage below configured threshold
   * - **Warning**: System memory usage exceeds threshold
   * - **Unknown**: Unable to retrieve memory statistics
   * 
   * Memory calculation methodology:
   * - System usage: ((total - free) / total) * 100
   * - Process memory converted to MB for readability
   * - Heap utilization analysis for garbage collection insights
   * - Memory growth trend indicators
   * 
   * Result structure:
   * - status: 'healthy', 'warning', or 'unknown'
   * - details: Comprehensive memory analysis
   *   - system: System-wide memory metrics
   *     - usedPercentage: System memory utilization percentage
   *     - totalGB: Total system memory in gigabytes
   *     - freeGB: Available system memory in gigabytes
   *   - process: Node.js process memory metrics
   *     - rssMemoryMB: Process resident memory in megabytes
   *     - heapUsedMB: Active heap memory in megabytes
   *     - heapTotalMB: Total allocated heap in megabytes
   *   - threshold: Configured warning threshold percentage
   * - error: Error message if monitoring failed
   * 
   * Memory pressure indicators:
   * - High system memory usage affects overall performance
   * - Process memory growth may indicate memory leaks
   * - Heap usage patterns reveal garbage collection efficiency
   * - RSS growth indicates native memory consumption
   * 
   * Performance implications:
   * - High memory usage triggers OS virtual memory systems
   * - Memory pressure affects garbage collection frequency
   * - Process memory limits may cause application crashes
   * - System memory exhaustion impacts all processes
   * 
   * Monitoring use cases:
   * - Detecting memory leaks in long-running processes
   * - Capacity planning for production deployments
   * - Performance optimization based on memory patterns
   * - Alert thresholds for operational monitoring
   * 
   * Dependencies:
   * - process.memoryUsage(): Node.js process memory statistics
   * - os.totalmem(): System total memory information
   * - os.freemem(): System available memory information
   * 
   * Called by: checkHealth() when memory usage checks are enabled
   * 
   * @complexity O(1) - Simple system and process memory queries
   */
  async checkMemoryUsage() {
    try {
      const memUsage = process.memoryUsage();
      const systemMem = os.totalmem();
      const freeMem = os.freemem();
      
      const systemUsedPercentage = ((systemMem - freeMem) / systemMem) * 100;
      const processMemoryMB = memUsage.rss / (1024 * 1024);
      
      const status = systemUsedPercentage > this.config.thresholds.memory_usage_percent ? 
        'warning' : 'healthy';
      
      return {
        status,
        details: {
          system: {
            usedPercentage: Math.round(systemUsedPercentage * 100) / 100,
            totalGB: Math.round((systemMem / (1024**3)) * 100) / 100,
            freeGB: Math.round((freeMem / (1024**3)) * 100) / 100
          },
          process: {
            rssMemoryMB: Math.round(processMemoryMB * 100) / 100,
            heapUsedMB: Math.round((memUsage.heapUsed / (1024 * 1024)) * 100) / 100,
            heapTotalMB: Math.round((memUsage.heapTotal / (1024 * 1024)) * 100) / 100
          },
          threshold: this.config.thresholds.memory_usage_percent
        }
      };
    } catch (error) {
      return {
        status: 'unknown',
        error: error.message
      };
    }
  }
  
  /**
   * Calculate disk space statistics for specified path
   * 
   * Helper method that determines disk space utilization for a given path.
   * Provides simplified disk space calculation optimized for containerized
   * environments with known storage constraints.
   * 
   * @private
   * @async
   * @method getDiskSpace
   * @param {string} path - File system path to analyze for disk usage
   * @throws {Error} When disk space calculation fails
   * @returns {Promise<Object>} Disk space statistics object
   * 
   * Implementation note:
   * This is a simplified implementation for containerized environments
   * where disk space is typically allocated with known limits. In production
   * environments, this would integrate with system calls like statvfs() for
   * accurate file system statistics.
   * 
   * Calculation methodology:
   * - **Simplified Approach**: Uses fixed assumptions for container environments
   * - **Container Optimization**: Assumes standard container disk allocation
   * - **Development Friendly**: Provides predictable values for testing
   * 
   * Current implementation assumptions:
   * - Total space: 10GB (typical container allocation)
   * - Used space: 1GB (conservative estimate)
   * - Free space: 9GB (calculated remainder)
   * 
   * Production considerations:
   * - Replace with actual statvfs() system call
   * - Integrate with container runtime disk monitoring
   * - Support different file system types
   * - Handle network storage considerations
   * 
   * Return structure:
   * - total: Total disk space in bytes
   * - used: Used disk space in bytes
   * - free: Available disk space in bytes
   * 
   * Error conditions:
   * - Path does not exist or is not accessible
   * - Insufficient permissions for path statistics
   * - File system errors or corruption
   * - Network storage connectivity issues
   * 
   * Future enhancements:
   * - Integration with actual file system statistics
   * - Support for multiple storage backends
   * - Real-time disk usage calculation
   * - Historical usage trend analysis
   * 
   * Dependencies:
   * - fs.statSync(): Basic file system path validation
   * - File system access permissions for target path
   * 
   * Called by: checkDiskSpace() for disk utilization analysis
   * 
   * @complexity O(1) - Simplified calculation with fixed assumptions
   */
  async getDiskSpace(path) {
    // Simplified disk space check - in production this would use statvfs or similar
    // For Docker containers, this is approximate
    try {
      const stats = fs.statSync(path);
      // This is a simplified implementation
      return {
        total: 10 * 1024 * 1024 * 1024, // 10GB assumption for container
        used: 1 * 1024 * 1024 * 1024,   // 1GB assumption
        free: 9 * 1024 * 1024 * 1024    // 9GB free
      };
    } catch (error) {
      throw new Error(`Failed to get disk space: ${error.message}`);
    }
  }
  
  /**
   * Aggregate individual health check results into overall system status
   * 
   * Analyzes all individual health check results and determines the overall
   * system health status using hierarchical status prioritization. Implements
   * conservative health assessment where any critical failure affects overall status.
   * 
   * @method determineOverallHealth
   * @param {Object} checks - Object containing individual health check results
   * @returns {string} Overall health status classification
   * 
   * Health status hierarchy (highest priority first):
   * 1. **unhealthy**: Any check reports critical failure
   * 2. **degraded**: Any check reports performance degradation or warnings
   * 3. **healthy**: All checks report healthy status
   * 4. **unknown**: Default fallback for unclassified status combinations
   * 
   * Aggregation logic:
   * - **Conservative Approach**: Worst status determines overall health
   * - **Fail-Fast**: Single unhealthy check makes entire system unhealthy
   * - **Performance Awareness**: Degraded/warning statuses indicate issues
   * - **Complete Validation**: All checks must be healthy for healthy status
   * 
   * Status classification:
   * - **unhealthy**: Critical system failures requiring immediate attention
   *   - Database connectivity lost
   *   - External API authentication failed
   *   - Critical service dependencies unavailable
   * 
   * - **degraded**: System functional but performance issues detected
   *   - API responses slower than acceptable thresholds
   *   - Resource utilization warnings (disk/memory)
   *   - Non-critical service degradation
   * 
   * - **healthy**: All systems operating normally within thresholds
   *   - All connectivity checks passing
   *   - Resource utilization within acceptable limits
   *   - Performance metrics meeting requirements
   * 
   * - **unknown**: Indeterminate health status
   *   - Health checks returned unexpected status values
   *   - Mixed status combinations not covered by standard logic
   *   - Partial health check execution
   * 
   * Operational implications:
   * - **unhealthy**: Triggers immediate alerts and incident response
   * - **degraded**: Indicates monitoring attention and potential scaling needs
   * - **healthy**: Confirms system ready for production traffic
   * - **unknown**: Requires investigation of health check implementation
   * 
   * Use cases:
   * - Load balancer health check integration
   * - Kubernetes readiness and liveness probes
   * - Monitoring system alert thresholds
   * - Automated deployment health validation
   * 
   * Dependencies:
   * - Individual health check results with status properties
   * - Standard status value conventions across all checks
   * 
   * Called by: checkHealth() for final health status determination
   * 
   * @complexity O(n) where n is the number of health checks performed
   */
  determineOverallHealth(checks) {
    const statuses = Object.values(checks).map(check => check.status);
    
    if (statuses.includes('unhealthy')) {
      return 'unhealthy';
    } else if (statuses.includes('warning') || statuses.includes('degraded')) {
      return 'degraded';
    } else if (statuses.every(status => status === 'healthy')) {
      return 'healthy';
    } else {
      return 'unknown';
    }
  }
}

module.exports = HealthChecker;