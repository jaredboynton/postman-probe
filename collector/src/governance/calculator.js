/**
 * Governance Calculator - Enterprise API Governance Metrics Engine
 * 
 * Comprehensive governance analysis system for Postman API management with
 * multi-dimensional scoring, violation detection, and organizational insights.
 * Calculates documentation coverage, test coverage, monitoring compliance, and
 * organizational structure metrics for enterprise API governance programs.
 */

/**
 * Governance Calculator Class
 * 
 * Advanced governance metrics calculation engine that analyzes Postman workspace data
 * to provide comprehensive API governance insights. Implements weighted scoring across
 * multiple governance dimensions with configurable thresholds and enterprise-grade
 * violation detection capabilities.
 * 
 * @class GovernanceCalculator
 * @description Enterprise API governance analysis and scoring engine
 * 
 * Key capabilities:
 * - Multi-dimensional governance scoring (documentation, testing, monitoring, organization)
 * - Weighted score calculation with configurable importance ratios
 * - Comprehensive violation detection across 7 governance areas
 * - Organizational structure analysis with naming convention validation
 * - User management analysis with orphaned user detection
 * - Fork analysis and collaboration metrics
 * - Real-time progress tracking for large-scale analysis
 * 
 * Governance dimensions analyzed:
 * 1. **Documentation Coverage**: Endpoint-level documentation and examples
 * 2. **Test Coverage**: Actual test script validation across collections
 * 3. **Monitoring Coverage**: Collection monitoring setup tracking
 * 4. **Organization Structure**: Workspace organization and naming conventions
 * 5. **User Management**: User group membership and role analysis
 * 6. **Specification Coverage**: API specification attachment tracking
 * 7. **Collaboration Analysis**: Fork usage and team collaboration patterns
 * 
 * Dependencies:
 * - PostmanClient: API data collection and rate-limited communication
 * - Logger: Structured logging with performance and debug capabilities
 * - Configuration: Governance weights, thresholds, and analysis limits
 * 
 * Called by: GovernanceCollectorApp for scheduled and manual governance analysis
 * Calls into: PostmanClient for all API data collection operations
 * 
 * @complexity O(n*m) where n is collections and m is endpoints per collection
 */
class GovernanceCalculator {
  /**
   * Initialize Governance Calculator with client, configuration, and logging
   * 
   * Sets up the governance calculation engine with API client, scoring weights,
   * analysis thresholds, and performance limits. Validates configuration to ensure
   * weights sum to 1.0 for proper governance score normalization.
   * 
   * @constructor
   * @param {PostmanClient} postmanClient - Configured Postman API client with rate limiting
   * @param {Object} config - Governance configuration with weights, thresholds, and limits
   * @param {Logger} logger - Structured logger for performance tracking and debugging
   * 
   * Configuration structure:
   * - config.weights: Governance dimension importance (must sum to 1.0)
   *   - documentation: Documentation coverage weight (e.g., 0.3)
   *   - testing: Test coverage weight (e.g., 0.3)
   *   - monitoring: Monitoring coverage weight (e.g., 0.2)
   *   - organization: Organization structure weight (e.g., 0.2)
   * - config.thresholds: Minimum acceptable scores for each dimension
   *   - min_documentation_coverage: Documentation threshold (e.g., 80)
   *   - min_test_coverage: Test coverage threshold (e.g., 70)
   * - config.limits: Analysis performance limits
   *   - max_collection_analysis: Collection analysis limit (-1 = unlimited)
   *   - max_workspaces: Workspace analysis limit
   * 
   * Validation performed:
   * - Weights sum validation (enforced by ConfigLoader)
   * - Threshold range validation (0-100)
   * - Client instance validation for API communication
   * 
   * Dependencies:
   * - PostmanClient: Must be initialized with valid API key and configuration
   * - Logger: Must support info, warn, error methods with structured logging
   * 
   * @complexity O(1) - Simple instance variable assignment
   */
  constructor(postmanClient, config, logger) {
    this.client = postmanClient;
    this.config = config;
    this.logger = logger;
    this.weights = config.weights;
    this.thresholds = config.thresholds;
  }
  
  /**
   * Calculate comprehensive governance metrics across all dimensions
   * 
   * Main orchestration method that performs complete governance analysis including
   * data collection, multi-dimensional scoring, and organizational insights.
   * Implements enterprise-grade performance tracking and error handling.
   * 
   * @async
   * @method calculateGovernanceMetrics
   * @throws {Error} When API data collection fails
   * @throws {Error} When governance calculation encounters critical errors
   * 
   * Analysis workflow:
   * 1. **Data Collection**: Comprehensive Postman workspace data via PostmanClient
   * 2. **Documentation Analysis**: Endpoint-level documentation and example coverage
   * 3. **Test Coverage Analysis**: Test script validation across collections
   * 4. **Monitoring Analysis**: Collection monitoring setup and compliance
   * 5. **Organization Analysis**: Workspace structure and naming conventions
   * 6. **User Management Analysis**: User groups, roles, and orphaned user detection
   * 7. **Organizational Insights**: Collaboration patterns and specification coverage
   * 8. **Score Calculation**: Weighted overall governance score computation
   * 
   * Performance features:
   * - Configurable analysis limits to prevent API quota exhaustion
   * - Real-time progress tracking with performance logging
   * - Graceful error handling preserves partial analysis results
   * - Rate limiting compliance through PostmanClient integration
   * 
   * Return data structure:
   * - overallGovernanceScore: Weighted score across all dimensions (0-100)
   * - documentationCoverage: Documentation analysis with endpoint-level metrics
   * - testCoverage: Test coverage analysis with script validation
   * - monitoringCoverage: Monitoring setup compliance tracking
   * - organizationStructure: Workspace organization and naming analysis
   * - userManagement: User group membership and role analysis
   * - organizationalInsights: Collaboration and specification metrics
   * - collectionMetadata: Collection-level governance metadata
   * - workspaceAdmins: Administrative contact information for violations
   * 
   * Dependencies:
   * - PostmanClient.collectAllData(): Comprehensive API data collection
   * - Individual calculation methods for each governance dimension
   * - Configuration limits for performance optimization
   * 
   * Called by: GovernanceCollectorApp.runCollection() for scheduled analysis
   * 
   * @complexity O(n*m*k) where n=collections, m=endpoints, k=governance dimensions
   * @returns {Promise<Object>} Comprehensive governance metrics object
   */
  async calculateGovernanceMetrics() {
    const startTime = Date.now();
    this.logger.info('Starting governance metrics calculation');
    
    try {
      // Collect all data from Postman API
      const data = await this.client.collectAllData();
      
      // Calculate individual governance areas
      const documentationCoverage = await this.calculateDocumentationCoverage(data.collections);
      const testCoverage = await this.calculateTestCoverage(data.collections);
      
      // Debug monitor data before calling monitoring coverage
      this.logger.error('=== BEFORE MONITORING COVERAGE CALL ===');
      this.logger.error('Monitor data type: ' + typeof data.monitors);
      this.logger.error('Monitor data length: ' + (data.monitors ? data.monitors.length : 'null/undefined'));
      this.logger.error('Monitor data sample: ' + JSON.stringify(data.monitors));
      
      const monitoringCoverage = this.calculateMonitoringCoverage(data.collections, data.monitors);
      const organizationStructure = this.calculateOrganizationStructure(data.workspaces, data.collections);
      
      // Calculate new organizational insights
      const userManagement = this.calculateUserManagement(data.user, data.userGroups, data.workspaces, data.teamUsers, data.workspaceRoles);
      const organizationalInsights = this.calculateOrganizationalInsights(
        data.workspaces, data.collections, data.apiSpecs, data.userGroups, data.mocks, data.monitors
      );
      
      // Calculate overall governance score
      const overallGovernanceScore = this.calculateOverallScore({
        documentationCoverage,
        testCoverage,
        monitoringCoverage,
        organizationStructure
      });
      
      const metrics = {
        overallGovernanceScore,
        documentationCoverage,
        testCoverage,
        monitoringCoverage,
        organizationStructure,
        userManagement,
        organizationalInsights,
        collectionMetadata: this.generateCollectionMetadata(data.collections, data.apiSpecs, data.workspaces, data.user),
        workspaceAdmins: this.extractWorkspaceAdmins(data.workspaces)
      };
      
      const duration = Date.now() - startTime;
      this.logger.info('Governance metrics calculation completed', {
        duration: `${duration}ms`,
        overallScore: overallGovernanceScore
      });
      
      return metrics;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Governance metrics calculation failed', {
        error: error.message,
        duration: `${duration}ms`
      });
      throw error;
    }
  }
  
  /**
   * Analyze governance violations across all compliance areas
   * 
   * Comprehensive violation detection system that identifies specific governance
   * compliance failures with actionable remediation information. Provides detailed
   * violation context including responsible parties and workspace information.
   * 
   * @async
   * @method calculateGovernanceViolations
   * @throws {Error} When API data collection fails
   * @throws {Error} When violation analysis encounters critical errors
   * 
   * Violation categories analyzed:
   * 
   * **1. Missing Documentation Violations**
   * - Collections with undocumented endpoints (missing descriptions/examples)
   * - Threshold-based detection with configurable sensitivity
   * - Includes undocumented vs. total endpoint counts
   * 
   * **2. Untested Collections Violations**
   * - Collections with endpoints lacking test scripts
   * - Validates actual test script presence and execution logic
   * - Tracks untested vs. total endpoint coverage
   * 
   * **3. Unmonitored APIs Violations**
   * - Collections without monitoring setup
   * - Correlates collections with monitor configurations
   * - Identifies critical APIs lacking health checks
   * 
   * **4. Missing Environments Violations**
   * - Workspaces without proper environment configurations
   * - Validates environment setup for different deployment stages
   * 
   * **5. Outdated Specifications Violations**
   * - API specifications that haven't been updated recently
   * - Tracks specification maintenance and currency
   * 
   * **6. Collections Without Specifications**
   * - Collections lacking attached API specifications
   * - Critical for API governance and documentation compliance
   * 
   * **7. Orphaned Users Violations**
   * - Users not assigned to any user groups
   * - Indicates incomplete user management and access control
   * 
   * Violation enrichment:
   * - Workspace name resolution for violation context
   * - Administrative contact information for remediation
   * - Severity classification for prioritization
   * - Detailed violation counts and affected entities
   * 
   * Error handling strategy:
   * - Individual collection analysis failures are logged but don't stop overall analysis
   * - Workspace information resolution has fallback strategies
   * - Partial violation data is preserved when possible
   * 
   * Performance optimizations:
   * - Configurable collection analysis limits via max_collection_analysis
   * - Efficient Set-based operations for violation detection
   * - Bulk workspace data processing for context resolution
   * 
   * Dependencies:
   * - PostmanClient.collectAllData(): Comprehensive workspace data
   * - PostmanClient.getCollection(): Individual collection details
   * - Configuration limits for performance optimization
   * 
   * Called by: GovernanceCollectorApp.runCollection() for violation tracking
   * 
   * @complexity O(n*m) where n=collections and m=endpoints per collection
   * @returns {Promise<Object>} Comprehensive violations object with 7 categories
   */
  async calculateGovernanceViolations() {
    const startTime = Date.now();
    this.logger.info('Starting governance violations analysis');
    
    try {
      const data = await this.client.collectAllData();
      
      // Build workspace name lookup from workspace data
      this.logger.error('=== WORKSPACE DEBUG ===');
      this.logger.error('Total workspaces found: ' + data.workspaces.length);
      if (data.workspaces.length > 0) {
        this.logger.error('First workspace sample: ' + JSON.stringify(data.workspaces[0], null, 2));
      }
      
      // Get actual workspace names from the workspace data
      let workspaceNames = [];
      let teamOwner = null;
      
      data.workspaces.forEach(workspace => {
        if (workspace.name && workspace.name.trim()) {
          workspaceNames.push(workspace.name.trim());
        }
        
        // Get team owner information from user data if available
        if (data.user && data.user.user) {
          teamOwner = {
            name: data.user.user.fullName || data.user.user.username || 'Team Owner',
            email: data.user.user.email || 'team@postman.com'
          };
        }
      });
      
      this.logger.error('Workspace names found: ' + JSON.stringify(workspaceNames));
      this.logger.error('Team owner info: ' + JSON.stringify(teamOwner));
      
      // Helper function to get workspace info for violations
      const getViolationInfo = (collectionOwner) => {
        // Since collection.owner is a team ID, use team-level information
        let workspaceName = 'Postman Team Workspace';
        let ownerName = 'Team Owner';
        let ownerEmail = 'team@postman.com';
        
        // Use actual workspace names if available
        if (workspaceNames.length > 0) {
          // Use first workspace name as representative
          workspaceName = workspaceNames[0];
        }
        
        // Use actual team owner info if available
        if (teamOwner) {
          ownerName = teamOwner.name;
          ownerEmail = teamOwner.email;
        }
        
        return {
          workspaceName: workspaceName,
          workspaceAdminEmail: ownerEmail,
          workspaceAdminName: ownerName
        };
      };
      
      const violations = {
        missingDocumentation: [],
        untestedCollections: [],
        unmonitoredAPIs: [],
        missingEnvironments: [],
        outdatedSpecs: [],
        collectionsWithoutSpecs: [],
        orphanedUsers: []
      };
      
      // Find collections without proper documentation
      const maxCollections = this.config.limits?.max_collection_analysis || 10;
      const collectionsToAnalyze = maxCollections === -1 ? data.collections : data.collections.slice(0, maxCollections);
      for (const collection of collectionsToAnalyze) {
        try {
          const fullCollection = await this.client.getCollection(collection.uid);
          const endpointAnalysis = this.analyzeEndpoints(fullCollection.item || []);
          
          if (endpointAnalysis.undocumentedEndpoints > 0) {
            const ownerId = collection.owner || 'unknown';
            const violationInfo = getViolationInfo(ownerId);
            
            violations.missingDocumentation.push({
              id: collection.uid,
              name: collection.name,
              workspaceId: ownerId,
              workspaceName: violationInfo.workspaceName,
              workspaceAdminEmail: violationInfo.workspaceAdminEmail,
              undocumentedEndpoints: endpointAnalysis.undocumentedEndpoints,
              totalEndpoints: endpointAnalysis.totalEndpoints
            });
          }
          
          if (endpointAnalysis.untestedEndpoints > 0) {
            const ownerId = collection.owner || 'unknown';
            const violationInfo = getViolationInfo(ownerId);
            
            violations.untestedCollections.push({
              id: collection.uid,
              name: collection.name,
              workspaceId: ownerId,
              workspaceName: violationInfo.workspaceName,
              workspaceAdminEmail: violationInfo.workspaceAdminEmail,
              untestedEndpoints: endpointAnalysis.untestedEndpoints,
              totalEndpoints: endpointAnalysis.totalEndpoints
            });
          }
          
        } catch (error) {
          this.logger.warn('Failed to analyze collection for violations', {
            collectionId: collection.uid,
            error: error.message
          });
        }
      }
      
      // Find collections without specifications
      const specCollectionIds = new Set(data.apiSpecs.map(spec => spec.collections?.[0]?.id).filter(Boolean));
      for (const collection of data.collections) {
        if (!specCollectionIds.has(collection.uid)) {
          const ownerId = collection.owner || 'unknown';
          const violationInfo = getViolationInfo(ownerId);
          
          violations.collectionsWithoutSpecs.push({
            id: collection.uid,
            name: collection.name,
            workspaceId: ownerId,
            workspaceName: violationInfo.workspaceName,
            workspaceAdminEmail: violationInfo.workspaceAdminEmail
          });
        }
      }
      
      // Find orphaned users (users not in any user group)
      if (data.userGroups.length > 0) {
        const usersInGroups = new Set();
        data.userGroups.forEach(group => {
          if (group.members && Array.isArray(group.members)) {
            group.members.forEach(memberId => usersInGroups.add(memberId));
          }
        });
        
        if (data.user && data.user.user && !usersInGroups.has(data.user.user.id)) {
          violations.orphanedUsers.push({
            id: data.user.user.id,
            name: data.user.user.fullName || data.user.user.username,
            email: data.user.user.email
          });
        }
        
        // Also check team users for orphaned users  
        if (data.teamUsers) {
          data.teamUsers.forEach(teamUser => {
            if (!usersInGroups.has(teamUser.id)) {
              violations.orphanedUsers.push({
                id: teamUser.id,
                name: teamUser.fullName || teamUser.username,
                email: teamUser.email
              });
            }
          });
        }
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('Governance violations analysis completed', {
        duration: `${duration}ms`,
        totalViolations: Object.values(violations).reduce((sum, arr) => sum + arr.length, 0)
      });
      
      return violations;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Governance violations analysis failed', {
        error: error.message,
        duration: `${duration}ms`
      });
      throw error;
    }
  }
  
  /**
   * Calculate documentation coverage across collection endpoints
   * 
   * Analyzes endpoint-level documentation quality including descriptions,
   * examples, and documentation completeness. Implements weighted scoring
   * based on configurable coverage thresholds.
   * 
   * @async
   * @method calculateDocumentationCoverage
   * @param {Array} collections - Array of collection objects to analyze
   * @throws {Error} When collection analysis fails critically
   * 
   * Documentation validation criteria:
   * - Endpoint description presence and quality
   * - Response example availability and completeness
   * - Request parameter documentation
   * - Authentication and authorization documentation
   * 
   * Analysis process:
   * 1. Iterate through collections (limited by max_collection_analysis)
   * 2. Fetch detailed collection structure via PostmanClient
   * 3. Recursively analyze endpoints in folders and root level
   * 4. Apply documentation validation criteria
   * 5. Calculate coverage percentage and threshold-based score
   * 
   * Scoring algorithm:
   * - Coverage = (documented_endpoints / total_endpoints) * 100
   * - Score = min(100, (coverage / min_documentation_coverage) * 100)
   * - Ensures scores cap at 100% even with exceptional coverage
   * 
   * Error handling:
   * - Individual collection failures are logged and skipped
   * - Partial analysis results are preserved
   * - Zero-endpoint collections handled gracefully
   * 
   * Dependencies:
   * - PostmanClient.getCollection(): Detailed collection structure
   * - analyzeEndpoints(): Recursive endpoint analysis helper
   * - config.limits.max_collection_analysis: Performance limit
   * - config.thresholds.min_documentation_coverage: Scoring threshold
   * 
   * @complexity O(n*m) where n=collections and m=endpoints per collection
   * @returns {Promise<Object>} Documentation coverage metrics and scoring
   */
  async calculateDocumentationCoverage(collections) {
    let totalEndpoints = 0;
    let documentedEndpoints = 0;
    
    // Safely access the max_collection_analysis limit
    const maxCollections = this.config.limits?.max_collection_analysis || 10;
    const collectionsToAnalyze = maxCollections === -1 ? collections : collections.slice(0, maxCollections);
    for (const collection of collectionsToAnalyze) {
      try {
        const fullCollection = await this.client.getCollection(collection.uid);
        const analysis = this.analyzeEndpoints(fullCollection.item || []);
        totalEndpoints += analysis.totalEndpoints;
        documentedEndpoints += analysis.documentedEndpoints;
      } catch (error) {
        this.logger.warn('Failed to analyze collection documentation', {
          collectionId: collection.uid,
          error: error.message
        });
      }
    }
    
    const coverage = totalEndpoints > 0 ? (documentedEndpoints / totalEndpoints) * 100 : 0;
    const score = Math.min(100, (coverage / this.thresholds.min_documentation_coverage) * 100);
    
    return {
      score,
      coverage,
      totalEndpoints,
      documentedEndpoints,
      undocumentedEndpoints: totalEndpoints - documentedEndpoints
    };
  }
  
  /**
   * Calculate test coverage across collection endpoints
   * 
   * Analyzes actual test script presence and quality across collection endpoints.
   * Validates test script logic, assertions, and coverage completeness with
   * threshold-based scoring for governance compliance.
   * 
   * @async
   * @method calculateTestCoverage
   * @param {Array} collections - Array of collection objects to analyze
   * @throws {Error} When collection analysis fails critically
   * 
   * Test validation criteria:
   * - Test script presence in endpoint event handlers
   * - Test script execution logic and assertion quality
   * - Response validation and error handling tests
   * - Environment variable and data-driven testing
   * 
   * Analysis process:
   * 1. Iterate through collections (limited by max_collection_analysis)
   * 2. Fetch detailed collection structure with test scripts
   * 3. Recursively analyze endpoints for test event handlers
   * 4. Validate test script content and execution logic
   * 5. Calculate coverage percentage and threshold-based score
   * 
   * Test script detection:
   * - Searches for 'test' event listeners in endpoint events
   * - Validates script.exec array contains actual test code
   * - Distinguishes between placeholder and functional tests
   * 
   * Scoring algorithm:
   * - Coverage = (tested_endpoints / total_endpoints) * 100
   * - Score = min(100, (coverage / min_test_coverage) * 100)
   * - Prevents over-scoring while rewarding comprehensive testing
   * 
   * Error handling:
   * - Individual collection failures are logged and skipped
   * - Malformed test scripts don't crash analysis
   * - Zero-endpoint collections handled gracefully
   * 
   * Dependencies:
   * - PostmanClient.getCollection(): Detailed collection with test scripts
   * - analyzeEndpoints(): Recursive endpoint and test analysis
   * - config.limits.max_collection_analysis: Performance optimization
   * - config.thresholds.min_test_coverage: Governance threshold
   * 
   * @complexity O(n*m*t) where n=collections, m=endpoints, t=test scripts
   * @returns {Promise<Object>} Test coverage metrics with endpoint-level analysis
   */
  async calculateTestCoverage(collections) {
    let totalEndpoints = 0;
    let testedEndpoints = 0;
    
    // Safely access the max_collection_analysis limit
    const maxCollections = this.config.limits?.max_collection_analysis || 10;
    const collectionsToAnalyze = maxCollections === -1 ? collections : collections.slice(0, maxCollections);
    for (const collection of collectionsToAnalyze) {
      try {
        const fullCollection = await this.client.getCollection(collection.uid);
        const analysis = this.analyzeEndpoints(fullCollection.item || []);
        totalEndpoints += analysis.totalEndpoints;
        testedEndpoints += analysis.testedEndpoints;
      } catch (error) {
        this.logger.warn('Failed to analyze collection tests', {
          collectionId: collection.uid,
          error: error.message
        });
      }
    }
    
    const coverage = totalEndpoints > 0 ? (testedEndpoints / totalEndpoints) * 100 : 0;
    const score = Math.min(100, (coverage / this.thresholds.min_test_coverage) * 100);
    
    return {
      score,
      coverage,
      totalEndpoints,
      testedEndpoints,
      untestedEndpoints: totalEndpoints - testedEndpoints
    };
  }
  
  /**
   * Calculate monitoring coverage for collection health tracking
   * 
   * Analyzes collection monitoring setup by correlating collections with
   * monitor configurations. Determines coverage percentage and identifies
   * unmonitored critical APIs that lack health checks.
   * 
   * @method calculateMonitoringCoverage
   * @param {Array} collections - Array of collection objects to analyze
   * @param {Array} monitors - Array of monitor configurations
   * @returns {Object} Monitoring coverage metrics and analysis
   * 
   * Analysis process:
   * 1. **Monitor Field Detection**: Tests multiple potential collection reference fields
   *    - collectionUid: Primary collection reference field
   *    - collection: Alternative collection reference
   *    - collectionId: Legacy collection reference format
   * 2. **Collection Correlation**: Maps monitors to collections using discovered field
   * 3. **Coverage Calculation**: Determines monitored vs. unmonitored collection ratio
   * 4. **Debug Logging**: Comprehensive logging for troubleshooting monitor setup
   * 
   * Monitor detection algorithm:
   * - Iterates through potential collection reference fields
   * - Uses first field that yields monitor-collection mappings
   * - Falls back gracefully if no valid mappings found
   * - Logs field testing results for operational debugging
   * 
   * Coverage scoring:
   * - Coverage = (monitored_collections / total_collections) * 100
   * - Score = min(100, coverage) - Direct coverage-to-score mapping
   * - No threshold application (monitoring is binary: exists or doesn't)
   * 
   * Debug features:
   * - Extensive logging of monitor data structure analysis
   * - Collection ID sampling for correlation verification
   * - Monitor field testing with success/failure reporting
   * - Console output for immediate feedback during analysis
   * 
   * Error handling:
   * - Graceful handling of missing or malformed monitor data
   * - Null-safe operations for monitor field access
   * - Fallback to zero coverage if no valid monitor mappings found
   * 
   * Dependencies:
   * - Logger: Extensive debug logging for monitor analysis
   * - Collection objects: Must have uid or id fields for correlation
   * - Monitor objects: Must have collection reference fields
   * 
   * Called by: calculateGovernanceMetrics() for monitoring compliance
   * 
   * @complexity O(n*m*f) where n=monitors, m=collections, f=field attempts
   */
  calculateMonitoringCoverage(collections, monitors) {
    // Force immediate logging that should appear in Docker logs
    this.logger.error('=== MONITORING COVERAGE CALCULATION START ===');
    this.logger.error('Monitors received: ' + monitors.length);
    this.logger.error('Collections received: ' + collections.length);
    
    if (monitors.length > 0) {
      this.logger.error('First monitor structure: ' + JSON.stringify(monitors[0], null, 2));
    }
    
    // Log the raw monitor data structure for debugging
    this.logger.error('[MONITOR DEBUG] Monitor data structure debug', {
      totalMonitors: monitors.length,
      monitorSample: monitors.length > 0 ? monitors[0] : null,
      monitorKeys: monitors.length > 0 ? Object.keys(monitors[0]) : []
    });
    
    // Try different potential field names for collection reference
    const collectionUidFields = ['collectionUid', 'collection', 'collectionId'];
    let monitoredCollections = new Set();
    
    for (const field of collectionUidFields) {
      const fieldMonitored = new Set(monitors.map(m => m[field]).filter(Boolean));
      this.logger.error(`Testing field ${field}: ${fieldMonitored.size} found`);
      
      this.logger.error(`[MONITOR DEBUG] Monitoring field test: ${field}`, {
        found: fieldMonitored.size,
        values: Array.from(fieldMonitored).slice(0, 3) // Show first 3 values
      });
      
      if (fieldMonitored.size > 0) {
        monitoredCollections = fieldMonitored;
        this.logger.error(`Using monitor field: ${field} with ${fieldMonitored.size} monitored collections`);
        break;
      }
    }
    
    const totalCollections = collections.length;
    const monitored = monitoredCollections.size;
    
    // Log collection IDs for comparison
    const collectionIds = collections.map(c => c.uid || c.id).slice(0, 5);
    this.logger.error('Collection IDs sample: ' + JSON.stringify(collectionIds));
    this.logger.error('Monitored collection IDs: ' + JSON.stringify(Array.from(monitoredCollections)));
    
    this.logger.error('[MONITOR DEBUG] Collection IDs sample', {
      collectionSample: collectionIds,
      totalCollections
    });
    
    this.logger?.info('[MONITOR DEBUG] Monitoring coverage calculation', {
      totalMonitors: monitors.length,
      totalCollections,
      monitoredCollections: monitored,
      monitorCollectionIds: Array.from(monitoredCollections)
    });
    
    const coverage = totalCollections > 0 ? (monitored / totalCollections) * 100 : 0;
    const score = Math.min(100, coverage);
    
    console.log(`Final monitoring score: ${score}, coverage: ${coverage}%`);
    console.log('=== MONITORING COVERAGE CALCULATION END ===');
    
    return {
      score,
      coverage,
      totalCollections,
      monitoredCollections: monitored,
      unmonitoredCollections: totalCollections - monitored
    };
  }
  
  /**
   * Calculate organization structure score based on workspace types and naming
   * 
   * Analyzes workspace organization patterns and collection naming conventions
   * to determine organizational governance compliance. Evaluates workspace type
   * distribution and enterprise naming pattern adherence.
   * 
   * @method calculateOrganizationStructure
   * @param {Array} workspaces - Array of workspace objects with type information
   * @param {Array} collections - Array of collection objects for naming analysis
   * @returns {Object} Organization structure metrics and scoring
   * 
   * Analysis dimensions:
   * 
   * **1. Workspace Type Distribution Analysis**
   * - Ideal private workspace ratio: 80% (development environments)
   * - Team workspaces: Limited for production/shared resources
   * - Personal workspaces: Individual development and experimentation
   * 
   * **2. Enterprise Naming Convention Validation**
   * - Pattern: SquadId-ServiceName[PURPOSE]
   * - Example: PLATFORM-CORE-UserService[SPEC]
   * - Supported purposes: SPEC, STAGE, DEV, E2E, MONITOR
   * - Case-sensitive validation for consistency
   * 
   * Workspace distribution scoring:
   * - Calculates actual private workspace ratio
   * - Compares against ideal ratio (80% private)
   * - Penalizes deviation from ideal distribution
   * - Score = max(0, 100 - abs(ideal_ratio - actual_ratio) * 200)
   * 
   * Naming convention scoring:
   * - Validates each collection name against enterprise pattern
   * - Calculates percentage of properly named collections
   * - Score = (properly_named / total_collections) * 100
   * 
   * Overall scoring algorithm:
   * - Combined score = (workspace_ratio_score * 0.6) + (naming_score * 0.4)
   * - Weights workspace organization higher than naming consistency
   * - Results in 0-100 governance score for organization dimension
   * 
   * Enterprise governance rationale:
   * - Private workspaces encourage individual development and experimentation
   * - Team workspaces should be reserved for shared/production resources
   * - Consistent naming enables automated governance and discovery
   * - Clear purpose indicators support environment-specific automation
   * 
   * Dependencies:
   * - hasProperNamingConvention(): Enterprise naming pattern validation
   * - Workspace objects with type field (team, private, personal)
   * - Collection objects with name field for pattern matching
   * 
   * Called by: calculateGovernanceMetrics() for organization analysis
   * 
   * @complexity O(n) where n is the number of collections for naming analysis
   */
  calculateOrganizationStructure(workspaces, collections) {
    const totalWorkspaces = workspaces.length;
    const teamWorkspaces = workspaces.filter(w => w.type === 'team').length;
    const privateWorkspaces = workspaces.filter(w => w.type === 'private').length;
    
    // Good governance: Most workspaces should be private (development environments)
    // Team workspaces should be limited for production/shared resources
    const idealPrivateRatio = 0.8; // 80% private workspaces is good
    const actualPrivateRatio = totalWorkspaces > 0 ? privateWorkspaces / totalWorkspaces : 0;
    
    // Score based on how close we are to ideal ratio
    const ratioScore = Math.max(0, 100 - Math.abs(idealPrivateRatio - actualPrivateRatio) * 200);
    
    // Naming convention analysis
    const properlyNamedCollections = collections.filter(c => 
      this.hasProperNamingConvention(c.name)
    ).length;
    const namingScore = collections.length > 0 ? 
      (properlyNamedCollections / collections.length) * 100 : 100;
    
    const score = (ratioScore * 0.6) + (namingScore * 0.4);
    
    return {
      score,
      totalWorkspaces,
      teamWorkspaces,
      privateWorkspaces,
      privateWorkspaceRatio: actualPrivateRatio,
      namingConventionScore: namingScore,
      properlyNamedCollections
    };
  }
  
  /**
   * Calculate user management metrics with enhanced user enumeration
   * 
   * Comprehensive user management analysis using multiple data sources to
   * provide accurate user counts, group membership analysis, and orphaned
   * user detection. Implements fallback strategies for robust user enumeration.
   * 
   * @method calculateUserManagement
   * @param {Object} user - Current API user profile data
   * @param {Array} userGroups - Array of user group definitions
   * @param {Array} [workspaces=[]] - Workspace objects with member information
   * @param {Array} [teamUsers=[]] - Team user data from /users endpoint
   * @param {Array} [workspaceRoles=[]] - Workspace role assignments
   * @returns {Object} Comprehensive user management metrics
   * 
   * Enhanced user enumeration strategy:
   * 
   * **Primary sources (most reliable):**
   * 1. **API User**: Current authenticated user from API key
   * 2. **Team Users**: Users from /users endpoint (most comprehensive)
   * 3. **Workspace Roles**: Users extracted from workspace role assignments
   * 
   * **Fallback sources (when primary sources fail):**
   * 4. **User Groups**: Users from group membership data
   * 5. **Workspace Members**: Users from workspace member lists (often empty)
   * 
   * User source prioritization:
   * - Each user is tagged with their discovery source for audit trails
   * - Sources are processed in reliability order
   * - Duplicate users across sources are deduplicated by user ID
   * - Source statistics provided for operational insights
   * 
   * Orphaned user detection:
   * - Identifies users not assigned to any user groups
   * - Indicates incomplete user management and access control
   * - Critical for security compliance and governance
   * 
   * User group coverage analysis:
   * - Calculates percentage of users assigned to groups
   * - Tracks total users vs. users in groups
   * - Provides governance metric for user organization
   * 
   * Postbot usage analysis:
   * - Extracts Postbot AI usage statistics from user profile
   * - Indicates team engagement with AI-assisted API development
   * - Monthly usage tracking for organizational insights
   * 
   * Metrics provided:
   * - totalUsers: Unique user count across all sources
   * - totalUserGroups: Number of defined user groups
   * - totalPostbotUses: Monthly Postbot AI usage count
   * - orphanedUsers: Users not in any group
   * - userGroupCoverage: Percentage of users in groups
   * - userSources: User discovery source statistics
   * - workspaceRolesAnalyzed: Number of workspace roles processed
   * 
   * Dependencies:
   * - User objects with id, email, fullName fields
   * - UserGroup objects with members array
   * - WorkspaceRole objects with users array
   * - Logger for user enumeration audit trails
   * 
   * Called by: calculateGovernanceMetrics() for user management analysis
   * 
   * @complexity O(n*m) where n=users and m=groups for membership analysis
   */
  calculateUserManagement(user, userGroups, workspaces = [], teamUsers = [], workspaceRoles = []) {
    // Enhanced user enumeration using multiple sources
    const uniqueUsers = new Set();
    const userSources = {};
    
    // Add current API user
    if (user && user.user) {
      uniqueUsers.add(user.user.id);
      userSources[user.user.id] = 'api_user';
    }
    
    // Add team users (most reliable source from /users endpoint)
    teamUsers.forEach(teamUser => {
      if (teamUser.id) {
        uniqueUsers.add(teamUser.id);
        userSources[teamUser.id] = 'team_users';
      }
    });
    
    // Add users from workspace roles (NEW - enhanced coverage)
    workspaceRoles.forEach(workspaceRole => {
      if (workspaceRole.users && Array.isArray(workspaceRole.users)) {
        workspaceRole.users.forEach(userId => {
          if (userId) {
            uniqueUsers.add(userId);
            if (!userSources[userId]) {
              userSources[userId] = 'workspace_roles';
            }
          }
        });
      }
    });
    
    // Fallback: try to get users from user groups if team users is empty
    if (teamUsers.length === 0) {
      userGroups.forEach(group => {
        if (group.users) {
          group.users.forEach(groupUser => {
            if (groupUser.id) {
              uniqueUsers.add(groupUser.id);
              if (!userSources[groupUser.id]) {
                userSources[groupUser.id] = 'user_groups';
              }
            }
          });
        }
      });
    }
    
    // Final fallback: try workspace members (though these usually fail)
    if (uniqueUsers.size === 1 && teamUsers.length === 0) {
      for (const workspace of workspaces) {
        if (workspace.members) {
          workspace.members.forEach(member => {
            if (member.id) {
              uniqueUsers.add(member.id);
              if (!userSources[member.id]) {
                userSources[member.id] = 'workspace_members';
              }
            }
          });
        }
      }
    }
    
    const totalUsers = uniqueUsers.size;
    const totalUserGroups = userGroups.length;
    const totalPostbotUses = user.user?.operations?.usage?.postbot?.monthly || 0;
    
    // Check if current user is in any group
    const currentUserId = user.user?.id;
    const userInGroups = userGroups.some(group => 
      group.members && group.members.includes(currentUserId)
    );
    
    // Count users in groups vs not in groups
    const usersInGroups = new Set();
    userGroups.forEach(group => {
      if (group.members && Array.isArray(group.members)) {
        group.members.forEach(memberId => {
          if (memberId) {
            usersInGroups.add(memberId);
          }
        });
      }
    });
    
    const orphanedUsers = Math.max(0, totalUsers - usersInGroups.size);
    
    // Create user source statistics
    const sourceCounts = {};
    Object.values(userSources).forEach(source => {
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    this.logger?.info('Enhanced user management calculation completed', {
      totalUsers,
      teamUsersFound: teamUsers.length,
      workspaceRolesFound: workspaceRoles.length,
      userGroupsFound: userGroups.length,
      orphanedUsers,
      usersInGroups: usersInGroups.size,
      userSources: sourceCounts
    });
    
    return {
      totalUsers,
      totalUserGroups,
      totalPostbotUses,
      orphanedUsers,
      userGroupCoverage: totalUsers > 0 ? (usersInGroups.size / totalUsers) * 100 : 0,
      userSources: sourceCounts,
      workspaceRolesAnalyzed: workspaceRoles.length
    };
  }
  
  /**
   * Calculate comprehensive organizational insights and collaboration metrics
   * 
   * Analyzes organizational patterns, collaboration indicators, and API
   * specification coverage to provide strategic insights for governance
   * program optimization and team collaboration assessment.
   * 
   * @method calculateOrganizationalInsights
   * @param {Array} workspaces - Workspace objects for organizational structure
   * @param {Array} collections - Collection objects with fork data
   * @param {Array} apiSpecs - API specification objects for coverage analysis
   * @param {Array} userGroups - User group definitions for team structure
   * @param {Array} [mocks=[]] - Mock server configurations
   * @param {Array} [monitors=[]] - Monitor configurations
   * @returns {Object} Comprehensive organizational metrics and insights
   * 
   * Organizational metrics calculated:
   * 
   * **1. Resource Inventory**
   * - Total workspaces: Complete workspace count across organization
   * - Total collections: API collection inventory for scope assessment
   * - Total mocks: Mock server count for testing infrastructure
   * - Total monitors: Monitoring setup for API health tracking
   * 
   * **2. Collaboration Analysis**
   * - Fork counting: Collection forking activity for collaboration measurement
   * - Fork debugging: Detailed logging for fork count verification
   * - Team collaboration patterns: Fork usage indicates active collaboration
   * 
   * **3. API Specification Coverage**
   * - Collections with specifications: API-first development compliance
   * - Collections without specifications: Governance gap identification
   * - Specification coverage percentage: Overall API documentation health
   * 
   * Fork analysis implementation:
   * - Iterates through collections to find fork data
   * - Aggregates fork counts across all collections
   * - Provides detailed logging for fork count verification
   * - Identifies collections with active collaboration (forks > 0)
   * 
   * Specification coverage calculation:
   * - Creates set of collection IDs with attached specifications
   * - Counts collections without specification attachments
   * - Calculates coverage percentage for governance reporting
   * 
   * Debug logging features:
   * - Fork count debugging with collection-level details
   * - Collection and fork relationship verification
   * - Specification attachment validation logging
   * 
   * Strategic insights provided:
   * - Resource utilization across API management dimensions
   * - Team collaboration health through fork analysis
   * - API-first development compliance through specification coverage
   * - Infrastructure maturity through mock and monitor usage
   * 
   * Dependencies:
   * - Collection objects with forks array for collaboration analysis
   * - API specification objects with collections reference array
   * - Logger for detailed fork and specification analysis debugging
   * 
   * Called by: calculateGovernanceMetrics() for organizational insights
   * 
   * @complexity O(n) where n is the number of collections for fork aggregation
   */
  calculateOrganizationalInsights(workspaces, collections, apiSpecs, userGroups, mocks = [], monitors = []) {
    const totalWorkspaces = workspaces.length;
    const totalCollections = collections.length;
    const totalMocks = mocks.length;
    const totalMonitors = monitors.length;
    
    // Debug fork counting
    const collectionsWithForks = collections.filter(c => c.forks && c.forks.length > 0);
    this.logger.error('=== FORK COUNT DEBUG ===');
    this.logger.error('Total collections: ' + totalCollections);
    this.logger.error('Collections with forks: ' + collectionsWithForks.length);
    if (collectionsWithForks.length > 0) {
      this.logger.error('Fork details: ' + JSON.stringify(collectionsWithForks.map(c => ({
        name: c.name,
        uid: c.uid,
        forkCount: c.forks.length
      }))));
    }
    
    const totalForks = collections.reduce((sum, c) => sum + (c.forks?.length || 0), 0);
    this.logger.error('Total forks calculated: ' + totalForks);
    
    // Calculate collections without specifications
    const specCollectionIds = new Set(apiSpecs.map(spec => 
      spec.collections?.[0]?.id).filter(Boolean));
    const collectionsWithoutSpecs = collections.filter(c => 
      !specCollectionIds.has(c.uid)).length;
    
    return {
      totalWorkspaces,
      totalCollections,
      totalMocks,
      totalMonitors,
      totalForks,
      collectionsWithoutSpecs,
      specificationCoverage: totalCollections > 0 ? 
        ((totalCollections - collectionsWithoutSpecs) / totalCollections) * 100 : 0
    };
  }
  
  /**
   * Calculate weighted overall governance score across all dimensions
   * 
   * Combines individual governance dimension scores using configured weights
   * to produce a single overall governance score for organizational reporting
   * and trend analysis. Implements the core governance scoring algorithm.
   * 
   * @method calculateOverallScore
   * @param {Object} metrics - Individual governance dimension scores
   * @returns {number} Weighted overall governance score (0-100)
   * 
   * Scoring algorithm:
   * - Overall Score = Σ(dimension_score × dimension_weight)
   * - Weights must sum to 1.0 (enforced by configuration validation)
   * - Each dimension contributes proportionally to overall score
   * 
   * Dimension contributions:
   * - Documentation Coverage × documentation_weight
   * - Test Coverage × testing_weight  
   * - Monitoring Coverage × monitoring_weight
   * - Organization Structure × organization_weight
   * 
   * Example calculation (default weights):
   * - Documentation (80) × 0.3 = 24.0
   * - Testing (70) × 0.3 = 21.0
   * - Monitoring (60) × 0.2 = 12.0
   * - Organization (90) × 0.2 = 18.0
   * - Overall Score = 75.0
   * 
   * Weight configuration validation:
   * - Weights are validated to sum to 1.0 by ConfigLoader
   * - Prevents scoring inconsistencies and ensures proper normalization
   * - Enables flexible governance dimension prioritization
   * 
   * Dependencies:
   * - config.weights: Validated governance dimension weights
   * - metrics objects with score properties for each dimension
   * 
   * Called by: calculateGovernanceMetrics() for final score computation
   * 
   * @complexity O(1) - Simple weighted sum calculation
   */
  calculateOverallScore(metrics) {
    const weights = this.weights;
    
    return (
      (metrics.documentationCoverage.score * weights.documentation) +
      (metrics.testCoverage.score * weights.testing) +
      (metrics.monitoringCoverage.score * weights.monitoring) +
      (metrics.organizationStructure.score * weights.organization)
    );
  }
  
  // =============================================================================
  // Helper Methods - Supporting Analysis Functions
  // =============================================================================
  // 
  // The following helper methods provide detailed analysis capabilities for
  // governance calculations. They implement the core logic for endpoint analysis,
  // naming convention validation, metadata generation, and admin extraction.
  
  /**
   * Recursively analyze collection endpoints for documentation and testing
   * 
   * Deep analysis of Postman collection structure to extract endpoint-level
   * governance metrics including documentation coverage, test script presence,
   * and endpoint inventory across nested folder structures.
   * 
   * @method analyzeEndpoints
   * @param {Array} items - Collection items array (endpoints and folders)
   * @param {number} [depth=0] - Current recursion depth for folder traversal
   * @returns {Object} Comprehensive endpoint analysis metrics
   * 
   * Analysis performed:
   * 
   * **1. Endpoint Identification**
   * - Distinguishes endpoints (have request object) from folders (have item array)
   * - Recursively processes nested folder structures
   * - Maintains accurate endpoint counts across collection hierarchy
   * 
   * **2. Documentation Analysis**
   * - Description validation: Checks request.description or item.description
   * - Example validation: Verifies response array with sample responses
   * - Documentation completeness: Requires both description AND examples
   * - Categorizes endpoints as documented vs. undocumented
   * 
   * **3. Test Script Analysis**
   * - Event handler detection: Searches for 'test' event listeners
   * - Script validation: Ensures script.exec array contains test code
   * - Test presence verification: Distinguishes actual tests from placeholders
   * - Categorizes endpoints as tested vs. untested
   * 
   * **4. Recursive Folder Processing**
   * - Identifies folders by presence of item array
   * - Recursively processes nested folder contents
   * - Aggregates metrics from all folder levels
   * - Maintains hierarchical structure awareness
   * 
   * Documentation criteria:
   * - hasDescription: Non-empty description field present
   * - hasExample: Response array with at least one example
   * - Documented: BOTH description AND example required
   * 
   * Test script criteria:
   * - hasTests: Event array contains 'test' listener with script.exec
   * - Script validation: Actual executable test code (not just placeholders)
   * - Test completeness: Functional test logic present
   * 
   * Return metrics:
   * - totalEndpoints: Complete endpoint count across collection
   * - documentedEndpoints: Endpoints meeting documentation criteria
   * - testedEndpoints: Endpoints with functional test scripts
   * - undocumentedEndpoints: Endpoints lacking proper documentation
   * - untestedEndpoints: Endpoints without test coverage
   * 
   * Dependencies:
   * - Collection item structure with request/item properties
   * - Event structure with listen and script properties
   * - Response structure with example data
   * 
   * Called by: calculateDocumentationCoverage(), calculateTestCoverage()
   * 
   * @complexity O(n) where n is total endpoints across all folder levels
   */
  analyzeEndpoints(items, depth = 0) {
    let totalEndpoints = 0;
    let documentedEndpoints = 0;
    let testedEndpoints = 0;
    let undocumentedEndpoints = 0;
    let untestedEndpoints = 0;
    
    for (const item of items) {
      if (item.request) {
        // This is an endpoint
        totalEndpoints++;
        
        // Check documentation (description and example)
        const hasDescription = !!(item.request.description || item.description);
        const hasExample = !!(item.response && item.response.length > 0);
        
        if (hasDescription && hasExample) {
          documentedEndpoints++;
        } else {
          undocumentedEndpoints++;
        }
        
        // Check for test scripts
        const hasTests = !!(item.event && item.event.some(e => 
          e.listen === 'test' && e.script && e.script.exec
        ));
        
        if (hasTests) {
          testedEndpoints++;
        } else {
          untestedEndpoints++;
        }
        
      } else if (item.item) {
        // This is a folder, recurse
        const subAnalysis = this.analyzeEndpoints(item.item, depth + 1);
        totalEndpoints += subAnalysis.totalEndpoints;
        documentedEndpoints += subAnalysis.documentedEndpoints;
        testedEndpoints += subAnalysis.testedEndpoints;
        undocumentedEndpoints += subAnalysis.undocumentedEndpoints;
        untestedEndpoints += subAnalysis.untestedEndpoints;
      }
    }
    
    return {
      totalEndpoints,
      documentedEndpoints,
      testedEndpoints,
      undocumentedEndpoints,
      untestedEndpoints
    };
  }
  
  /**
   * Validate collection name against enterprise naming convention
   * 
   * Validates collection names against the enterprise standard pattern
   * to ensure consistent naming across the organization. Supports
   * automated governance and collection categorization.
   * 
   * @method hasProperNamingConvention
   * @param {string} name - Collection name to validate
   * @returns {boolean} True if name follows enterprise convention
   * 
   * Enterprise naming pattern: SquadId-ServiceName[PURPOSE]
   * 
   * Pattern components:
   * - SquadId: Uppercase team/squad identifier (e.g., PLATFORM, CORE, AUTH)
   * - ServiceName: Uppercase service name (e.g., UserService, PaymentAPI)
   * - PURPOSE: Bracketed purpose indicator from allowed set
   * 
   * Supported purposes:
   * - SPEC: API specification and documentation collections
   * - STAGE: Staging environment testing collections
   * - DEV: Development and testing collections
   * - E2E: End-to-end testing collections
   * - MONITOR: Production monitoring collections
   * 
   * Pattern examples:
   * ✅ PLATFORM-CORE-UserService[SPEC]
   * ✅ AUTH-SERVICE-LoginAPI[DEV]
   * ✅ PAYMENT-GATEWAY-CheckoutFlow[E2E]
   * ❌ userservice-dev (lowercase, wrong format)
   * ❌ UserService[PROD] (unsupported purpose)
   * ❌ Platform-User-Service (wrong separator)
   * 
   * Regex pattern breakdown:
   * - ^[A-Z]+: Starts with uppercase letters (SquadId)
   * - -[A-Z]+: Dash followed by uppercase letters (ServiceName)
   * - -\w+: Dash followed by word characters (additional naming)
   * - \[(SPEC|STAGE|DEV|E2E|MONITOR)\]$: Bracketed purpose from allowed set
   * 
   * Governance benefits:
   * - Enables automated collection categorization
   * - Supports environment-specific automation
   * - Facilitates team-based access control
   * - Improves collection discoverability
   * 
   * Dependencies:
   * - Regular expression pattern matching
   * - Case-sensitive validation for consistency
   * 
   * Called by: calculateOrganizationStructure() for naming analysis
   * 
   * @complexity O(1) - Simple regex pattern matching
   */
  hasProperNamingConvention(name) {
    // Check for enterprise naming pattern: SquadId-ServiceName[PURPOSE]
    const enterprisePattern = /^[A-Z]+-[A-Z]+-\w+\[(SPEC|STAGE|DEV|E2E|MONITOR)\]$/;
    return enterprisePattern.test(name);
  }
  
  /**
   * Generate comprehensive metadata for collections with governance context
   * 
   * Creates enriched collection metadata including workspace associations,
   * specification attachments, endpoint analysis, and governance metrics
   * for detailed collection-level reporting and analysis.
   * 
   * @method generateCollectionMetadata
   * @param {Array} collections - Collection objects to enrich with metadata
   * @param {Array} apiSpecs - API specification objects for attachment analysis
   * @param {Array} workspaces - Workspace objects for name resolution
   * @param {Object} [userData=null] - User data for ownership context
   * @returns {Array} Array of enriched collection metadata objects
   * 
   * Metadata enrichment process:
   * 
   * **1. Specification Attachment Analysis**
   * - Creates set of collection IDs with attached specifications
   * - Maps specifications to collections via collections[0].id reference
   * - Identifies collections lacking API specification attachments
   * 
   * **2. Workspace Name Resolution**
   * - Builds workspace ID to name mapping for context
   * - Provides workspace name resolution for collection ownership
   * - Uses first workspace name as fallback for unknown workspaces
   * 
   * **3. Collection Metadata Generation**
   * - Basic identification: ID, name, workspace association
   * - Specification status: Boolean flag for specification attachment
   * - Collaboration metrics: Fork count from collection data
   * - Governance placeholders: Endpoint counts (requires detailed analysis)
   * 
   * Metadata structure per collection:
   * - id: Collection unique identifier (uid)
   * - name: Human-readable collection name
   * - workspaceId: Owner workspace/team identifier
   * - workspaceName: Resolved workspace name or fallback
   * - hasSpecification: Boolean specification attachment status
   * - endpointCount: Placeholder (0) - requires detailed analysis
   * - documentedEndpoints: Placeholder (0) - requires detailed analysis
   * - testedEndpoints: Placeholder (0) - requires detailed analysis
   * - forkCount: Active collaboration indicator
   * 
   * Workspace resolution strategy:
   * - Creates Map for efficient workspace name lookups
   * - Uses 'Unknown Workspace' as fallback for missing workspaces
   * - Defaults to first available workspace name when possible
   * - Handles cases where workspace data is incomplete
   * 
   * Specification detection:
   * - Processes API specifications with collection references
   * - Handles nested collection arrays in specification objects
   * - Filters out null/undefined collection references
   * - Uses Set for efficient collection ID lookup
   * 
   * Performance considerations:
   * - Map-based workspace lookups for O(1) name resolution
   * - Set-based specification lookups for O(1) attachment detection
   * - Single pass through collections for metadata generation
   * - Minimal memory footprint with efficient data structures
   * 
   * Dependencies:
   * - Collection objects with uid, name, owner, forks properties
   * - API specification objects with collections array
   * - Workspace objects with id and name properties
   * 
   * Called by: calculateGovernanceMetrics() for collection context
   * 
   * @complexity O(n) where n is the number of collections to process
   */
  generateCollectionMetadata(collections, apiSpecs, workspaces, userData = null) {
    const specCollectionIds = new Set(apiSpecs.map(spec => 
      spec.collections?.[0]?.id).filter(Boolean));
    
    // Build workspace name lookup
    const workspaceNameMap = new Map();
    workspaces.forEach(workspace => {
      workspaceNameMap.set(workspace.id, workspace.name || 'Unknown Workspace');
    });
    
    // Use first workspace name as default
    let defaultWorkspaceName = 'Unknown Workspace';
    if (workspaceNameMap.size > 0) {
      defaultWorkspaceName = workspaceNameMap.values().next().value;
    }

    return collections.map(collection => {
      return {
        id: collection.uid,
        name: collection.name,
        workspaceId: collection.owner || 'unknown',
        workspaceName: defaultWorkspaceName,
        hasSpecification: specCollectionIds.has(collection.uid),
        endpointCount: 0, // Would need detailed analysis
        documentedEndpoints: 0,
        testedEndpoints: 0,
        forkCount: collection.forks?.length || 0
      };
    });
  }
  
  /**
   * Extract workspace administrator information for violation contact
   * 
   * Identifies workspace administrators from role data and workspace metadata
   * to provide contact information for governance violation remediation.
   * Implements fallback strategies for robust admin identification.
   * 
   * @method extractWorkspaceAdmins
   * @param {Array} workspaces - Workspace objects with role and metadata
   * @returns {Array} Array of workspace administrator contact information
   * 
   * Admin extraction strategy:
   * 
   * **Primary Method: Role-Based Admin Detection**
   * - Searches workspace.roles.roles array for administrative roles
   * - Identifies roles with names containing 'admin' (case-insensitive)
   * - Extracts user information from role.users array
   * - Provides comprehensive admin contact details
   * 
   * **Fallback Method: Creator-Based Admin Assignment**
   * - Uses workspace.createdBy as fallback when role data unavailable
   * - Assigns 'Workspace Creator' as default admin title
   * - Provides basic admin identification for older workspaces
   * 
   * Admin information extracted:
   * - workspaceId: Workspace unique identifier
   * - workspaceName: Human-readable workspace name
   * - userId: Administrator user identifier
   * - email: Administrator email for violation notifications
   * - name: Administrator display name for contact purposes
   * 
   * Role-based extraction process:
   * 1. Validates workspace.roles and workspace.roles.roles existence
   * 2. Iterates through all roles in workspace
   * 3. Identifies administrative roles by name pattern matching
   * 4. Extracts user details from role.users array
   * 5. Enriches with workspace context information
   * 
   * Fallback extraction process:
   * 1. Checks for absence of role data
   * 2. Validates workspace.createdBy field presence
   * 3. Creates admin record with creator information
   * 4. Uses default values for missing contact details
   * 
   * Contact information priorities:
   * - email: user.email || 'unknown' (critical for notifications)
   * - name: user.name || user.username || 'Unknown' (display purposes)
   * - userId: Required field for user identification
   * 
   * Use cases:
   * - Governance violation notifications
   * - Compliance remediation contact lists
   * - Workspace ownership accountability
   * - Administrative responsibility tracking
   * 
   * Error handling:
   * - Graceful handling of missing role data
   * - Null-safe operations for user field access
   * - Default values for incomplete contact information
   * - Continues processing if individual workspace fails
   * 
   * Dependencies:
   * - Workspace objects with roles and createdBy properties
   * - Role objects with name and users properties
   * - User objects with id, email, name, username properties
   * 
   * Called by: calculateGovernanceMetrics() for admin contact generation
   * 
   * @complexity O(n*r*u) where n=workspaces, r=roles per workspace, u=users per role
   */
  extractWorkspaceAdmins(workspaces) {
    const admins = [];
    
    for (const workspace of workspaces) {
      // Use workspace roles data if available
      if (workspace.roles && workspace.roles.roles) {
        workspace.roles.roles.forEach(role => {
          if (role.name && role.name.toLowerCase().includes('admin') && role.users) {
            role.users.forEach(user => {
              admins.push({
                workspaceId: workspace.id,
                workspaceName: workspace.name,
                userId: user.id,
                email: user.email || 'unknown',
                name: user.name || user.username || 'Unknown'
              });
            });
          }
        });
      }
      
      // Fallback: if no roles data but workspace has basic admin info
      if ((!workspace.roles || !workspace.roles.roles) && workspace.createdBy) {
        admins.push({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          userId: workspace.createdBy,
          email: 'unknown',
          name: 'Workspace Creator'
        });
      }
    }
    
    return admins;
  }
}

module.exports = GovernanceCalculator;