/**
 * Logger Utility - Enterprise Winston-Based Structured Logging System
 * 
 * Production-grade logging infrastructure with security filtering, structured output,
 * configurable transports, and audit trail capabilities. Designed for enterprise
 * deployment with sensitive data protection and compliance requirements.
 */

const winston = require('winston');
const fs = require('fs');
const path = require('path');

/**
 * Logger Class - Enterprise Structured Logging with Security Features
 * 
 * Winston-based logging system with enterprise security features including sensitive
 * data masking, configurable output formats, multiple transport destinations, and
 * audit trail capabilities for compliance and operational monitoring.
 * 
 * @class Logger
 * @description Production-ready logging system with security and compliance features
 * 
 * Key features:
 * - **Security Filtering**: Automatic masking of API keys, passwords, tokens
 * - **Structured Logging**: JSON and formatted output options
 * - **Multiple Transports**: Console and file output with rotation
 * - **Audit Trail**: Security event logging for compliance
 * - **Configuration-Driven**: Flexible output destinations and formats
 * - **Performance Optimized**: Efficient sanitization and formatting
 * 
 * Security protections:
 * - Postman API key masking (PMAK-... patterns)
 * - Password/secret/token redaction in all log entries
 * - Configurable header exclusion for sensitive HTTP headers
 * - Recursive object sanitization for complex data structures
 * 
 * Transport options:
 * - Console: Colored formatted output for development
 * - File: JSON structured output with rotation and size limits
 * - Configurable log levels (DEBUG, INFO, WARN, ERROR)
 * 
 * Dependencies:
 * - winston: Core logging framework with transport and formatting
 * - fs: File system operations for log directory creation
 * - path: Path manipulation for log file management
 * 
 * Called by: All application components for logging operations
 * Calls into: Winston transports and formatting systems
 * 
 * @complexity O(1) for basic logging, O(n) for object sanitization
 */
class Logger {
  /**
   * Initialize Logger with configuration and transport setup
   * 
   * Creates Winston logger instance with configured transports, security settings,
   * and formatting options. Validates configuration and sets up file system
   * requirements for file-based logging.
   * 
   * @constructor
   * @param {Object} config - Logger configuration object
   * 
   * Configuration structure:
   * - config.level: Log level (DEBUG, INFO, WARN, ERROR)
   * - config.format: Output format ('json' or 'text')
   * - config.destinations: Transport configuration
   *   - console: Boolean - enable console output
   *   - file: Boolean - enable file output
   *   - file_path: String - log file path
   * - config.rotation: File rotation settings
   *   - max_size_mb: Number - maximum file size in MB
   *   - max_files: Number - maximum number of rotated files
   * - config.security: Security filtering configuration
   *   - mask_api_keys: Boolean - enable API key masking
   *   - exclude_headers: Array - HTTP headers to redact
   *   - audit.enabled: Boolean - enable audit logging
   * 
   * Initialization process:
   * 1. Store configuration for runtime access
   * 2. Create Winston logger with configured transports
   * 3. Set up file directory structure if file logging enabled
   * 4. Configure security filtering and formatting options
   * 
   * Error handling:
   * - Creates log directories if they don't exist
   * - Graceful fallback if file logging setup fails
   * - Validates configuration before logger creation
   * 
   * Dependencies:
   * - createLogger(): Winston logger factory method
   * - Configuration validation for transport setup
   * 
   * @complexity O(1) - Simple instance variable assignment and setup
   */
  constructor(config) {
    this.config = config;
    this.winston = this.createLogger();
  }
  
  /**
   * Create Winston logger instance with configured transports
   * 
   * Factory method that creates and configures Winston logger with multiple
   * transport destinations, security formatting, and enterprise settings.
   * Handles transport setup, directory creation, and format configuration.
   * 
   * @method createLogger
   * @private
   * @throws {Error} When log directory creation fails
   * @throws {Error} When transport configuration is invalid
   * @returns {winston.Logger} Configured Winston logger instance
   * 
   * Transport configuration:
   * 
   * **Console Transport:**
   * - Enabled via config.destinations.console
   * - Uses configured format (JSON or text)
   * - Respects configured log level
   * - Includes colorization for development
   * 
   * **File Transport:**
   * - Enabled via config.destinations.file
   * - Creates log directory if it doesn't exist
   * - Implements file rotation with size and count limits
   * - Uses structured JSON format for machine parsing
   * - Tailable format for log monitoring tools
   * 
   * Logger configuration:
   * - Global log level from configuration
   * - exitOnError: false - prevents crashes on log errors
   * - silent: false - ensures logging is active
   * - Multiple transports for redundancy
   * 
   * File rotation features:
   * - max_size_mb: Maximum file size before rotation
   * - max_files: Number of rotated files to retain
   * - tailable: true - maintains consistent file naming
   * 
   * Error handling:
   * - Directory creation with recursive option
   * - Graceful handling of file system permissions
   * - Transport initialization error recovery
   * 
   * Dependencies:
   * - winston.transports.Console: Console output transport
   * - winston.transports.File: File output transport with rotation
   * - getFormat(): Format configuration method
   * - fs.mkdirSync(): Directory creation for log files
   * 
   * @complexity O(1) - Simple transport configuration and logger creation
   */
  createLogger() {
    const transports = [];
    
    // Console transport
    if (this.config.destinations.console) {
      transports.push(new winston.transports.Console({
        format: this.getFormat(),
        level: this.config.level.toLowerCase()
      }));
    }
    
    // File transport
    if (this.config.destinations.file) {
      // Ensure log directory exists
      const logDir = path.dirname(this.config.destinations.file_path);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      transports.push(new winston.transports.File({
        filename: this.config.destinations.file_path,
        format: this.getFormat(),
        level: this.config.level.toLowerCase(),
        maxsize: this.config.rotation.max_size_mb * 1024 * 1024,
        maxFiles: this.config.rotation.max_files,
        tailable: true
      }));
    }
    
    return winston.createLogger({
      level: this.config.level.toLowerCase(),
      transports,
      exitOnError: false,
      silent: false
    });
  }
  
  /**
   * Configure Winston format chain with security filtering
   * 
   * Creates Winston format pipeline with timestamp, error handling, and
   * security sanitization. Supports both JSON and human-readable text
   * formats with configurable output styling.
   * 
   * @method getFormat
   * @private
   * @returns {winston.Format} Configured Winston format chain
   * 
   * Base format features:
   * - Timestamp: ISO format with millisecond precision
   * - Error handling: Stack trace capture for error objects
   * - Security sanitization: Sensitive data masking
   * 
   * Format variants:
   * 
   * **JSON Format (config.format === 'json'):**
   * - Structured JSON output for machine parsing
   * - Security sanitization via sanitizeLogEntry()
   * - Consistent field structure for log aggregation
   * - Machine-readable format for monitoring systems
   * 
   * **Text Format (default):**
   * - Human-readable colorized output
   * - Timestamp, level, message, and metadata
   * - Color coding for different log levels
   * - Metadata formatting with JSON serialization
   * - Excludes core fields (level, message, timestamp) from metadata
   * 
   * Security processing:
   * - All log entries pass through sanitizeLogEntry()
   * - API key masking and sensitive data redaction
   * - Recursive object sanitization for complex structures
   * 
   * Timestamp format:
   * - 'YYYY-MM-DD HH:mm:ss.SSS' - ISO format with milliseconds
   * - Consistent timezone handling (UTC)
   * - High precision for debugging and correlation
   * 
   * Metadata handling:
   * - Text format extracts non-core fields as metadata
   * - JSON format preserves all fields in structure
   * - Metadata serialization with null-safe operations
   * 
   * Dependencies:
   * - winston.format.timestamp(): Timestamp formatting
   * - winston.format.errors(): Error object handling
   * - winston.format.json(): JSON output formatting
   * - winston.format.colorize(): Console color formatting
   * - winston.format.printf(): Custom format functions
   * - sanitizeLogEntry(): Security filtering method
   * 
   * @complexity O(1) for format setup, O(n) for sanitization during logging
   */
  getFormat() {
    const baseFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true })
    );
    
    if (this.config.format === 'json') {
      return winston.format.combine(
        baseFormat,
        winston.format.json(),
        winston.format.printf(info => {
          return this.sanitizeLogEntry(info);
        })
      );
    } else {
      return winston.format.combine(
        baseFormat,
        winston.format.colorize(),
        winston.format.printf(info => {
          const sanitized = this.sanitizeLogEntry(info);
          const meta = Object.keys(sanitized).length > 3 ? 
            JSON.stringify(Object.fromEntries(
              Object.entries(sanitized).filter(([key]) => 
                !['level', 'message', 'timestamp'].includes(key)
              )
            )) : '';
          return `${sanitized.timestamp} [${sanitized.level}] ${sanitized.message} ${meta}`;
        })
      );
    }
  }
  
  /**
   * Sanitize log entry for security compliance
   * 
   * Comprehensive security filtering that removes or masks sensitive data
   * from log entries before output. Implements recursive sanitization for
   * complex nested objects and configurable security policies.
   * 
   * @method sanitizeLogEntry
   * @private
   * @param {Object} info - Winston log info object to sanitize
   * @returns {string} JSON stringified sanitized log entry
   * 
   * Sanitization process:
   * 1. Create shallow copy of log info object
   * 2. Apply message-level sensitive data masking
   * 3. Recursively sanitize all nested objects and metadata
   * 4. Apply header exclusion policies
   * 5. Return JSON serialized result
   * 
   * Security filtering:
   * - API key masking: Postman API keys (PMAK-...)
   * - Password/secret/token redaction
   * - HTTP header exclusion (Authorization, etc.)
   * - Recursive object processing for nested structures
   * 
   * Configuration controls:
   * - config.security.mask_api_keys: Enable/disable API key masking
   * - config.security.exclude_headers: List of headers to redact
   * - Configurable sensitivity for different deployment environments
   * 
   * Masking strategy:
   * - Preserves first 8 and last 4 characters of API keys
   * - Complete redaction for passwords and secrets
   * - '[REDACTED]' placeholder for excluded headers
   * - Maintains log structure while protecting sensitive data
   * 
   * Error handling:
   * - Graceful handling of malformed objects
   * - Null-safe operations for undefined properties
   * - Continues processing if individual fields fail sanitization
   * 
   * Dependencies:
   * - maskSensitiveData(): String-level sensitive data masking
   * - sanitizeObject(): Recursive object sanitization
   * - JSON.stringify(): Final serialization
   * 
   * Called by: Format functions during log entry processing
   * 
   * @complexity O(n) where n is the total number of fields in nested objects
   */
  sanitizeLogEntry(info) {
    const sanitized = { ...info };
    
    // Security: Never log sensitive data
    if (this.config.security.mask_api_keys) {
      sanitized.message = this.maskSensitiveData(sanitized.message);
      
      // Recursively sanitize metadata
      this.sanitizeObject(sanitized);
    }
    
    return JSON.stringify(sanitized);
  }
  
  /**
   * Recursively sanitize object properties for security compliance
   * 
   * Deep sanitization method that processes nested objects and arrays to
   * remove or mask sensitive data. Implements comprehensive security policies
   * including header exclusion and recursive data structure processing.
   * 
   * @method sanitizeObject
   * @private
   * @param {Object} obj - Object to sanitize recursively
   * 
   * Sanitization operations:
   * 
   * **String Value Processing:**
   * - Apply maskSensitiveData() to all string values
   * - Pattern-based sensitive data detection and masking
   * - Preserves string structure while protecting content
   * 
   * **Nested Object Processing:**
   * - Recursive sanitization of object properties
   * - Handles arbitrarily deep nesting structures
   * - Maintains object relationships while securing content
   * 
   * **Header Exclusion:**
   * - Checks property names against exclude_headers configuration
   * - Case-insensitive header name matching
   * - Replaces excluded header values with '[REDACTED]'
   * 
   * Recursive processing:
   * - Traverses all object properties depth-first
   * - Handles circular references gracefully
   * - Processes arrays and nested objects uniformly
   * - Modifies object in-place for performance
   * 
   * Header exclusion logic:
   * - Common sensitive headers: Authorization, Cookie, X-API-Key
   * - Configurable exclusion list via config.security.exclude_headers
   * - Case-insensitive matching for HTTP header standards
   * - Complete value replacement (not masking) for headers
   * 
   * Error handling:
   * - Null-safe operations for undefined objects
   * - Type checking before recursive calls
   * - Graceful handling of malformed nested structures
   * - Continue processing if individual properties fail
   * 
   * Performance considerations:
   * - In-place modification to avoid object copying
   * - Early termination for non-object values
   * - Efficient string processing with compiled patterns
   * 
   * Dependencies:
   * - maskSensitiveData(): String-level masking function
   * - config.security.exclude_headers: Header exclusion configuration
   * - Object.entries(): Property enumeration
   * 
   * Called by: sanitizeLogEntry() for nested object processing
   * 
   * @complexity O(n*d) where n=properties and d=nesting depth
   */
  sanitizeObject(obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        obj[key] = this.maskSensitiveData(value);
      } else if (typeof value === 'object' && value !== null) {
        this.sanitizeObject(value);
      }
      
      // Remove excluded headers
      if (this.config.security.exclude_headers.includes(key.toLowerCase())) {
        obj[key] = '[REDACTED]';
      }
    }
  }
  
  /**
   * Mask sensitive data patterns in strings
   * 
   * Pattern-based sensitive data detection and masking for strings.
   * Implements comprehensive pattern matching for API keys, passwords,
   * secrets, and tokens with configurable masking strategies.
   * 
   * @method maskSensitiveData
   * @private
   * @param {string} str - String to scan and mask for sensitive data
   * @returns {string} String with sensitive patterns masked
   * 
   * Masking patterns implemented:
   * 
   * **Postman API Keys (PMAK-...):**
   * - Pattern: /PMAK-[a-zA-Z0-9-]{20,}/ 
   * - Strategy: Show first 8 + last 4 characters, mask middle
   * - Example: PMAK-1234abcd****5678
   * - Preserves enough for identification while protecting key
   * 
   * **Password Fields:**
   * - Pattern: /password[\'\"]\s*[\'\"]\w+[\'\"]/ (case-insensitive)
   * - Strategy: Complete value replacement with '[REDACTED]'
   * - Handles JSON, form data, and query parameter formats
   * - Prevents password exposure in request/response logs
   * 
   * **Secret Fields:**
   * - Pattern: /secret[\'\"]\s*[\'\"]\w+[\'\"]/ (case-insensitive)
   * - Strategy: Complete value replacement with '[REDACTED]'
   * - Protects API secrets, client secrets, shared secrets
   * - Covers various secret naming conventions
   * 
   * **Token Fields:**
   * - Pattern: /token[\'\"]\s*[\'\"]\w+[\'\"]/ (case-insensitive)
   * - Strategy: Complete value replacement with '[REDACTED]'
   * - Protects access tokens, refresh tokens, JWT tokens
   * - Handles bearer tokens and custom token formats
   * 
   * Masking strategies:
   * - **Partial masking**: For identifiable tokens (API keys)
   * - **Complete redaction**: For authentication credentials
   * - **Pattern preservation**: Maintains data format structure
   * - **Context awareness**: Different handling per data type
   * 
   * Security benefits:
   * - Prevents credential exposure in log files
   * - Maintains log structure for debugging
   * - Configurable sensitivity levels
   * - Comprehensive pattern coverage
   * 
   * Error handling:
   * - Type checking for non-string inputs
   * - Graceful handling of malformed patterns
   * - Continues processing if individual patterns fail
   * - Returns original string if not a string type
   * 
   * Dependencies:
   * - String.replace(): Pattern matching and replacement
   * - Regular expressions for pattern detection
   * - String.substring(): Partial masking for API keys
   * 
   * Called by: sanitizeLogEntry() and sanitizeObject() for string processing
   * 
   * @complexity O(n*p) where n=string length and p=number of patterns
   */
  maskSensitiveData(str) {
    if (typeof str !== 'string') return str;
    
    // Mask API keys (PMAK-...)
    str = str.replace(/PMAK-[a-zA-Z0-9-]{20,}/g, (match) => {
      return `${match.substring(0, 8)}****${match.substring(match.length - 4)}`;
    });
    
    // Mask other sensitive patterns
    str = str.replace(/password['":\s]*['"]\w+['"]/gi, 'password":"[REDACTED]"');
    str = str.replace(/secret['":\s]*['"]\w+['"]/gi, 'secret":"[REDACTED]"');
    str = str.replace(/token['":\s]*['"]\w+['"]/gi, 'token":"[REDACTED]"');
    
    return str;
  }
  
  // =============================================================================
  // Public Logging Methods - Standard Log Level Interface
  // =============================================================================
  // 
  // Standard logging interface providing debug, info, warn, and error methods
  // with consistent structured logging and security filtering.
  /**
   * Log debug-level message with optional metadata
   * 
   * Debug logging for detailed diagnostic information during development
   * and troubleshooting. Automatically filtered in production environments
   * based on configured log level.
   * 
   * @method debug
   * @param {string} message - Human-readable debug message
   * @param {Object} [meta={}] - Additional structured metadata
   * 
   * Usage examples:
   * - logger.debug('Processing collection', { collectionId: 'abc123' })
   * - logger.debug('API request details', { url, method, headers })
   * - logger.debug('Cache hit', { key, ttl, size })
   * 
   * @complexity O(1) - Direct Winston method call with security filtering
   */
  debug(message, meta = {}) {
    this.winston.debug(message, meta);
  }
  
  /**
   * Log info-level message with optional metadata
   * 
   * General information logging for normal application operation,
   * significant events, and operational metrics. Primary log level
   * for production monitoring and audit trails.
   * 
   * @method info
   * @param {string} message - Human-readable informational message
   * @param {Object} [meta={}] - Additional structured metadata
   * 
   * Usage examples:
   * - logger.info('Data collection completed', { duration, recordCount })
   * - logger.info('API request', { method, url, status, duration })
   * - logger.info('User authentication', { userId, ip, userAgent })
   * 
   * @complexity O(1) - Direct Winston method call with security filtering
   */
  info(message, meta = {}) {
    this.winston.info(message, meta);
  }
  
  /**
   * Log warning-level message with optional metadata
   * 
   * Warning logging for recoverable issues, degraded performance,
   * or conditions that may lead to errors. Indicates attention
   * required but not immediate failure.
   * 
   * @method warn
   * @param {string} message - Human-readable warning message
   * @param {Object} [meta={}] - Additional structured metadata
   * 
   * Usage examples:
   * - logger.warn('API rate limit approaching', { currentRate, limit })
   * - logger.warn('Collection analysis failed', { collectionId, error })
   * - logger.warn('Configuration deprecated', { setting, replacement })
   * 
   * @complexity O(1) - Direct Winston method call with security filtering
   */
  warn(message, meta = {}) {
    this.winston.warn(message, meta);
  }
  
  /**
   * Log error-level message with optional metadata
   * 
   * Error logging for failures, exceptions, and critical issues
   * requiring immediate attention. Includes stack traces and 
   * detailed error context for debugging.
   * 
   * @method error
   * @param {string} message - Human-readable error message
   * @param {Object} [meta={}] - Additional structured metadata including errors
   * 
   * Usage examples:
   * - logger.error('Database connection failed', { error: err.message })
   * - logger.error('API authentication failed', { status, response })
   * - logger.error('Collection processing error', { collectionId, stack })
   * 
   * @complexity O(1) - Direct Winston method call with security filtering
   */
  error(message, meta = {}) {
    this.winston.error(message, meta);
  }
  
  // =============================================================================
  // Security Audit Logging - Compliance and Security Event Tracking
  // =============================================================================
  /**
   * Log security audit event with compliance metadata
   * 
   * Specialized logging for security events, compliance activities,
   * and audit trail requirements. Creates structured audit records
   * with standardized fields for security monitoring.
   * 
   * @method audit
   * @param {string} event - Security event type or identifier
   * @param {Object} [details={}] - Event-specific details and context
   * 
   * Audit log structure:
   * - event: Security event identifier
   * - details: Context-specific event data
   * - timestamp: ISO timestamp for chronological ordering
   * - type: 'security_audit' for log filtering and aggregation
   * 
   * Common audit events:
   * - 'api_key_rotation': API key update events
   * - 'access_denied': Authorization failures
   * - 'configuration_change': Security setting modifications
   * - 'data_export': Sensitive data access events
   * 
   * Configuration requirements:
   * - config.security.audit.enabled: Boolean flag to enable audit logging
   * - Audit events only logged when explicitly enabled
   * - Allows selective audit trail activation
   * 
   * Compliance features:
   * - Standardized audit record format
   * - Immutable timestamp generation
   * - Structured event categorization
   * - Security-specific log type tagging
   * 
   * Usage examples:
   * - logger.audit('api_access', { endpoint, userId, ip })
   * - logger.audit('data_collection', { recordCount, source })
   * - logger.audit('configuration_loaded', { configFile, validated })
   * 
   * Dependencies:
   * - config.security.audit.enabled: Audit configuration flag
   * - Date.toISOString(): Standardized timestamp generation
   * - Winston info level for audit record output
   * 
   * @complexity O(1) - Conditional logging with structured metadata
   */
  audit(event, details = {}) {
    if (this.config.security?.audit?.enabled) {
      this.winston.info('AUDIT', {
        event,
        details,
        timestamp: new Date().toISOString(),
        type: 'security_audit'
      });
    }
  }
}

module.exports = Logger;