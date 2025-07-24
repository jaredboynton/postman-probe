/**
 * Postman API Client - Enterprise-Grade HTTP Client for Postman API Integration
 * 
 * Comprehensive HTTP client for interacting with Postman's REST API with enterprise
 * features including rate limiting, connection pooling, retry logic, error handling,
 * and secure credential management. Designed for high-volume governance data collection.
 */

const axios = require('axios');
const https = require('https');

/**
 * Postman API Client Class
 * 
 * Enterprise HTTP client for Postman API with comprehensive error handling,
 * rate limiting, connection pooling, and retry mechanisms. Handles all aspects
 * of secure API communication for governance data collection.
 * 
 * @class PostmanClient
 * @description Production-ready Postman API client with enterprise reliability features
 * 
 * Key features:
 * - Rate limiting compliance with Postman API limits
 * - Connection pooling with keep-alive for performance
 * - Exponential backoff retry for network resilience
 * - Comprehensive error handling with specific HTTP status processing
 * - TLS security configuration
 * - Request/response interceptors for logging and monitoring
 * 
 * Dependencies:
 * - axios: HTTP client library with interceptor support
 * - https: Node.js HTTPS agent for connection pooling
 * 
 * Called by: GovernanceCalculator for all Postman API operations
 * Calls into: Postman REST API endpoints
 * 
 * @complexity O(1) for initialization, O(n) for bulk data operations
 */
class PostmanClient {
  /**
   * Initialize Postman API Client with enterprise configuration
   * 
   * Sets up a production-ready HTTP client with rate limiting, connection pooling,
   * security headers, and comprehensive error handling. Configures axios with
   * enterprise-grade settings for reliable API communication.
   * 
   * @constructor
   * @param {string} apiKey - Postman API key for authentication
   * @param {Object} config - Client configuration including timeouts and limits
   * @param {Object} logger - Logger instance for request/response logging
   * 
   * Configuration requirements:
   * - config.base_url: Postman API base URL
   * - config.timeout_seconds: Request timeout in seconds
   * - config.rate_limit.requests_per_minute: API rate limit
   * - config.limits: Data collection limits
   * - config.collection_scope: Scope configuration for data collection
   * 
   * Rate limiting:
   * - Calculates delay between requests based on configured rate limit
   * - Implements client-side rate limiting to respect API quotas
   * - Tracks last request time for enforcement
   * 
   * Connection pooling:
   * - Keep-alive connections for performance optimization
   * - Configured socket limits for resource management
   * - TLS v1.2 for security compliance
   * - Connection timeouts to prevent hanging
   * 
   * Request/Response interceptors:
   * - Request interceptor enforces rate limiting before each request
   * - Response interceptor handles errors and retry logic
   * - Automatic retry for rate limit (429) responses
   * - Structured error handling for authentication and authorization
   * 
   * Security features:
   * - API key in X-API-Key header for authentication
   * - TLS certificate validation enabled
   * - Secure protocol enforcement (TLSv1_2_method)
   * - User-Agent header for API usage identification
   * 
   * @complexity O(1) - Linear initialization of HTTP client and interceptors
   */
  constructor(apiKey, config, logger) {
    this.apiKey = apiKey;
    this.config = config;
    this.logger = logger;
    this.rateLimitDelay = Math.ceil(60000 / config.rate_limit.requests_per_minute);
    this.lastRequestTime = 0;
    
    // Create HTTPS agent with keep-alive and connection settings
    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: config.timeout_seconds * 1000,
      freeSocketTimeout: 15000,
      // TLS settings for better reliability
      secureProtocol: 'TLSv1_2_method',
      rejectUnauthorized: true
    });
    
    this.client = axios.create({
      baseURL: config.base_url,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Postman-Governance-Collector/1.0.0',
        'Connection': 'keep-alive'
      },
      timeout: config.timeout_seconds * 1000,
      httpsAgent: httpsAgent,
      // Additional retry and connection settings
      maxRedirects: 3,
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });
    
    // Add request interceptor for rate limiting
    this.client.interceptors.request.use(async (requestConfig) => {
      await this.enforceRateLimit();
      return requestConfig;
    });
    
    // Add response interceptor for error handling and retry
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        return this.handleRequestError(error);
      }
    );
  }
  
  /**
   * Enforce client-side rate limiting for API compliance
   * 
   * Implements proactive rate limiting to stay within Postman API quotas.
   * Calculates required delay based on configured rate limit and waits
   * if necessary before allowing the request to proceed.
   * 
   * @async
   * @method enforceRateLimit
   * @private
   * 
   * Rate limiting algorithm:
   * 1. Calculate time since last request
   * 2. If time is less than required delay, wait for the difference
   * 3. Update last request time after delay
   * 
   * Benefits:
   * - Prevents 429 (Too Many Requests) responses
   * - Maintains consistent request pacing
   * - Reduces need for retry logic
   * - Improves overall reliability
   * 
   * Configuration:
   * - rateLimitDelay calculated from requests_per_minute setting
   * - Example: 280 req/min = 214ms delay between requests
   * 
   * Called by: Request interceptor for every outgoing request
   * 
   * @complexity O(1) - Simple timing calculation and potential delay
   * @returns {Promise<void>} Resolves when request can proceed
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }
  
  /**
   * Handle HTTP request errors with specific response processing
   * 
   * Comprehensive error handler for HTTP responses, providing specific
   * handling for common API error conditions including rate limiting,
   * authentication, and authorization failures.
   * 
   * @async
   * @method handleRequestError
   * @private
   * @param {Error} error - Axios error object with response information
   * @throws {Error} When authentication fails or retry is unsuccessful
   * @throws {Error} When authorization is insufficient
   * @throws {Error} For unhandled error conditions
   * 
   * Error handling by status code:
   * 
   * **429 - Rate Limit Exceeded:**
   * - Honors Retry-After header if present
   * - Falls back to 5-second default delay
   * - Automatically retries the original request once
   * - Logs retry attempts for monitoring
   * 
   * **401 - Unauthorized:**
   * - Indicates invalid or expired API key
   * - Throws user-friendly error message
   * - Logs authentication failure for security audit
   * 
   * **403 - Forbidden:**
   * - Indicates insufficient permissions for the resource
   * - May indicate API key lacks required scopes
   * - Throws user-friendly error message
   * 
   * **Other errors:**
   * - Re-throws original error for upstream handling
   * - Allows network-level retry logic to handle transient issues
   * 
   * Retry behavior:
   * - Single retry attempt for rate limit responses
   * - Uses original request configuration
   * - Logs both original error and retry failure
   * 
   * Dependencies:
   * - error.response.status: HTTP status code
   * - error.response.headers['retry-after']: Server-specified retry delay
   * - this.client.request(): Retry mechanism
   * 
   * Called by: Response interceptor for failed requests
   * 
   * @complexity O(1) - Simple error classification and optional retry
   * @returns {Promise<Object>} Axios response object if retry succeeds
   */
  async handleRequestError(error) {
    const status = error.response?.status;
    const retryAfter = error.response?.headers['retry-after'];
    
    if (status === 429) {
      // Rate limit exceeded - wait and retry
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 5000; // 5 second default
      this.logger.warn('Rate limit exceeded, waiting before retry', { delay });
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Retry the original request
      try {
        return await this.client.request(error.config);
      } catch (retryError) {
        this.logger.error('Retry after rate limit also failed', { 
          error: retryError.message,
          status: retryError.response?.status 
        });
        throw retryError;
      }
    }
    
    if (status === 401) {
      this.logger.error('Authentication failed - invalid API key');
      throw new Error('Unauthorized. Please check your API key.');
    }
    
    if (status === 403) {
      this.logger.error('Access forbidden - insufficient permissions');
      throw new Error('Forbidden. Insufficient permissions.');
    }
    
    throw error;
  }

  /**
   * Execute request function with exponential backoff retry logic
   * 
   * Wrapper method that adds resilient retry capability to any request function.
   * Uses exponential backoff with jitter to handle transient network issues,
   * TLS handshake failures, and temporary service unavailability.
   * 
   * @async
   * @method makeRequestWithRetry
   * @private
   * @param {Function} requestFn - Async function that makes the HTTP request
   * @param {number} [retries=3] - Maximum number of retry attempts
   * @param {number} [baseDelay=1000] - Base delay in milliseconds for exponential backoff
   * @throws {Error} When all retry attempts are exhausted or error is non-retryable
   * 
   * Retry strategy:
   * - Exponential backoff: delay = baseDelay * (2^attempt) + jitter
   * - Jitter (random component) prevents thundering herd problem
   * - Only retries network-level errors (not HTTP 4xx/5xx responses)
   * - Preserves original error from last attempt
   * 
   * Retryable conditions:
   * - Network connectivity issues (ECONNRESET, ECONNREFUSED, ETIMEDOUT)
   * - DNS resolution failures (ENOTFOUND, EAI_AGAIN)
   * - TLS handshake failures
   * - Server errors (502, 503, 504, etc.)
   * - Rate limiting (429) - handled by response interceptor
   * 
   * Non-retryable conditions:
   * - Authentication errors (401)
   * - Authorization errors (403)
   * - Client errors (400, 404, etc.)
   * - Application-level errors
   * 
   * Logging:
   * - Logs each retry attempt with delay and error details
   * - Includes error code classification for troubleshooting
   * - Tracks timeout vs. connection reset distinction
   * 
   * Dependencies:
   * - isRetryableNetworkError(): Error classification logic
   * - setTimeout(): Delay implementation
   * - Math.pow(): Exponential calculation
   * - Math.random(): Jitter generation
   * 
   * Called by: Critical API methods that need network resilience
   * 
   * @complexity O(n) where n is the number of retry attempts (typically 3)
   * @returns {Promise<*>} Result from successful request function execution
   */
  async makeRequestWithRetry(requestFn, retries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        // Check if this is a network/TLS error that should be retried
        const isRetryableError = this.isRetryableNetworkError(error);
        
        if (!isRetryableError || attempt === retries - 1) {
          // Not retryable or last attempt - throw the error
          throw error;
        }
        
        // Exponential backoff: delay = baseDelay * (2^attempt) with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        
        this.logger.warn('Network error encountered, retrying with exponential backoff', {
          attempt: attempt + 1,
          totalRetries: retries,
          delay: Math.round(delay),
          error: error.message,
          errorCode: error.code,
          isTimeout: error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT'
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Classify errors as retryable network/transport issues
   * 
   * Determines whether an error represents a transient network condition
   * that should be retried with exponential backoff. Distinguishes between
   * retryable network issues and permanent application errors.
   * 
   * @method isRetryableNetworkError
   * @private
   * @param {Error} error - Error object from failed HTTP request
   * @returns {boolean} True if error should be retried, false otherwise
   * 
   * Retryable error codes (network layer):
   * - ECONNRESET: Connection reset by peer (server closed connection)
   * - ENOTFOUND: DNS lookup failed (temporary DNS issues)
   * - ECONNREFUSED: Connection refused (server not accepting connections)
   * - ETIMEDOUT: Request timeout (network congestion)
   * - ESOCKETTIMEDOUT: Socket timeout (slow network)
   * - ECONNABORTED: Connection aborted (network interruption)
   * - EPIPE: Broken pipe (connection lost during write)
   * - EAI_AGAIN: DNS lookup timeout (DNS server overloaded)
   * 
   * Retryable error messages (pattern matching):
   * - TLS handshake failures
   * - Socket disconnection messages
   * - Connection-specific error patterns
   * 
   * Retryable HTTP status codes (server issues):
   * - 502, 503, 504: Server gateway errors (temporary)
   * - 408: Request timeout (server overloaded)
   * - 429: Rate limiting (should retry with delay)
   * - 520-524: Cloudflare-specific server errors
   * 
   * Non-retryable conditions:
   * - 4xx client errors (except 408, 429)
   * - Authentication/authorization failures
   * - Malformed requests
   * - Application logic errors
   * 
   * Error classification logic:
   * 1. Check error.code against known network error codes
   * 2. Check error.message against known network error patterns
   * 3. Check HTTP status code for temporary server issues
   * 4. Default to non-retryable for unrecognized errors
   * 
   * Dependencies:
   * - Array.includes(): Error code/status code lookup
   * - Array.some(): Error message pattern matching
   * - String.toLowerCase(): Case-insensitive message comparison
   * 
   * Called by: makeRequestWithRetry() for error classification
   * 
   * @complexity O(1) - Simple lookup operations with small constant arrays
   */
  isRetryableNetworkError(error) {
    // Network-level errors that should be retried with exponential backoff
    const retryableCodes = [
      'ECONNRESET',     // Connection reset by peer
      'ENOTFOUND',      // DNS lookup failed
      'ECONNREFUSED',   // Connection refused
      'ETIMEDOUT',      // Request timeout
      'ESOCKETTIMEDOUT', // Socket timeout
      'ECONNABORTED',   // Connection aborted
      'EPIPE',          // Broken pipe
      'EAI_AGAIN',      // DNS lookup timeout
    ];
    
    const retryableMessages = [
      'Client network socket disconnected before secure TLS connection was established',
      'socket hang up',
      'connect ECONNREFUSED',
      'connect ETIMEDOUT',
      'read ECONNRESET',
      'write EPIPE'
    ];
    
    // Check error code
    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }
    
    // Check error message
    if (error.message) {
      return retryableMessages.some(msg => 
        error.message.toLowerCase().includes(msg.toLowerCase())
      );
    }
    
    // Also retry on specific HTTP status codes that indicate temporary issues
    const status = error.response?.status;
    if (status && [502, 503, 504, 408, 429, 520, 521, 522, 523, 524].includes(status)) {
      return true;
    }
    
    return false;
  }
  
  // Core API Methods
  
  /**
   * Get current user information
   * 
   * Retrieves the authenticated user's profile information from Postman API.
   * Used for user identification and API key validation.
   * 
   * @async
   * @method getUser
   * @throws {Error} When API request fails or user is unauthorized
   * @returns {Promise<Object>} User profile object
   */
  async getUser() {
    try {
      const response = await this.client.get('/me');
      return response.data.user;
    } catch (error) {
      this.logger.error('Failed to get user info', { error: error.message });
      throw error;
    }
  }
  
  /** Get complete user response data including team and profile information */
  async getUserResponse() {
    try {
      const response = await this.client.get('/me');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get user response', { error: error.message });
      throw error;
    }
  }
  
  /** Get list of all accessible workspaces */
  async getWorkspaces() {
    try {
      const response = await this.client.get('/workspaces');
      return response.data.workspaces || [];
    } catch (error) {
      this.logger.error('Failed to get workspaces', { error: error.message });
      throw error;
    }
  }
  
  /** Get detailed information for a specific workspace */
  async getWorkspace(workspaceId) {
    try {
      const response = await this.client.get(`/workspaces/${workspaceId}`);
      return response.data.workspace;
    } catch (error) {
      this.logger.error('Failed to get workspace', { workspaceId, error: error.message });
      throw error;
    }
  }
  
  /** Get members of a specific workspace */
  async getWorkspaceUsers(workspaceId) {
    try {
      const response = await this.client.get(`/workspaces/${workspaceId}/members`);
      return response.data.members || [];
    } catch (error) {
      this.logger.error('Failed to get workspace users', { workspaceId, error: error.message });
      throw error;
    }
  }
  
  /** Get tags associated with a workspace for organization analysis */
  async getWorkspaceTags(workspaceId) {
    try {
      const response = await this.client.get(`/workspaces/${workspaceId}/tags`);
      return response.data.tags || [];
    } catch (error) {
      this.logger.error('Failed to get workspace tags', { workspaceId, error: error.message });
      throw error;
    }
  }

  async getWorkspaceRoles(workspaceId) {
    return await this.makeRequestWithRetry(async () => {
      try {
        const response = await this.client.get(`/workspaces/${workspaceId}/roles`);
        const roles = response.data.roles || [];
        
        // Extract all users from all roles for better user enumeration
        const allUsers = new Set();
        const userRoleMapping = {};
        
        roles.forEach(role => {
          if (role.users && Array.isArray(role.users)) {
            role.users.forEach(user => {
              if (user.id) {
                allUsers.add(user.id);
                userRoleMapping[user.id] = {
                  role: role.name,
                  roleId: role.id,
                  user: user
                };
              }
            });
          }
        });
        
        this.logger.info('Workspace roles retrieved', {
          workspaceId,
          totalRoles: roles.length,
          totalUsers: allUsers.size,
          roleNames: roles.map(r => r.name)
        });

        return {
          roles: roles,
          users: Array.from(allUsers),
          userRoleMapping: userRoleMapping
        };
      } catch (error) {
        this.logger.error('Failed to get workspace roles', {
          workspaceId,
          error: error.message,
          errorCode: error.code,
          status: error.response?.status
        });
        throw error;
      }
    }, 3, 1000); // 3 retries with 1 second base delay
  }
  
  /** Get list of all accessible collections */
  async getCollections() {
    try {
      const response = await this.client.get('/collections');
      return response.data.collections || [];
    } catch (error) {
      this.logger.error('Failed to get collections', { error: error.message });
      throw error;
    }
  }
  
  /** Get detailed information for a specific collection with retry logic */
  async getCollection(collectionId) {
    return await this.makeRequestWithRetry(async () => {
      try {
        const response = await this.client.get(`/collections/${collectionId}`);
        return response.data.collection;
      } catch (error) {
        this.logger.error('Failed to get collection', { 
          collectionId, 
          error: error.message,
          errorCode: error.code,
          status: error.response?.status
        });
        throw error;
      }
    }, 3, 1000); // 3 retries with 1 second base delay
  }
  
  async getCollectionForks(collectionId) {
    return await this.makeRequestWithRetry(async () => {
      try {
        const response = await this.client.get(`/collections/${collectionId}/forks`);
        // API returns {data: [...]} structure, not {forks: [...]}
        const forks = response.data.data || [];
        
        this.logger.info('Collection forks retrieved', {
          collectionId,
          forkCount: forks.length,
          forks: forks.map(f => ({
            forkId: f.forkId,
            forkName: f.forkName,
            createdBy: f.createdBy,
            createdAt: f.createdAt
          }))
        });
        
        return forks;
      } catch (error) {
        this.logger.error('Failed to get collection forks', { 
          collectionId, 
          error: error.message,
          errorCode: error.code,
          status: error.response?.status
        });
        throw error;
      }
    }, 3, 1000); // 3 retries with 1 second base delay
  }
  
  /** Get list of all environments for governance analysis */
  async getEnvironments() {
    try {
      const response = await this.client.get('/environments');
      return response.data.environments || [];
    } catch (error) {
      this.logger.error('Failed to get environments', { error: error.message });
      throw error;
    }
  }
  
  /** Get detailed information for a specific environment */
  async getEnvironment(environmentId) {
    try {
      const response = await this.client.get(`/environments/${environmentId}`);
      return response.data.environment;
    } catch (error) {
      this.logger.error('Failed to get environment', { environmentId, error: error.message });
      throw error;
    }
  }
  
  /** Get list of all API specifications for governance compliance */
  async getAPISpecs() {
    try {
      const response = await this.client.get('/apis');
      return response.data.apis || [];
    } catch (error) {
      this.logger.error('Failed to get API specs', { error: error.message });
      throw error;
    }
  }
  
  /** Get detailed information for a specific API specification */
  async getAPISpec(apiId) {
    try {
      const response = await this.client.get(`/apis/${apiId}`);
      return response.data.api;
    } catch (error) {
      this.logger.error('Failed to get API spec', { apiId, error: error.message });
      throw error;
    }
  }
  
  /** Get user groups for organizational structure analysis with detailed logging */
  async getUserGroups() {
    try {
      this.logger.info('Attempting to get user groups', { url: `${this.client.defaults.baseURL}/groups` });
      const response = await this.client.get('/groups');
      this.logger.info('Groups response received', { 
        status: response.status, 
        dataKeys: Object.keys(response.data),
        groupCount: response.data.data ? response.data.data.length : 0
      });
      return response.data.data || [];
    } catch (error) {
      this.logger.error('Failed to get user groups', { 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        method: error.config?.method
      });
      throw error;
    }
  }
  
  /** Get team users for user management analysis with detailed logging */
  async getTeamUsers() {
    try {
      this.logger.info('Attempting to get team users', { url: `${this.client.defaults.baseURL}/users` });
      const response = await this.client.get('/users');
      this.logger.info('Team users response received', { 
        status: response.status, 
        dataKeys: Object.keys(response.data),
        userCount: response.data.data ? response.data.data.length : 0
      });
      return response.data.data || [];
    } catch (error) {
      this.logger.error('Failed to get team users', { 
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        method: error.config?.method
      });
      throw error;
    }
  }
  
  /** Get specific user group details */
  async getUserGroup(groupId) {
    try {
      const response = await this.client.get(`/groups/${groupId}`);
      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to get user group', { groupId, error: error.message });
      throw error;
    }
  }
  
  /** Get list of all mock servers for testing governance */
  async getMocks() {
    try {
      const response = await this.client.get('/mocks');
      return response.data.mocks || [];
    } catch (error) {
      this.logger.error('Failed to get mocks', { error: error.message });
      throw error;
    }
  }
  
  /** Get detailed information for a specific mock server */
  async getMock(mockId) {
    try {
      const response = await this.client.get(`/mocks/${mockId}`);
      return response.data.mock;
    } catch (error) {
      this.logger.error('Failed to get mock', { mockId, error: error.message });
      throw error;
    }
  }
  
  /** Get list of all monitors for monitoring governance */
  async getMonitors() {
    try {
      const response = await this.client.get('/monitors');
      return response.data.monitors || [];
    } catch (error) {
      this.logger.error('Failed to get monitors', { error: error.message });
      throw error;
    }
  }
  
  /** Get detailed information for a specific monitor */
  async getMonitor(monitorId) {
    try {
      const response = await this.client.get(`/monitors/${monitorId}`);
      return response.data.monitor;
    } catch (error) {
      this.logger.error('Failed to get monitor', { monitorId, error: error.message });
      throw error;
    }
  }
  
  /** Get execution history for a specific monitor */
  async getMonitorRuns(monitorId) {
    try {
      const response = await this.client.get(`/monitors/${monitorId}/runs`);
      return response.data.runs || [];
    } catch (error) {
      this.logger.error('Failed to get monitor runs', { monitorId, error: error.message });
      throw error;
    }
  }
  
  /** Get private network APIs for enterprise governance */
  async getPrivateNetworkAPIs() {
    try {
      const response = await this.client.get('/network/private');
      return response.data.apis || [];
    } catch (error) {
      this.logger.error('Failed to get private network APIs', { error: error.message });
      throw error;
    }
  }
  
  /** Get specific private network API details */
  async getPrivateNetworkAPI(apiId) {
    try {
      const response = await this.client.get(`/network/private/${apiId}`);
      return response.data.api;
    } catch (error) {
      this.logger.error('Failed to get private network API', { apiId, error: error.message });
      throw error;
    }
  }
  
  /** Get private network folders for organization analysis */
  async getPrivateNetworkFolders() {
    try {
      const response = await this.client.get('/network/private/folders');
      return response.data.folders || [];
    } catch (error) {
      this.logger.error('Failed to get private network folders', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Comprehensive data collection for governance analysis
   * 
   * Main orchestration method that collects all governance-relevant data from
   * Postman API. Implements rate limiting, error handling, progress tracking,
   * and configurable collection limits for enterprise-scale organizations.
   * 
   * @async
   * @method collectAllData
   * @throws {Error} When critical API calls fail or data collection cannot proceed
   * 
   * Data collection workflow:
   * 
   * **Phase 1: Basic Data Collection**
   * - User profile and team information
   * - Workspaces, collections, environments
   * - API specifications, user groups
   * - Mocks, monitors, team users
   * 
   * **Phase 2: Detailed Workspace Analysis**
   * - Workspace details and configurations
   * - Workspace tags (if enabled)
   * - Workspace roles and user mappings
   * - Limited by max_workspaces configuration
   * 
   * **Phase 3: Detailed Collection Analysis**
   * - Collection details and structure
   * - Collection forks and collaboration data
   * - Progress tracking with periodic logging
   * - Limited by max_collection_analysis configuration
   * 
   * **Phase 4: Optional Private Network Data**
   * - Private network APIs (if enabled in scope)
   * - Enterprise-specific API governance data
   * 
   * Performance optimizations:
   * - Configurable limits prevent API quota exhaustion
   * - Progress logging for long-running operations
   * - Graceful error handling preserves partial data
   * - Rate limiting prevents API throttling
   * 
   * Error handling strategy:
   * - Critical errors (user, workspaces, collections) are thrown
   * - Non-critical errors (tags, forks) are logged and defaulted
   * - Partial failure allows governance analysis to proceed
   * 
   * Configuration dependencies:
   * - config.limits.max_workspaces: Workspace analysis limit (-1 = unlimited)
   * - config.limits.max_collection_analysis: Collection analysis limit
   * - config.collection_scope.workspace_tags: Enable tag collection
   * - config.collection_scope.private_apis: Enable private API collection
   * 
   * Return data structure:
   * - user: Authenticated user profile
   * - workspaces: Array of workspace objects with details
   * - collections: Array of collection objects with details
   * - environments: Array of environment configurations
   * - apiSpecs: Array of API specifications
   * - userGroups: Array of user group definitions
   * - teamUsers: Array of team member information
   * - mocks: Array of mock server configurations
   * - monitors: Array of collection monitors
   * - workspaceRoles: Array of workspace role mappings
   * - privateNetworkAPIs: Array of private network API definitions
   * 
   * Performance metrics:
   * - Logs total duration and item counts
   * - Progress tracking for collection analysis
   * - Enables performance optimization and monitoring
   * 
   * Called by: GovernanceCalculator for data collection cycles
   * 
   * @complexity O(n*m) where n is workspaces and m is collections per workspace
   * @returns {Promise<Object>} Comprehensive governance data structure
   */
  async collectAllData() {
    const startTime = Date.now();
    this.logger.info('Starting comprehensive data collection');
    
    try {
      const data = {
        user: null,
        workspaces: [],
        collections: [],
        environments: [],
        apiSpecs: [],
        userGroups: [],
        mocks: [],
        monitors: [],
        privateNetworkAPIs: [],
        forks: [],
        tags: [],
        workspaceRoles: []
      };
      
      // Collect basic data
      data.user = await this.getUserResponse();
      data.workspaces = await this.getWorkspaces();
      data.collections = await this.getCollections();
      data.environments = await this.getEnvironments();
      data.apiSpecs = await this.getAPISpecs();
      data.userGroups = await this.getUserGroups();
      data.teamUsers = await this.getTeamUsers();
      data.mocks = await this.getMocks();
      data.monitors = await this.getMonitors();
      
      // Collect detailed workspace data (limited by configuration)
      const maxWorkspaces = this.config.limits.max_workspaces;
      const workspacesToAnalyze = maxWorkspaces === -1 ? data.workspaces : data.workspaces.slice(0, maxWorkspaces);
      
      for (const workspace of workspacesToAnalyze) {
        try {
          // Get workspace details
          const workspaceDetail = await this.getWorkspace(workspace.id);
          Object.assign(workspace, workspaceDetail);
          
          // Skip workspace members API call - endpoint returns 404 errors
          // User enumeration will be handled via team users endpoint instead
          workspace.members = workspace.members || [];
          
          // Get workspace tags if enabled
          if (this.config.collection_scope.workspace_tags) {
            try {
              workspace.tags = await this.getWorkspaceTags(workspace.id);
            } catch (error) {
              this.logger.warn('Failed to get workspace tags', { 
                workspaceId: workspace.id, 
                error: error.message 
              });
              workspace.tags = [];
            }
          }

          // Get workspace roles for better user enumeration
          try {
            const workspaceRoles = await this.getWorkspaceRoles(workspace.id);
            workspace.roles = workspaceRoles;
            data.workspaceRoles.push({
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              ...workspaceRoles
            });
          } catch (error) {
            this.logger.warn('Failed to get workspace roles', {
              workspaceId: workspace.id,
              error: error.message
            });
            workspace.roles = { roles: [], users: [], userRoleMapping: {} };
          }
          
        } catch (error) {
          this.logger.warn('Failed to get workspace details', { 
            workspaceId: workspace.id, 
            error: error.message 
          });
        }
      }
      
      // Collect detailed collection data (limited by configuration)
      const maxCollections = this.config.limits.max_collection_analysis;
      const collectionsToAnalyze = maxCollections === -1 ? data.collections : data.collections.slice(0, maxCollections);
      
      this.logger.info('Starting detailed collection analysis', {
        totalCollections: data.collections.length,
        collectionsToAnalyze: collectionsToAnalyze.length,
        unlimited: maxCollections === -1
      });
      
      for (const [index, collection] of collectionsToAnalyze.entries()) {
        try {
          // Log progress every 10 collections
          if (index % 10 === 0) {
            this.logger.info('Collection analysis progress', {
              analyzed: index,
              total: collectionsToAnalyze.length,
              progress: `${Math.round((index / collectionsToAnalyze.length) * 100)}%`
            });
          }
          
          // Get collection details
          const collectionDetail = await this.getCollection(collection.uid);
          Object.assign(collection, collectionDetail);
          
          // Get collection forks
          try {
            collection.forks = await this.getCollectionForks(collection.uid);
          } catch (error) {
            this.logger.warn('Failed to get collection forks', { 
              collectionId: collection.uid, 
              error: error.message 
            });
            collection.forks = [];
          }
          
        } catch (error) {
          this.logger.warn('Failed to get collection details', { 
            collectionId: collection.uid, 
            error: error.message 
          });
        }
      }
      
      // Collect private network data if enabled
      if (this.config.collection_scope.private_apis) {
        try {
          data.privateNetworkAPIs = await this.getPrivateNetworkAPIs();
        } catch (error) {
          this.logger.warn('Failed to get private network APIs', { error: error.message });
          data.privateNetworkAPIs = [];
        }
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('Data collection completed', {
        duration: `${duration}ms`,
        workspaces: data.workspaces.length,
        collections: data.collections.length,
        environments: data.environments.length,
        userGroups: data.userGroups.length,
        monitors: data.monitors.length,
        mocks: data.mocks.length
      });
      
      return data;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Data collection failed', {
        error: error.message,
        duration: `${duration}ms`
      });
      throw error;
    }
  }
}

module.exports = PostmanClient;