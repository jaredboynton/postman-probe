#!/usr/bin/env node
/**
 * Standalone Health Check Script - External Service Health Validation
 * 
 * Independent health verification utility for monitoring service availability
 * and health status from external systems. Designed for container health checks,
 * load balancer probes, monitoring system integration, and manual operational
 * verification scenarios.
 */

const axios = require('axios');

/**
 * Perform comprehensive external health check via HTTP API
 * 
 * Executes health verification by calling the service's /health endpoint
 * and analyzing the response for operational readiness. Provides detailed
 * diagnostic output and appropriate exit codes for automated integration.
 * 
 * @async
 * @function performHealthCheck
 * @throws {Error} When HTTP request fails or service is unreachable
 * @process.exit(0) When service is healthy and operational
 * @process.exit(1) When service is unhealthy or unreachable
 * 
 * Health check workflow:
 * 
 * **1. Configuration Resolution**
 * - Resolves host from HEALTH_CHECK_HOST environment variable (default: localhost)
 * - Resolves port from HEALTH_CHECK_PORT environment variable (default: 3001)
 * - Constructs health endpoint URL for HTTP request
 * 
 * **2. HTTP Request Execution**
 * - Performs GET request to /health endpoint with 10-second timeout
 * - Uses validateStatus: true to capture all HTTP status codes
 * - Handles network-level failures and timeouts gracefully
 * 
 * **3. Response Analysis**
 * - Validates HTTP status code (200 = healthy)
 * - Analyzes response.data.overall field for health status
 * - Combines HTTP status and health data for final determination
 * 
 * **4. Detailed Output Generation**
 * - Displays overall health status with visual indicators
 * - Shows response time and timestamp for performance analysis
 * - Provides detailed breakdown of individual health checks
 * - Uses emoji indicators for visual status recognition
 * 
 * **5. Individual Check Analysis**
 * - Iterates through health.checks object for detailed diagnostics
 * - Maps check statuses to visual indicators (✅ healthy, ⚠️ warning/degraded, ❌ unhealthy)
 * - Displays response times and error messages for failed checks
 * - Provides granular diagnostic information for troubleshooting
 * 
 * **6. Exit Code Determination**
 * - Exit 0: Service is healthy (HTTP 200 + overall=healthy)
 * - Exit 1: Service is unhealthy or unreachable
 * 
 * Environment configuration:
 * - HEALTH_CHECK_HOST: Target hostname (default: localhost)
 * - HEALTH_CHECK_PORT: Target port (default: 3001)
 * - Supports both container and external network configurations
 * 
 * Network error handling:
 * - ECONNREFUSED: Service down or not accepting connections
 * - ETIMEDOUT: Service responding too slowly (>10 seconds)
 * - Network connectivity issues with diagnostic messaging
 * 
 * Output format:
 * - Structured console output with clear visual indicators
 * - Detailed health check breakdown for operational visibility
 * - Error context for troubleshooting failed checks
 * - Response time metrics for performance monitoring
 * 
 * Integration use cases:
 * - Docker/Kubernetes container health checks
 * - Load balancer backend health validation
 * - Monitoring system service availability checks
 * - CI/CD pipeline deployment verification
 * - Manual operational health verification
 * 
 * Health status interpretation:
 * - healthy: All systems operational, ready for traffic
 * - degraded: Service functional but performance issues detected
 * - unhealthy: Critical failures, service not ready for traffic
 * 
 * Dependencies:
 * - axios: HTTP client for health endpoint communication
 * - Service /health endpoint availability and proper response format
 * - Network connectivity to target service
 * 
 * Called by:
 * - Direct script execution for manual verification
 * - Container orchestration health check commands
 * - Monitoring system health probes
 * - Automated deployment validation scripts
 * 
 * @complexity O(1) - Single HTTP request with response processing
 * @returns {Promise<void>} Resolves when health check completes (exits via process.exit)
 */
async function performHealthCheck() {
  const host = process.env.HEALTH_CHECK_HOST || 'localhost';
  const port = process.env.HEALTH_CHECK_PORT || '3001';
  const url = `http://${host}:${port}/health`;
  
  try {
    console.log(`Performing health check: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 10000, // 10 second timeout
      validateStatus: () => true // Don't throw on non-2xx status
    });
    
    const health = response.data;
    const isHealthy = response.status === 200 && health.overall === 'healthy';
    
    console.log('Health Check Results:');
    console.log('====================');
    console.log(`Overall Status: ${health.overall}`);
    console.log(`Response Time: ${health.responseTime}ms`);
    console.log(`Timestamp: ${health.timestamp}`);
    
    if (health.checks) {
      console.log('\nDetailed Checks:');
      Object.entries(health.checks).forEach(([name, check]) => {
        const status = check.status === 'healthy' ? '✅' : 
                     check.status === 'warning' || check.status === 'degraded' ? '⚠️' : '❌';
        console.log(`  ${status} ${name}: ${check.status}`);
        
        if (check.responseTime) {
          console.log(`    Response Time: ${check.responseTime}ms`);
        }
        
        if (check.error) {
          console.log(`    Error: ${check.error}`);
        }
      });
    }
    
    if (isHealthy) {
      console.log('\n✅ Service is healthy!');
      process.exit(0);
    } else {
      console.log('\n❌ Service is not healthy!');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Health check failed:');
    console.error(`Error: ${error.message}`);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('The service appears to be down or not responding.');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('The service is taking too long to respond.');
    }
    
    process.exit(1);
  }
}

// =============================================================================
// Script Execution - Direct Invocation Handler
// =============================================================================

/**
 * Execute health check when script is run directly
 * 
 * Detects direct script execution and initiates external health verification.
 * Provides command-line interface for manual and automated health checking.
 * 
 * Execution patterns:
 * - Direct: node health-check.js
 * - Container: docker exec container-name node health-check.js
 * - Kubernetes: kubectl exec pod-name -- node health-check.js
 * - Monitoring: curl wrapper calling this script for health status
 * 
 * Environment variable support:
 * - HEALTH_CHECK_HOST: Override default localhost
 * - HEALTH_CHECK_PORT: Override default 3001
 * 
 * Exit codes for automation:
 * - 0: Service healthy and ready
 * - 1: Service unhealthy or unreachable
 */
if (require.main === module) {
  performHealthCheck();
}

module.exports = performHealthCheck;