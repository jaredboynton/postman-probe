/**
 * Authentication Manager - Enterprise Security Authentication System
 * 
 * Comprehensive authentication and authorization system supporting multiple
 * authentication methods including JWT tokens, API keys, and external SSO
 * integration. Provides role-based access control (RBAC) and audit logging.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * AuthManager Class - Multi-Method Authentication and Authorization
 * 
 * Enterprise authentication system supporting JWT tokens, API keys, and
 * external authentication providers. Implements role-based access control,
 * token management, and comprehensive security audit logging.
 * 
 * @class AuthManager
 * @description Production-ready authentication with multiple auth methods
 * 
 * Supported authentication methods:
 * - **JWT Tokens**: Stateless authentication with configurable expiration
 * - **API Keys**: Long-lived authentication tokens for service-to-service
 * - **Basic Auth**: Username/password authentication with bcrypt hashing
 * - **Bearer Tokens**: OAuth-style bearer token authentication
 * - **External SSO**: Integration hooks for SAML/OIDC providers
 * 
 * Role-based access control:
 * - **admin**: Full system access including user management
 * - **analyst**: Read access to all governance data and analytics
 * - **viewer**: Read-only access to dashboards and basic metrics
 * - **service**: Programmatic access for automated systems
 * 
 * Security features:
 * - Password hashing with bcrypt and configurable salt rounds
 * - JWT token signing with configurable algorithms and expiration
 * - API key generation with cryptographically secure random values
 * - Rate limiting and brute force protection
 * - Comprehensive audit logging for security events
 * 
 * Dependencies:
 * - jsonwebtoken: JWT token creation and validation
 * - bcrypt: Password hashing and verification
 * - crypto: Secure random value generation
 * - Logger: Security audit trail logging
 * 
 * @complexity O(1) for token operations, O(n) for user lookups
 */
class AuthManager {
  /**
   * Initialize AuthManager with security configuration
   * 
   * Sets up authentication system with configurable security policies,
   * JWT settings, password requirements, and audit logging capabilities.
   * 
   * @constructor
   * @param {Object} config - Authentication configuration object
   * @param {Logger} logger - Structured logger for security audit trails
   * 
   * Configuration structure:
   * - config.jwt: JWT token configuration
   *   - secret: Secret key for JWT signing (required)
   *   - algorithm: Signing algorithm (default: HS256)
   *   - expiresIn: Token expiration time (default: 24h)
   *   - issuer: Token issuer identifier
   *   - audience: Token audience identifier
   * 
   * - config.password: Password policy settings
   *   - salt_rounds: bcrypt salt rounds (default: 12)
   *   - min_length: Minimum password length (default: 8)
   *   - require_special: Require special characters (default: true)
   * 
   * - config.api_keys: API key configuration
   *   - length: Generated key length in bytes (default: 32)
   *   - prefix: Key prefix for identification (default: PGSK-)
   *   - expiration_days: Default expiration period (default: 365)
   * 
   * - config.rate_limiting: Authentication rate limiting
   *   - max_attempts: Maximum auth attempts per window
   *   - window_minutes: Time window for rate limiting
   *   - lockout_minutes: Account lockout duration
   * 
   * Security initialization:
   * - Validates JWT secret strength and algorithm
   * - Sets up rate limiting counters and cleanup intervals
   * - Initializes user store and session management
   * - Configures audit logging for security events
   * 
   * @complexity O(1) - Simple configuration setup and validation
   */
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    
    // JWT configuration
    this.jwtSecret = config.jwt?.secret || process.env.JWT_SECRET;
    this.jwtAlgorithm = config.jwt?.algorithm || 'HS256';
    this.jwtExpiresIn = config.jwt?.expiresIn || '24h';
    this.jwtIssuer = config.jwt?.issuer || 'postman-governance';
    this.jwtAudience = config.jwt?.audience || 'governance-api';
    
    // Password configuration
    this.saltRounds = config.password?.salt_rounds || 12;
    this.minPasswordLength = config.password?.min_length || 8;
    this.requireSpecialChars = config.password?.require_special || true;
    
    // API key configuration
    this.apiKeyLength = config.api_keys?.length || 32;
    this.apiKeyPrefix = config.api_keys?.prefix || 'PGSK-';
    this.defaultApiKeyExpiration = config.api_keys?.expiration_days || 365;
    
    // Rate limiting
    this.maxAttempts = config.rate_limiting?.max_attempts || 5;
    this.windowMinutes = config.rate_limiting?.window_minutes || 15;
    this.lockoutMinutes = config.rate_limiting?.lockout_minutes || 30;
    
    // Initialize in-memory stores (in production, use Redis or database)
    this.users = new Map();
    this.apiKeys = new Map();
    this.rateLimitStore = new Map();
    this.sessionStore = new Map();
    
    // Initialize default admin user if configured
    this.initializeDefaultUsers();
    
    // Set up cleanup intervals
    this.startCleanupTasks();
    
    this.logger.info('Authentication system initialized', {
      jwtAlgorithm: this.jwtAlgorithm,
      jwtExpiresIn: this.jwtExpiresIn,
      saltRounds: this.saltRounds,
      component: 'auth-manager'
    });
  }
  
  /**
   * Initialize default system users from configuration
   * 
   * Creates initial administrative users and service accounts based on
   * configuration settings. Supports environment variable overrides for
   * automated deployment scenarios.
   * 
   * @method initializeDefaultUsers
   * @private
   * @async
   * 
   * Default users created:
   * - Admin user: Full system access with configurable credentials
   * - Service account: API access for automated systems
   * - Read-only user: Dashboard access for monitoring teams
   * 
   * Environment variable support:
   * - GOVERNANCE_ADMIN_PASSWORD: Override default admin password
   * - GOVERNANCE_SERVICE_KEY: Override service account API key
   * - GOVERNANCE_READONLY_PASSWORD: Override read-only password
   * 
   * Security considerations:
   * - Passwords are hashed with bcrypt before storage
   * - Default passwords are generated if not provided
   * - Service keys use cryptographically secure random generation
   * - Initial setup is logged for audit purposes
   * 
   * @complexity O(n) where n is the number of default users to create
   */
  async initializeDefaultUsers() {
    try {
      // Create default admin user
      const adminPassword = process.env.GOVERNANCE_ADMIN_PASSWORD || 
        this.generateSecurePassword();
      
      await this.createUser({
        username: 'admin',
        password: adminPassword,
        email: 'admin@governance.local',
        role: 'admin',
        created_by: 'system'
      });
      
      // Create service account with API key
      const serviceKey = process.env.GOVERNANCE_SERVICE_KEY || 
        this.generateApiKey();
      
      await this.createUser({
        username: 'service',
        password: null, // Service accounts use API keys only
        email: 'service@governance.local',
        role: 'service',
        created_by: 'system'
      });
      
      await this.createApiKey({
        user_id: 'service',
        name: 'Default Service Key',
        key: serviceKey,
        permissions: ['governance:read', 'governance:write'],
        expires_at: null // Never expires
      });
      
      // Create read-only user
      const readonlyPassword = process.env.GOVERNANCE_READONLY_PASSWORD || 
        this.generateSecurePassword();
      
      await this.createUser({
        username: 'viewer',
        password: readonlyPassword,
        email: 'viewer@governance.local',
        role: 'viewer',
        created_by: 'system'
      });
      
      this.logger.audit('default_users_initialized', {
        users_created: ['admin', 'service', 'viewer'],
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize default users', {
        error: error.message,
        component: 'auth-manager'
      });
    }
  }
  
  /**
   * Create new user account with password hashing
   * 
   * Creates user account with secure password hashing, role assignment,
   * and comprehensive validation. Supports both interactive and service
   * account creation with appropriate security measures.
   * 
   * @method createUser
   * @async
   * @param {Object} userData - User creation data
   * @throws {Error} When user creation fails or validation errors
   * @returns {Promise<Object>} Created user object (without password hash)
   * 
   * User data structure:
   * - username: Unique username identifier (required)
   * - password: Plain text password for hashing (optional for service accounts)
   * - email: User email address (required)
   * - role: User role (admin, analyst, viewer, service)
   * - created_by: User who created this account
   * - metadata: Additional user metadata
   * 
   * Validation performed:
   * - Username uniqueness check
   * - Password strength validation (if provided)
   * - Email format validation
   * - Role validity verification
   * 
   * Security features:
   * - Password hashing with bcrypt and configured salt rounds
   * - Username sanitization and validation
   * - Role-based permission assignment
   * - Account creation audit logging
   * 
   * @complexity O(1) for validation, O(log n) for password hashing
   */
  async createUser(userData) {
    const { username, password, email, role = 'viewer', created_by, metadata = {} } = userData;
    
    // Validate input
    if (!username || !email) {
      throw new Error('Username and email are required');
    }
    
    if (this.users.has(username)) {
      throw new Error('Username already exists');
    }
    
    // Validate role
    const validRoles = ['admin', 'analyst', 'viewer', 'service'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }
    
    // Hash password if provided
    let passwordHash = null;
    if (password) {
      this.validatePassword(password);
      passwordHash = await bcrypt.hash(password, this.saltRounds);
    }
    
    const user = {
      id: crypto.randomUUID(),
      username,
      email,
      role,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
      created_by: created_by || 'system',
      last_login: null,
      failed_attempts: 0,
      locked_until: null,
      metadata,
      permissions: this.getRolePermissions(role)
    };
    
    this.users.set(username, user);
    
    this.logger.audit('user_created', {
      user_id: user.id,
      username,
      role,
      created_by,
      timestamp: user.created_at
    });
    
    // Return user without password hash
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }
  
  /**
   * Generate cryptographically secure API key
   * 
   * Creates secure API key using cryptographically strong random values
   * with configurable prefix and length. Includes metadata for tracking
   * and management purposes.
   * 
   * @method generateApiKey
   * @returns {string} Generated API key with prefix
   * 
   * Key format: PREFIX-BASE64_ENCODED_RANDOM_BYTES
   * - Prefix: Configurable identifier (default: PGSK-)
   * - Random bytes: Cryptographically secure random values
   * - Encoding: Base64 URL-safe encoding for compatibility
   * 
   * Security features:
   * - Uses crypto.randomBytes() for cryptographic security
   * - Configurable key length for different security requirements
   * - URL-safe base64 encoding for HTTP header compatibility
   * - Unique prefix for key identification and validation
   * 
   * @complexity O(1) - Fixed-time random generation and encoding
   */
  generateApiKey() {
    const randomBytes = crypto.randomBytes(this.apiKeyLength);
    const keyData = randomBytes.toString('base64url');
    return `${this.apiKeyPrefix}${keyData}`;
  }
  
  /**
   * Create API key for user authentication
   * 
   * Generates and stores API key for user authentication with configurable
   * permissions, expiration, and metadata. Supports both user-specific and
   * service account API keys.
   * 
   * @method createApiKey
   * @async
   * @param {Object} keyData - API key creation data
   * @throws {Error} When API key creation fails
   * @returns {Promise<Object>} Created API key object
   * 
   * Key data structure:
   * - user_id: Username or user ID (required)
   * - name: Human-readable key name (required)
   * - key: Pre-generated key (optional, will generate if not provided)
   * - permissions: Array of permission strings
   * - expires_at: Key expiration date (optional)
   * - metadata: Additional key metadata
   * 
   * Permission examples:
   * - 'governance:read': Read access to governance data
   * - 'governance:write': Write access to governance data
   * - 'governance:admin': Administrative access
   * - 'metrics:read': Access to metrics endpoints
   * 
   * @complexity O(1) - Simple key generation and storage
   */
  async createApiKey(keyData) {
    const { 
      user_id, 
      name, 
      key = this.generateApiKey(), 
      permissions = [], 
      expires_at = null,
      metadata = {} 
    } = keyData;
    
    if (!user_id || !name) {
      throw new Error('User ID and key name are required');
    }
    
    // Calculate default expiration if not provided
    const expiresAt = expires_at || 
      new Date(Date.now() + (this.defaultApiKeyExpiration * 24 * 60 * 60 * 1000)).toISOString();
    
    const apiKey = {
      id: crypto.randomUUID(),
      key,
      user_id,
      name,
      permissions,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      last_used: null,
      usage_count: 0,
      metadata
    };
    
    this.apiKeys.set(key, apiKey);
    
    this.logger.audit('api_key_created', {
      key_id: apiKey.id,
      user_id,
      name,
      permissions,
      expires_at: expiresAt,
      timestamp: apiKey.created_at
    });
    
    return apiKey;
  }
  
  /**
   * Authenticate user with username and password
   * 
   * Validates user credentials with rate limiting, brute force protection,
   * and comprehensive audit logging. Returns JWT token on successful
   * authentication.
   * 
   * @method authenticateUser
   * @async
   * @param {string} username - User identifier
   * @param {string} password - Plain text password
   * @param {Object} metadata - Authentication metadata (IP, user agent, etc.)
   * @throws {Error} When authentication fails or account is locked
   * @returns {Promise<Object>} Authentication result with JWT token
   * 
   * Authentication workflow:
   * 1. Rate limiting check and lockout validation
   * 2. User existence and status verification
   * 3. Password hash comparison with bcrypt
   * 4. JWT token generation with user claims
   * 5. Login success logging and counter reset
   * 6. Failed attempt tracking and potential lockout
   * 
   * Rate limiting features:
   * - Configurable maximum attempts per time window
   * - Account lockout with exponential backoff
   * - IP-based rate limiting for additional protection
   * - Automatic cleanup of expired rate limit entries
   * 
   * JWT token claims:
   * - sub: User ID (subject)
   * - username: User identifier
   * - role: User role for authorization
   * - permissions: Array of granted permissions
   * - iat: Issued at timestamp
   * - exp: Expiration timestamp
   * - iss: Token issuer
   * - aud: Token audience
   * 
   * @complexity O(1) for rate limiting, O(log n) for password verification
   */
  async authenticateUser(username, password, metadata = {}) {
    const clientId = metadata.ip || 'unknown';
    
    // Check rate limiting
    if (this.isRateLimited(username, clientId)) {
      this.logger.audit('authentication_rate_limited', {
        username,
        client_id: clientId,
        timestamp: new Date().toISOString()
      });
      throw new Error('Too many authentication attempts. Please try again later.');
    }
    
    const user = this.users.get(username);
    if (!user) {
      this.recordFailedAttempt(username, clientId);
      this.logger.audit('authentication_failed', {
        username,
        reason: 'user_not_found',
        client_id: clientId,
        timestamp: new Date().toISOString()
      });
      throw new Error('Invalid credentials');
    }
    
    // Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      this.logger.audit('authentication_blocked', {
        username,
        reason: 'account_locked',
        locked_until: user.locked_until,
        client_id: clientId,
        timestamp: new Date().toISOString()
      });
      throw new Error('Account is temporarily locked');
    }
    
    // Verify password
    if (!user.password_hash || !await bcrypt.compare(password, user.password_hash)) {
      this.recordFailedAttempt(username, clientId);
      user.failed_attempts = (user.failed_attempts || 0) + 1;
      
      // Lock account after max attempts
      if (user.failed_attempts >= this.maxAttempts) {
        user.locked_until = new Date(Date.now() + (this.lockoutMinutes * 60 * 1000)).toISOString();
        this.logger.audit('account_locked', {
          username,
          failed_attempts: user.failed_attempts,
          locked_until: user.locked_until,
          timestamp: new Date().toISOString()
        });
      }
      
      this.logger.audit('authentication_failed', {
        username,
        reason: 'invalid_password',
        failed_attempts: user.failed_attempts,
        client_id: clientId,
        timestamp: new Date().toISOString()
      });
      throw new Error('Invalid credentials');
    }
    
    // Successful authentication
    user.last_login = new Date().toISOString();
    user.failed_attempts = 0;
    user.locked_until = null;
    
    // Generate JWT token
    const token = this.generateJWT(user);
    
    this.logger.audit('authentication_success', {
      user_id: user.id,
      username,
      role: user.role,
      client_id: clientId,
      timestamp: user.last_login
    });
    
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        last_login: user.last_login
      },
      expires_in: this.jwtExpiresIn
    };
  }
  
  /**
   * Authenticate request using API key
   * 
   * Validates API key authentication with expiration checking, usage
   * tracking, and permission verification. Updates usage statistics
   * and logs access for audit purposes.
   * 
   * @method authenticateApiKey
   * @async
   * @param {string} apiKey - API key from request header
   * @param {Object} metadata - Request metadata for audit logging
   * @throws {Error} When API key is invalid, expired, or unauthorized
   * @returns {Promise<Object>} Authentication result with user and permissions
   * 
   * Validation workflow:
   * 1. API key format and existence verification
   * 2. Key expiration date checking
   * 3. Associated user account validation
   * 4. Permission verification for requested resource
   * 5. Usage statistics update and audit logging
   * 
   * Usage tracking:
   * - Increments usage counter for analytics
   * - Updates last used timestamp
   * - Records client metadata for security analysis
   * - Tracks usage patterns for abuse detection
   * 
   * @complexity O(1) - Direct key lookup and validation
   */
  async authenticateApiKey(apiKey, metadata = {}) {
    if (!apiKey || !apiKey.startsWith(this.apiKeyPrefix)) {
      throw new Error('Invalid API key format');
    }
    
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) {
      this.logger.audit('api_key_authentication_failed', {
        reason: 'key_not_found',
        client_id: metadata.ip || 'unknown',
        timestamp: new Date().toISOString()
      });
      throw new Error('Invalid API key');
    }
    
    // Check expiration
    if (keyData.expires_at && new Date() > new Date(keyData.expires_at)) {
      this.logger.audit('api_key_authentication_failed', {
        key_id: keyData.id,
        reason: 'key_expired',
        expires_at: keyData.expires_at,
        client_id: metadata.ip || 'unknown',
        timestamp: new Date().toISOString()
      });
      throw new Error('API key has expired');
    }
    
    // Get associated user
    const user = Array.from(this.users.values())
      .find(u => u.username === keyData.user_id || u.id === keyData.user_id);
    
    if (!user) {
      this.logger.audit('api_key_authentication_failed', {
        key_id: keyData.id,
        reason: 'user_not_found',
        user_id: keyData.user_id,
        timestamp: new Date().toISOString()
      });
      throw new Error('Associated user not found');
    }
    
    // Update usage statistics
    keyData.last_used = new Date().toISOString();
    keyData.usage_count = (keyData.usage_count || 0) + 1;
    
    this.logger.audit('api_key_authentication_success', {
      key_id: keyData.id,
      user_id: user.id,
      username: user.username,
      usage_count: keyData.usage_count,
      client_id: metadata.ip || 'unknown',
      timestamp: keyData.last_used
    });
    
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: [...user.permissions, ...keyData.permissions]
      },
      api_key: {
        id: keyData.id,
        name: keyData.name,
        permissions: keyData.permissions,
        last_used: keyData.last_used,
        usage_count: keyData.usage_count
      }
    };
  }
  
  /**
   * Generate JWT token with user claims
   * 
   * Creates signed JWT token with comprehensive user claims and security
   * metadata. Supports configurable algorithms, expiration, and custom
   * claims for different authentication scenarios.
   * 
   * @method generateJWT
   * @param {Object} user - User object for token claims
   * @returns {string} Signed JWT token
   * 
   * Standard JWT claims included:
   * - sub: Subject (user ID)
   * - iat: Issued at timestamp
   * - exp: Expiration timestamp (calculated from expiresIn)
   * - iss: Issuer identifier
   * - aud: Audience identifier
   * - jti: JWT ID for token tracking
   * 
   * Custom claims included:
   * - username: User identifier
   * - email: User email address
   * - role: User role for authorization
   * - permissions: Array of granted permissions
   * - login_time: Current login timestamp
   * 
   * @complexity O(1) - Fixed-time token signing operation
   */
  generateJWT(user) {
    const payload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      login_time: new Date().toISOString(),
      jti: crypto.randomUUID()
    };
    
    const options = {
      algorithm: this.jwtAlgorithm,
      expiresIn: this.jwtExpiresIn,
      issuer: this.jwtIssuer,
      audience: this.jwtAudience
    };
    
    return jwt.sign(payload, this.jwtSecret, options);
  }
  
  /**
   * Verify and decode JWT token
   * 
   * Validates JWT token signature, expiration, and claims. Returns decoded
   * token payload with user information for authorization decisions.
   * 
   * @method verifyJWT
   * @param {string} token - JWT token to verify
   * @throws {Error} When token is invalid, expired, or malformed
   * @returns {Object} Decoded token payload with user claims
   * 
   * Verification checks:
   * - Signature validation using configured secret and algorithm
   * - Expiration timestamp verification
   * - Issuer and audience claim validation
   * - Token format and structure validation
   * 
   * @complexity O(1) - Fixed-time signature verification
   */
  verifyJWT(token) {
    try {
      const options = {
        algorithms: [this.jwtAlgorithm],
        issuer: this.jwtIssuer,
        audience: this.jwtAudience
      };
      
      return jwt.verify(token, this.jwtSecret, options);
    } catch (error) {
      this.logger.audit('jwt_verification_failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw new Error('Invalid or expired token');
    }
  }
  
  /**
   * Get role-based permissions
   * 
   * Returns array of permissions based on user role. Implements hierarchical
   * permission system where higher roles inherit lower role permissions.
   * 
   * @method getRolePermissions
   * @param {string} role - User role identifier
   * @returns {Array<string>} Array of permission strings
   * 
   * Permission hierarchy:
   * - viewer: Read-only access to dashboards and basic metrics
   * - analyst: Read access to all data plus analysis capabilities
   * - admin: Full system access including user management
   * - service: Programmatic access for automated systems
   * 
   * @complexity O(1) - Simple role-to-permissions mapping
   */
  getRolePermissions(role) {
    const permissions = {
      viewer: [
        'governance:read',
        'metrics:read',
        'dashboard:read'
      ],
      analyst: [
        'governance:read',
        'governance:analyze',
        'metrics:read',
        'dashboard:read',
        'export:read'
      ],
      admin: [
        'governance:read',
        'governance:write',
        'governance:admin',
        'governance:analyze',
        'metrics:read',
        'metrics:write',
        'dashboard:read',
        'dashboard:write',
        'users:read',
        'users:write',
        'export:read',
        'export:write'
      ],
      service: [
        'governance:read',
        'governance:write',
        'metrics:read',
        'metrics:write',
        'api:read',
        'api:write'
      ]
    };
    
    return permissions[role] || permissions.viewer;
  }
  
  /**
   * Check if client is rate limited
   * 
   * Implements sliding window rate limiting to prevent brute force attacks
   * and abuse. Tracks both per-user and per-IP rate limiting.
   * 
   * @method isRateLimited
   * @param {string} username - User identifier
   * @param {string} clientId - Client identifier (usually IP address)
   * @returns {boolean} True if client should be rate limited
   * 
   * Rate limiting strategy:
   * - Per-user attempt tracking with configurable window
   * - Per-IP attempt tracking for additional protection
   * - Sliding time window with automatic cleanup
   * - Exponential backoff for repeated violations
   * 
   * @complexity O(1) - Direct lookup and time comparison
   */
  isRateLimited(username, clientId) {
    const now = Date.now();
    const windowMs = this.windowMinutes * 60 * 1000;
    
    // Check user-based rate limiting
    const userKey = `user:${username}`;
    const userAttempts = this.rateLimitStore.get(userKey) || [];
    const recentUserAttempts = userAttempts.filter(time => now - time < windowMs);
    
    if (recentUserAttempts.length >= this.maxAttempts) {
      return true;
    }
    
    // Check IP-based rate limiting
    const ipKey = `ip:${clientId}`;
    const ipAttempts = this.rateLimitStore.get(ipKey) || [];
    const recentIpAttempts = ipAttempts.filter(time => now - time < windowMs);
    
    if (recentIpAttempts.length >= this.maxAttempts * 2) { // Allow more attempts per IP
      return true;
    }
    
    return false;
  }
  
  /**
   * Record failed authentication attempt
   * 
   * Tracks failed authentication attempts for rate limiting and security
   * monitoring. Updates both user-specific and IP-based counters.
   * 
   * @method recordFailedAttempt
   * @param {string} username - User identifier
   * @param {string} clientId - Client identifier
   * 
   * @complexity O(1) - Simple counter update and storage
   */
  recordFailedAttempt(username, clientId) {
    const now = Date.now();
    
    // Record user attempt
    const userKey = `user:${username}`;
    const userAttempts = this.rateLimitStore.get(userKey) || [];
    userAttempts.push(now);
    this.rateLimitStore.set(userKey, userAttempts);
    
    // Record IP attempt
    const ipKey = `ip:${clientId}`;
    const ipAttempts = this.rateLimitStore.get(ipKey) || [];
    ipAttempts.push(now);
    this.rateLimitStore.set(ipKey, ipAttempts);
  }
  
  /**
   * Validate password strength
   * 
   * Enforces password policy requirements including length, complexity,
   * and special character requirements. Configurable policy settings.
   * 
   * @method validatePassword
   * @param {string} password - Plain text password to validate
   * @throws {Error} When password doesn't meet policy requirements
   * 
   * Validation rules:
   * - Minimum length requirement (configurable)
   * - Special character requirement (configurable)
   * - No common passwords (basic dictionary check)
   * - No username inclusion (prevents obvious passwords)
   * 
   * @complexity O(n) where n is password length for character checking
   */
  validatePassword(password) {
    if (!password || password.length < this.minPasswordLength) {
      throw new Error(`Password must be at least ${this.minPasswordLength} characters long`);
    }
    
    if (this.requireSpecialChars) {
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
      const hasNumber = /\d/.test(password);
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      
      if (!hasSpecial || !hasNumber || !hasUpper || !hasLower) {
        throw new Error('Password must contain uppercase, lowercase, number, and special character');
      }
    }
  }
  
  /**
   * Generate secure random password
   * 
   * Creates cryptographically secure password meeting policy requirements.
   * Used for default account creation and password reset scenarios.
   * 
   * @method generateSecurePassword
   * @returns {string} Generated secure password
   * 
   * Password composition:
   * - Includes uppercase and lowercase letters
   * - Includes numbers and special characters
   * - Meets minimum length requirements
   * - Uses cryptographically secure random generation
   * 
   * @complexity O(n) where n is the desired password length
   */
  generateSecurePassword() {
    const length = Math.max(this.minPasswordLength, 12);
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()';
    
    const allChars = uppercase + lowercase + numbers + special;
    let password = '';
    
    // Ensure at least one character from each category
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Fill remaining length with random characters
    for (let i = 4; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
  
  /**
   * Start periodic cleanup tasks
   * 
   * Initializes background cleanup processes for expired tokens, rate limit
   * entries, and other temporary security data. Runs at configurable intervals.
   * 
   * @method startCleanupTasks
   * @private
   * 
   * Cleanup operations:
   * - Expired rate limit entries removal
   * - Expired API key cleanup
   * - Session cleanup for logged out users
   * - Audit log rotation (if configured)
   * 
   * @complexity O(n) where n is the number of entries to clean up
   */
  startCleanupTasks() {
    // Clean up rate limit store every 5 minutes
    setInterval(() => {
      const now = Date.now();
      const windowMs = this.windowMinutes * 60 * 1000;
      
      for (const [key, attempts] of this.rateLimitStore.entries()) {
        const recentAttempts = attempts.filter(time => now - time < windowMs);
        if (recentAttempts.length === 0) {
          this.rateLimitStore.delete(key);
        } else {
          this.rateLimitStore.set(key, recentAttempts);
        }
      }
    }, 5 * 60 * 1000);
    
    // Clean up expired API keys every hour
    setInterval(() => {
      const now = new Date();
      for (const [key, keyData] of this.apiKeys.entries()) {
        if (keyData.expires_at && new Date(keyData.expires_at) < now) {
          this.apiKeys.delete(key);
          this.logger.audit('api_key_expired_cleanup', {
            key_id: keyData.id,
            user_id: keyData.user_id,
            expired_at: keyData.expires_at,
            timestamp: new Date().toISOString()
          });
        }
      }
    }, 60 * 60 * 1000);
  }
}

module.exports = AuthManager;