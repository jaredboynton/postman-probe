/**
 * Authentication Middleware - Express.js Security Middleware System
 * 
 * Comprehensive Express middleware for authentication, authorization, and
 * security policy enforcement. Supports multiple authentication methods,
 * role-based access control, and detailed security audit logging.
 */

/**
 * Create authentication middleware for Express routes
 * 
 * Factory function that creates Express middleware for authentication and
 * authorization. Supports multiple auth methods, permission checking, and
 * comprehensive security logging.
 * 
 * @function createAuthMiddleware
 * @param {AuthManager} authManager - Authentication manager instance
 * @param {Logger} logger - Structured logger for security events
 * @returns {Object} Object containing various authentication middleware functions
 * 
 * Middleware functions provided:
 * - authenticate: General authentication with multiple methods
 * - requireRole: Role-based authorization
 * - requirePermission: Permission-based authorization
 * - apiKeyAuth: API key specific authentication
 * - jwtAuth: JWT token specific authentication
 * - rateLimiter: Request rate limiting
 * 
 * Security features:
 * - Multiple authentication method support
 * - Comprehensive request logging and audit trails
 * - Role and permission-based authorization
 * - Rate limiting and abuse prevention
 * - Security header enforcement
 * 
 * @complexity O(1) - Middleware factory with fixed-time operations
 */
function createAuthMiddleware(authManager, logger) {
  
  /**
   * General authentication middleware with multiple auth method support
   * 
   * Express middleware that supports multiple authentication methods including
   * JWT tokens, API keys, and basic authentication. Automatically detects
   * authentication method from request headers and validates accordingly.
   * 
   * @function authenticate
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object  
   * @param {Function} next - Express next middleware function
   * 
   * Authentication method detection:
   * - Bearer token: JWT authentication via Authorization header
   * - API key: Custom API key via X-API-Key header
   * - Basic auth: Username/password via Authorization header
   * - Session: Session-based authentication (future enhancement)
   * 
   * Request enrichment:
   * - req.user: Authenticated user object
   * - req.auth: Authentication metadata (method, timestamp)
   * - req.permissions: User permissions array
   * 
   * Error responses:
   * - 401: Authentication required or failed
   * - 403: Authenticated but insufficient permissions
   * - 429: Rate limited due to abuse
   * 
   * @complexity O(1) - Fixed-time authentication checks
   */
  const authenticate = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'];
      const clientMetadata = {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString()
      };
      
      let authResult = null;
      let authMethod = 'none';
      
      // Try API key authentication first
      if (apiKey) {
        try {
          authResult = await authManager.authenticateApiKey(apiKey, clientMetadata);
          authMethod = 'api_key';
        } catch (error) {
          logger.warn('API key authentication failed', {
            error: error.message,
            client_ip: clientMetadata.ip,
            path: req.path
          });
          return res.status(401).json({
            error: 'Invalid API key',
            code: 'INVALID_API_KEY',
            timestamp: new Date().toISOString()
          });
        }
      }
      // Try JWT authentication
      else if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const decoded = authManager.verifyJWT(token);
          
          // Get user from decoded token
          const user = {
            id: decoded.sub,
            username: decoded.username,
            email: decoded.email,
            role: decoded.role,
            permissions: decoded.permissions || []
          };
          
          authResult = {
            user,
            token: { jti: decoded.jti, iat: decoded.iat, exp: decoded.exp }
          };
          authMethod = 'jwt';
        } catch (error) {
          logger.warn('JWT authentication failed', {
            error: error.message,
            client_ip: clientMetadata.ip,
            path: req.path
          });
          return res.status(401).json({
            error: 'Invalid or expired token',
            code: 'INVALID_TOKEN',
            timestamp: new Date().toISOString()
          });
        }
      }
      // Try basic authentication (for development/testing)
      else if (authHeader && authHeader.startsWith('Basic ')) {
        try {
          const credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
          const [username, password] = credentials.split(':');
          
          authResult = await authManager.authenticateUser(username, password, clientMetadata);
          authMethod = 'basic';
        } catch (error) {
          logger.warn('Basic authentication failed', {
            error: error.message,
            client_ip: clientMetadata.ip,
            path: req.path
          });
          return res.status(401).json({
            error: 'Invalid credentials',
            code: 'INVALID_CREDENTIALS',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // No authentication provided
      if (!authResult) {
        logger.audit('authentication_required', {
          path: req.path,
          method: req.method,
          client_ip: clientMetadata.ip,
          timestamp: clientMetadata.timestamp
        });
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString(),
          methods: ['Bearer token', 'API key', 'Basic auth']
        });
      }
      
      // Set request context
      req.user = authResult.user;
      req.auth = {
        method: authMethod,
        timestamp: clientMetadata.timestamp,
        metadata: authResult.token || authResult.api_key
      };
      req.permissions = authResult.user.permissions || [];
      
      // Log successful authentication
      logger.debug('Authentication successful', {
        user_id: authResult.user.id,
        username: authResult.user.username,
        method: authMethod,
        path: req.path,
        client_ip: clientMetadata.ip
      });
      
      next();
      
    } catch (error) {
      logger.error('Authentication middleware error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      });
      return res.status(500).json({
        error: 'Authentication system error',
        code: 'AUTH_SYSTEM_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  };
  
  /**
   * Role-based authorization middleware
   * 
   * Express middleware that enforces role-based access control. Checks if
   * authenticated user has required role or higher in the role hierarchy.
   * 
   * @function requireRole
   * @param {string|Array<string>} requiredRoles - Required role(s) for access
   * @returns {Function} Express middleware function
   * 
   * Role hierarchy (higher roles inherit lower role permissions):
   * 1. viewer: Basic read-only access
   * 2. analyst: Data analysis capabilities
   * 3. admin: Full administrative access
   * 4. service: Programmatic access (parallel to admin)
   * 
   * Usage examples:
   * - requireRole('admin'): Only admin users
   * - requireRole(['admin', 'analyst']): Admin or analyst users
   * - requireRole('viewer'): Any authenticated user (all roles include viewer)
   * 
   * @complexity O(1) - Simple role comparison and hierarchy check
   */
  const requireRole = (requiredRoles) => {
    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString()
        });
      }
      
      const userRole = req.user.role;
      const roleHierarchy = {
        viewer: 1,
        analyst: 2,
        admin: 3,
        service: 3  // Service accounts have admin-level access
      };
      
      const userLevel = roleHierarchy[userRole] || 0;
      const requiredLevel = Math.min(...roles.map(role => roleHierarchy[role] || 999));
      
      if (userLevel < requiredLevel && !roles.includes(userRole)) {
        logger.audit('authorization_denied', {
          user_id: req.user.id,
          username: req.user.username,
          user_role: userRole,
          required_roles: roles,
          path: req.path,
          method: req.method,
          client_ip: req.ip,
          timestamp: new Date().toISOString()
        });
        
        return res.status(403).json({
          error: 'Insufficient role privileges',
          code: 'INSUFFICIENT_ROLE',
          required_roles: roles,
          user_role: userRole,
          timestamp: new Date().toISOString()
        });
      }
      
      next();
    };
  };
  
  /**
   * Permission-based authorization middleware
   * 
   * Express middleware that enforces fine-grained permission-based access
   * control. Checks if authenticated user has specific permissions required
   * for the requested operation.
   * 
   * @function requirePermission
   * @param {string|Array<string>} requiredPermissions - Required permission(s)
   * @param {string} [logic='OR'] - Logic for multiple permissions ('AND' or 'OR')
   * @returns {Function} Express middleware function
   * 
   * Permission examples:
   * - 'governance:read': Read access to governance data
   * - 'governance:write': Write access to governance data
   * - 'metrics:admin': Administrative access to metrics
   * - 'users:manage': User management capabilities
   * 
   * Logic options:
   * - 'OR': User needs ANY of the required permissions (default)
   * - 'AND': User needs ALL of the required permissions
   * 
   * Usage examples:
   * - requirePermission('governance:read'): Single permission
   * - requirePermission(['governance:read', 'metrics:read']): Any permission
   * - requirePermission(['governance:read', 'governance:write'], 'AND'): All permissions
   * 
   * @complexity O(n*m) where n=user permissions, m=required permissions
   */
  const requirePermission = (requiredPermissions, logic = 'OR') => {
    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString()
        });
      }
      
      const userPermissions = req.permissions || [];
      let hasAccess = false;
      
      if (logic === 'AND') {
        // User must have ALL required permissions
        hasAccess = permissions.every(permission => userPermissions.includes(permission));
      } else {
        // User must have ANY required permission (OR logic)
        hasAccess = permissions.some(permission => userPermissions.includes(permission));
      }
      
      if (!hasAccess) {
        logger.audit('authorization_denied', {
          user_id: req.user.id,
          username: req.user.username,
          user_permissions: userPermissions,
          required_permissions: permissions,
          logic: logic,
          path: req.path,
          method: req.method,
          client_ip: req.ip,
          timestamp: new Date().toISOString()
        });
        
        return res.status(403).json({
          error: `Insufficient permissions`,
          code: 'INSUFFICIENT_PERMISSIONS',
          required_permissions: permissions,
          logic: logic,
          timestamp: new Date().toISOString()
        });
      }
      
      next();
    };
  };
  
  /**
   * API key specific authentication middleware
   * 
   * Express middleware that specifically requires API key authentication.
   * Useful for API endpoints that should only accept API key auth and
   * reject other authentication methods.
   * 
   * @function apiKeyAuth
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   * 
   * Features:
   * - Enforces API key authentication only
   * - Provides detailed API key usage statistics
   * - Tracks API key access patterns
   * - Supports API key rotation workflows
   * 
   * @complexity O(1) - Direct API key validation
   */
  const apiKeyAuth = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        code: 'API_KEY_REQUIRED',
        timestamp: new Date().toISOString()
      });
    }
    
    const clientMetadata = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    };
    
    try {
      const authResult = await authManager.authenticateApiKey(apiKey, clientMetadata);
      
      req.user = authResult.user;
      req.auth = {
        method: 'api_key',
        timestamp: clientMetadata.timestamp,
        metadata: authResult.api_key
      };
      req.permissions = authResult.user.permissions;
      
      next();
      
    } catch (error) {
      logger.warn('API key authentication failed', {
        error: error.message,
        client_ip: clientMetadata.ip,
        path: req.path
      });
      
      return res.status(401).json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
        timestamp: new Date().toISOString()
      });
    }
  };
  
  /**
   * JWT token specific authentication middleware
   * 
   * Express middleware that specifically requires JWT token authentication.
   * Useful for web application endpoints that should only accept JWT tokens
   * and reject other authentication methods.
   * 
   * @function jwtAuth
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   * 
   * Features:
   * - Enforces JWT token authentication only
   * - Provides token expiration warnings
   * - Supports token refresh workflows
   * - Validates token claims and metadata
   * 
   * @complexity O(1) - Direct JWT validation
   */
  const jwtAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Bearer token required',
        code: 'BEARER_TOKEN_REQUIRED',
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      const token = authHeader.substring(7);
      const decoded = authManager.verifyJWT(token);
      
      const user = {
        id: decoded.sub,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions || []
      };
      
      req.user = user;
      req.auth = {
        method: 'jwt',
        timestamp: new Date().toISOString(),
        metadata: { 
          jti: decoded.jti, 
          iat: decoded.iat, 
          exp: decoded.exp,
          expires_at: new Date(decoded.exp * 1000).toISOString()
        }
      };
      req.permissions = user.permissions;
      
      // Check if token expires soon (within 1 hour)
      const expiresIn = (decoded.exp * 1000) - Date.now();
      if (expiresIn < 60 * 60 * 1000) {
        res.set('X-Token-Expires-Soon', 'true');
        res.set('X-Token-Expires-In', Math.floor(expiresIn / 1000).toString());
      }
      
      next();
      
    } catch (error) {
      logger.warn('JWT authentication failed', {
        error: error.message,
        client_ip: req.ip,
        path: req.path
      });
      
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
        timestamp: new Date().toISOString()
      });
    }
  };
  
  /**
   * Request rate limiting middleware
   * 
   * Express middleware that implements rate limiting based on client IP,
   * user identity, or custom keys. Prevents abuse and protects against
   * brute force attacks.
   * 
   * @function rateLimiter
   * @param {Object} options - Rate limiting configuration
   * @returns {Function} Express middleware function
   * 
   * Options:
   * - windowMs: Time window in milliseconds (default: 15 minutes)
   * - max: Maximum requests per window (default: 100)
   * - keyGenerator: Function to generate rate limit key
   * - skip: Function to skip rate limiting for certain requests
   * - onLimitReached: Callback when limit is reached
   * 
   * @complexity O(1) - Direct rate limit counter access
   */
  const rateLimiter = (options = {}) => {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100,
      keyGenerator = (req) => req.ip,
      skip = () => false,
      onLimitReached = null
    } = options;
    
    const store = new Map();
    
    // Cleanup expired entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of store.entries()) {
        if (now - data.windowStart > windowMs) {
          store.delete(key);
        }
      }
    }, 5 * 60 * 1000);
    
    return (req, res, next) => {
      if (skip(req)) {
        return next();
      }
      
      const key = keyGenerator(req);
      const now = Date.now();
      
      let data = store.get(key);
      if (!data || now - data.windowStart > windowMs) {
        data = {
          count: 0,
          windowStart: now
        };
      }
      
      data.count++;
      store.set(key, data);
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': max.toString(),
        'X-RateLimit-Remaining': Math.max(0, max - data.count).toString(),
        'X-RateLimit-Reset': new Date(data.windowStart + windowMs).toISOString(),
        'X-RateLimit-Window': windowMs.toString()
      });
      
      if (data.count > max) {
        logger.warn('Rate limit exceeded', {
          key,
          count: data.count,
          limit: max,
          path: req.path,
          method: req.method,
          user_id: req.user?.id,
          timestamp: new Date().toISOString()
        });
        
        if (onLimitReached) {
          onLimitReached(req, res);
        }
        
        return res.status(429).json({
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          limit: max,
          window_ms: windowMs,
          retry_after: data.windowStart + windowMs,
          timestamp: new Date().toISOString()
        });
      }
      
      next();
    };
  };
  
  /**
   * Security headers middleware
   * 
   * Express middleware that adds security headers to all responses.
   * Implements security best practices and prevents common attacks.
   * 
   * @function securityHeaders
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   * 
   * Headers added:
   * - X-Content-Type-Options: Prevent MIME type sniffing
   * - X-Frame-Options: Prevent clickjacking
   * - X-XSS-Protection: Enable XSS filtering
   * - Strict-Transport-Security: Enforce HTTPS
   * - Content-Security-Policy: Control resource loading
   * - Referrer-Policy: Control referrer information
   * 
   * @complexity O(1) - Fixed header setting operations
   */
  const securityHeaders = (req, res, next) => {
    // Prevent MIME type sniffing
    res.set('X-Content-Type-Options', 'nosniff');
    
    // Prevent clickjacking
    res.set('X-Frame-Options', 'DENY');
    
    // Enable XSS filtering
    res.set('X-XSS-Protection', '1; mode=block');
    
    // Enforce HTTPS (in production)
    if (process.env.NODE_ENV === 'production') {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    // Content Security Policy
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
    
    // Control referrer information
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Remove server information
    res.removeHeader('X-Powered-By');
    
    next();
  };
  
  return {
    authenticate,
    requireRole,
    requirePermission,
    apiKeyAuth,
    jwtAuth,
    rateLimiter,
    securityHeaders
  };
}

module.exports = createAuthMiddleware;