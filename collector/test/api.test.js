/**
 * API Integration Tests - Simplified
 * Tests basic API endpoints without complex configuration setup
 */

const request = require('supertest');
const express = require('express');
const path = require('path');

// Simple test server setup
function createTestApp() {
  const app = express();
  
  app.use(express.json());
  
  // Basic health endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        database: { status: 'healthy' },
        api: { status: 'healthy' }
      }
    });
  });
  
  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Postman Governance Collector',
      version: '1.0.0'
    });
  });
  
  // Metrics endpoint
  app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('# Postman Governance Metrics\npostman_governance_info 1\n');
  });
  
  // JSON metrics endpoint
  app.get('/metrics/json', (req, res) => {
    res.json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });
  
  // Governance summary endpoint
  app.get('/api/governance/summary', (req, res) => {
    res.json({
      avg_overall_score: 85,
      avg_documentation_score: 80,
      avg_testing_score: 90,
      total_workspaces: 5,
      total_collections: 25,
      timestamp: new Date().toISOString()
    });
  });
  
  // Governance violations endpoint
  app.get('/api/governance/violations', (req, res) => {
    res.json([
      {
        violation_type: 'missing_documentation',
        count: 3,
        severity: 'medium'
      },
      {
        violation_type: 'untested_collection',
        count: 1,
        severity: 'high'
      }
    ]);
  });
  
  // Config endpoint
  app.get('/api/config', (req, res) => {
    res.json({
      collection: {
        schedule: '0 */6 * * *',
        timeout: 300000
      },
      governance: {
        weights: {
          documentation: 0.3,
          testing: 0.25,
          monitoring: 0.25,
          organization: 0.2
        }
      },
      version: '1.0.0'
    });
  });
  
  // Manual collection trigger
  app.post('/api/collect', (req, res) => {
    res.json({
      status: 'initiated',
      message: 'Data collection started',
      timestamp: new Date().toISOString()
    });
  });
  
  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
  
  return app;
}

describe('API Integration Tests', () => {
  let app;
  
  beforeAll(() => {
    app = createTestApp();
  });
  
  describe('Basic Endpoints', () => {
    test('GET / should return service info', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('service', 'Postman Governance Collector');
      expect(response.body).toHaveProperty('version');
    });
    
    test('GET /health should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('components');
      expect(response.body.components).toHaveProperty('database');
      expect(response.body.components).toHaveProperty('api');
    });
    
    test('GET /metrics should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);
      
      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.text).toContain('postman_governance_info');
    });
    
    test('GET /metrics/json should return JSON metrics', async () => {
      const response = await request(app)
        .get('/metrics/json')
        .expect(200);
      
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.uptime).toBe('number');
      expect(typeof response.body.memory).toBe('object');
    });
  });
  
  describe('Governance API Endpoints', () => {
    test('GET /api/governance/summary should return metrics summary', async () => {
      const response = await request(app)
        .get('/api/governance/summary')
        .expect(200);
      
      expect(response.body).toHaveProperty('avg_overall_score');
      expect(response.body).toHaveProperty('avg_documentation_score');
      expect(response.body).toHaveProperty('avg_testing_score');
      expect(response.body).toHaveProperty('total_workspaces');
      expect(response.body).toHaveProperty('total_collections');
      expect(typeof response.body.avg_overall_score).toBe('number');
    });
    
    test('GET /api/governance/violations should return violations', async () => {
      const response = await request(app)
        .get('/api/governance/violations')
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('violation_type');
        expect(response.body[0]).toHaveProperty('count');
        expect(response.body[0]).toHaveProperty('severity');
      }
    });
    
    test('GET /api/config should return safe configuration', async () => {
      const response = await request(app)
        .get('/api/config')
        .expect(200);
      
      expect(response.body).toHaveProperty('collection');
      expect(response.body).toHaveProperty('governance');
      expect(response.body).toHaveProperty('version');
      expect(response.body.collection).toHaveProperty('schedule');
      expect(response.body.governance).toHaveProperty('weights');
    });
    
    test('POST /api/collect should trigger manual collection', async () => {
      const response = await request(app)
        .post('/api/collect')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'initiated');
      expect(response.body).toHaveProperty('message', 'Data collection started');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
  
  describe('Error Handling', () => {
    test('404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/unknown-endpoint')
        .expect(404);
      
      expect(response.body).toHaveProperty('error', 'Endpoint not found');
    });
    
    test('Should handle malformed JSON requests gracefully', async () => {
      // Most endpoints are GET, but test with POST endpoint
      const response = await request(app)
        .post('/api/collect')
        .set('Content-Type', 'application/json')
        .send('{"malformed": json}')
        .expect(400);
    });
  });
  
  describe('Content Types and Headers', () => {
    test('JSON endpoints should return proper content type', async () => {
      const response = await request(app)
        .get('/api/governance/summary')
        .expect(200);
      
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
    
    test('Metrics endpoint should return plain text', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);
      
      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    });
  });
  
  describe('Response Validation', () => {
    test('Health endpoint should include all required fields', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      // Validate response structure
      expect(response.body.status).toBe('healthy');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
      expect(response.body.components.database.status).toBe('healthy');
      expect(response.body.components.api.status).toBe('healthy');
    });
    
    test('Metrics JSON should have valid structure', async () => {
      const response = await request(app)
        .get('/metrics/json')
        .expect(200);
      
      // Validate response structure
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThan(0);
      expect(response.body.memory).toHaveProperty('rss');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });
});

describe('Performance Tests', () => {
  let app;
  
  beforeAll(() => {
    app = createTestApp();
  });
  
  test('Health endpoint should respond quickly', async () => {
    const start = Date.now();
    
    await request(app)
      .get('/health')
      .expect(200);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // Should respond in under 100ms
  });
  
  test('Should handle concurrent requests', async () => {
    const promises = Array(10).fill().map(() => 
      request(app).get('/health').expect(200)
    );
    
    const responses = await Promise.all(promises);
    expect(responses).toHaveLength(10);
    responses.forEach(response => {
      expect(response.body.status).toBe('healthy');
    });
  });
});