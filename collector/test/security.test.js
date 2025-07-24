/**
 * Security System Tests
 * Tests for authentication, authorization, and security features
 */

const AuthManager = require('../src/security/auth-manager');
const createAuthMiddleware = require('../src/security/auth-middleware');

// Mock logger for tests
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  audit: jest.fn()
};

describe('AuthManager', () => {
  let authManager;
  
  const testConfig = {
    jwt: {
      secret: 'test-jwt-secret-for-testing-only',
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: 'test-issuer',
      audience: 'test-audience'
    },
    password: {
      salt_rounds: 4, // Lower for faster tests
      min_length: 8,
      require_special: true
    },
    api_keys: {
      length: 16,
      prefix: 'TEST-',
      expiration_days: 30
    },
    rate_limiting: {
      max_attempts: 3,
      window_minutes: 1,
      lockout_minutes: 2
    }
  };

  beforeEach(() => {
    authManager = new AuthManager(testConfig, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('User Management', () => {
    test('should create user with valid data', async () => {
      const userData = {
        username: 'testuser',
        password: 'TestPass123!',
        email: 'test@example.com',
        role: 'viewer',
        created_by: 'system'
      };

      const user = await authManager.createUser(userData);

      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('viewer');
      expect(user.password_hash).toBeUndefined(); // Should not be returned
      expect(user.id).toBeDefined();
    });

    test('should reject user creation with weak password', async () => {
      const userData = {
        username: 'testuser',
        password: 'weak',
        email: 'test@example.com',
        role: 'viewer'
      };

      await expect(authManager.createUser(userData)).rejects.toThrow();
    });

    test('should reject duplicate username', async () => {
      const userData = {
        username: 'testuser',
        password: 'TestPass123!',
        email: 'test@example.com',
        role: 'viewer'
      };

      await authManager.createUser(userData);
      await expect(authManager.createUser(userData)).rejects.toThrow('Username already exists');
    });

    test('should reject invalid role', async () => {
      const userData = {
        username: 'testuser',
        password: 'TestPass123!',
        email: 'test@example.com',
        role: 'invalid_role'
      };

      await expect(authManager.createUser(userData)).rejects.toThrow('Invalid role');
    });
  });

  describe('Authentication', () => {
    beforeEach(async () => {
      // Create test user
      await authManager.createUser({
        username: 'testuser',
        password: 'TestPass123!',
        email: 'test@example.com',
        role: 'analyst',
        created_by: 'system'
      });
    });

    test('should authenticate user with correct credentials', async () => {
      const result = await authManager.authenticateUser(
        'testuser',
        'TestPass123!',
        { ip: '127.0.0.1' }
      );

      expect(result).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('testuser');
      expect(result.user.role).toBe('analyst');
      expect(result.expires_in).toBe('1h');
    });

    test('should reject authentication with wrong password', async () => {
      await expect(
        authManager.authenticateUser('testuser', 'wrongpassword', { ip: '127.0.0.1' })
      ).rejects.toThrow('Invalid credentials');
    });

    test('should reject authentication with non-existent user', async () => {
      await expect(
        authManager.authenticateUser('nonexistent', 'password', { ip: '127.0.0.1' })
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('JWT Tokens', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await authManager.createUser({
        username: 'testuser',
        password: 'TestPass123!',
        email: 'test@example.com',
        role: 'admin',
        created_by: 'system'
      });
    });

    test('should generate valid JWT token', () => {
      const token = authManager.generateJWT(testUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should verify valid JWT token', () => {
      const token = authManager.generateJWT(testUser);
      const decoded = authManager.verifyJWT(token);

      expect(decoded).toBeDefined();
      expect(decoded.sub).toBe(testUser.id);
      expect(decoded.username).toBe(testUser.username);
      expect(decoded.role).toBe(testUser.role);
      expect(decoded.iss).toBe('test-issuer');
      expect(decoded.aud).toBe('test-audience');
    });

    test('should reject invalid JWT token', () => {
      expect(() => {
        authManager.verifyJWT('invalid-token');
      }).toThrow('Invalid or expired token');
    });

    test('should reject tampered JWT token', () => {
      const token = authManager.generateJWT(testUser);
      const tamperedToken = token.slice(0, -10) + 'tampered123';

      expect(() => {
        authManager.verifyJWT(tamperedToken);
      }).toThrow('Invalid or expired token');
    });
  });

  describe('API Keys', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await authManager.createUser({
        username: 'service',
        password: null,
        email: 'service@example.com',
        role: 'service',
        created_by: 'system'
      });
    });

    test('should create API key', async () => {
      const keyData = await authManager.createApiKey({
        user_id: 'service',
        name: 'Test Key',
        permissions: ['governance:read', 'metrics:read']
      });

      expect(keyData).toBeDefined();
      expect(keyData.key).toMatch(/^TEST-.+/);
      expect(keyData.user_id).toBe('service');
      expect(keyData.name).toBe('Test Key');
      expect(keyData.permissions).toContain('governance:read');
      expect(keyData.permissions).toContain('metrics:read');
    });

    test('should authenticate with valid API key', async () => {
      const keyData = await authManager.createApiKey({
        user_id: 'service',
        name: 'Test Key',
        permissions: ['governance:read']
      });

      const result = await authManager.authenticateApiKey(
        keyData.key,
        { ip: '127.0.0.1' }
      );

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe('service');
      expect(result.api_key).toBeDefined();
      expect(result.api_key.name).toBe('Test Key');
    });

    test('should reject invalid API key', async () => {
      await expect(
        authManager.authenticateApiKey('TEST-invalid-key', { ip: '127.0.0.1' })
      ).rejects.toThrow('Invalid API key');
    });

    test('should generate API key with correct format', () => {
      const key = authManager.generateApiKey();
      expect(key).toMatch(/^TEST-.+/);
      expect(key.length).toBeGreaterThan(20);
    });
  });

  describe('Role Permissions', () => {
    test('should return correct permissions for viewer role', () => {
      const permissions = authManager.getRolePermissions('viewer');
      expect(permissions).toContain('governance:read');
      expect(permissions).toContain('metrics:read');
      expect(permissions).toContain('dashboard:read');
      expect(permissions).not.toContain('governance:write');
    });

    test('should return correct permissions for admin role', () => {
      const permissions = authManager.getRolePermissions('admin');
      expect(permissions).toContain('governance:read');
      expect(permissions).toContain('governance:write');
      expect(permissions).toContain('governance:admin');
      expect(permissions).toContain('users:read');
      expect(permissions).toContain('users:write');
    });

    test('should return viewer permissions for unknown role', () => {
      const permissions = authManager.getRolePermissions('unknown');
      expect(permissions).toEqual(authManager.getRolePermissions('viewer'));
    });
  });

  describe('Rate Limiting', () => {
    test('should track failed attempts', () => {
      const username = 'testuser';
      const clientId = '127.0.0.1';

      // Initially not rate limited
      expect(authManager.isRateLimited(username, clientId)).toBe(false);

      // Record failed attempts
      for (let i = 0; i < 3; i++) {
        authManager.recordFailedAttempt(username, clientId);
      }

      // Should be rate limited after max attempts
      expect(authManager.isRateLimited(username, clientId)).toBe(true);
    });
  });

  describe('Password Validation', () => {
    test('should accept strong password', () => {
      expect(() => {
        authManager.validatePassword('StrongPass123!');
      }).not.toThrow();
    });

    test('should reject short password', () => {
      expect(() => {
        authManager.validatePassword('Short1!');
      }).toThrow('Password must be at least');
    });

    test('should reject password without special characters', () => {
      expect(() => {
        authManager.validatePassword('NoSpecialChars123');
      }).toThrow('Password must contain');
    });

    test('should reject password without numbers', () => {
      expect(() => {
        authManager.validatePassword('NoNumbers!');
      }).toThrow('Password must contain');
    });
  });

  describe('Secure Password Generation', () => {
    test('should generate password meeting policy requirements', () => {
      const password = authManager.generateSecurePassword();
      
      expect(password.length).toBeGreaterThanOrEqual(8);
      expect(/[A-Z]/.test(password)).toBe(true); // Has uppercase
      expect(/[a-z]/.test(password)).toBe(true); // Has lowercase
      expect(/\d/.test(password)).toBe(true); // Has number
      expect(/[!@#$%^&*()]/.test(password)).toBe(true); // Has special char
    });

    test('should generate different passwords each time', () => {
      const password1 = authManager.generateSecurePassword();
      const password2 = authManager.generateSecurePassword();
      
      expect(password1).not.toBe(password2);
    });
  });
});

describe('Authentication Middleware', () => {
  let authManager;
  let authMiddleware;
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    authManager = new AuthManager({
      jwt: {
        secret: 'test-secret',
        algorithm: 'HS256',
        expiresIn: '1h'
      },
      password: { salt_rounds: 4 },
      api_keys: { prefix: 'TEST-' },
      rate_limiting: { max_attempts: 3 }
    }, mockLogger);

    authMiddleware = createAuthMiddleware(authManager, mockLogger);

    mockReq = {
      headers: {},
      ip: '127.0.0.1',
      path: '/test',
      method: 'GET'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requireRole middleware', () => {
    test('should allow user with correct role', () => {
      mockReq.user = { id: '1', username: 'admin', role: 'admin' };
      
      const middleware = authMiddleware.requireRole('admin');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should deny user with insufficient role', () => {
      mockReq.user = { id: '1', username: 'viewer', role: 'viewer' };
      
      const middleware = authMiddleware.requireRole('admin');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Insufficient role privileges',
          code: 'INSUFFICIENT_ROLE'
        })
      );
    });

    test('should deny unauthenticated user', () => {
      const middleware = authMiddleware.requireRole('viewer');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe('requirePermission middleware', () => {
    test('should allow user with required permission', () => {
      mockReq.user = { id: '1', username: 'analyst', role: 'analyst' };
      mockReq.permissions = ['governance:read', 'metrics:read'];
      
      const middleware = authMiddleware.requirePermission('governance:read');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should deny user without required permission', () => {
      mockReq.user = { id: '1', username: 'viewer', role: 'viewer' };
      mockReq.permissions = ['governance:read'];
      
      const middleware = authMiddleware.requirePermission('governance:write');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS'
        })
      );
    });

    test('should support AND logic for multiple permissions', () => {
      mockReq.user = { id: '1', username: 'admin', role: 'admin' };
      mockReq.permissions = ['governance:read', 'governance:write'];
      
      const middleware = authMiddleware.requirePermission(
        ['governance:read', 'governance:write'], 
        'AND'
      );
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should support OR logic for multiple permissions', () => {
      mockReq.user = { id: '1', username: 'analyst', role: 'analyst' };
      mockReq.permissions = ['governance:read'];
      
      const middleware = authMiddleware.requirePermission(
        ['governance:read', 'governance:write'], 
        'OR'
      );
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('rate limiter middleware', () => {
    test('should allow requests under limit', () => {
      const middleware = authMiddleware.rateLimiter({ max: 5, windowMs: 60000 });
      
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': '4'
        })
      );
    });

    test('should block requests over limit', () => {
      const middleware = authMiddleware.rateLimiter({ max: 1, windowMs: 60000 });
      
      // First request should pass
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      
      // Reset mocks
      mockNext.mockClear();
      mockRes.status.mockClear();
      
      // Second request should be blocked
      middleware(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED'
        })
      );
    });

    test('should skip rate limiting when configured', () => {
      const middleware = authMiddleware.rateLimiter({ 
        max: 1, 
        windowMs: 60000,
        skip: () => true 
      });
      
      // Both requests should pass due to skip function
      middleware(mockReq, mockRes, mockNext);
      middleware(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalledTimes(2);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});

// Integration test
describe('Authentication Integration', () => {
  let authManager;
  let testUser;

  beforeEach(async () => {
    authManager = new AuthManager({
      jwt: { secret: 'integration-test-secret', expiresIn: '1h' },
      password: { salt_rounds: 4 },
      api_keys: { prefix: 'INT-' },
      rate_limiting: { max_attempts: 3 }
    }, mockLogger);

    testUser = await authManager.createUser({
      username: 'integration',
      password: 'IntegrationTest123!',
      email: 'integration@test.com',
      role: 'analyst',
      created_by: 'test'
    });
  });

  test('complete authentication flow', async () => {
    // 1. Authenticate user
    const authResult = await authManager.authenticateUser(
      'integration',
      'IntegrationTest123!',
      { ip: '127.0.0.1' }
    );
    
    expect(authResult.token).toBeDefined();
    expect(authResult.user.username).toBe('integration');

    // 2. Verify JWT token
    const decoded = authManager.verifyJWT(authResult.token);
    expect(decoded.username).toBe('integration');
    expect(decoded.role).toBe('analyst');

    // 3. Create API key for user
    const apiKey = await authManager.createApiKey({
      user_id: 'integration',
      name: 'Integration Test Key',
      permissions: ['governance:read']
    });
    
    expect(apiKey.key).toMatch(/^INT-.+/);

    // 4. Authenticate with API key
    const apiAuthResult = await authManager.authenticateApiKey(
      apiKey.key,
      { ip: '127.0.0.1' }
    );
    
    expect(apiAuthResult.user.username).toBe('integration');
    expect(apiAuthResult.api_key.name).toBe('Integration Test Key');
  });
});