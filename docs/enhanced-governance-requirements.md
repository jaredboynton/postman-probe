# Enhanced Governance Metrics Requirements

Based on user feedback, we need to expand our governance collection to include:

## Core Metrics (Missing/Incorrect)
- [ ] **Accurate User Count** - Currently shows 1, should show 11+ actual users
- [ ] **Test Coverage** - No test-related metrics being captured
- [ ] **Mock Servers** - Missing mock server metrics entirely
- [ ] **Historical Trends** - No time-series data for growth tracking

## Workspace Governance
- [ ] **Workspace Growth Over Time** - Historical workspace count trends
- [ ] **Naming Convention Violations** - Workspaces not following naming standards
- [ ] **Missing Asset IDs** - Workspaces without proper asset ID assignment
- [ ] **Missing Tags** - Workspaces without required tags
- [ ] **Missing Development Workspace Association** - Workspaces without linked dev environments
- [ ] **Workspace Type Mismatches** - Dev workspaces marked as team instead of private

## Collection Governance
- [ ] **Collections Growth Over Time** - Historical collection count trends
- [ ] **Naming Convention Violations** - Collections not following naming standards
- [ ] **Test Coverage Per Collection** - Which collections have/lack tests
- [ ] **Mock Server Coverage** - Collections with/without mock servers
- [ ] **API Specification Coverage** - Enhanced spec coverage tracking

## User & Team Metrics
- [ ] **User Growth Over Time** - Historical user count trends
- [ ] **Team Membership Tracking** - Users per team/workspace
- [ ] **Pull Requests/Merges** - Git-like collaboration metrics
- [ ] **Postbot Usage Over Time** - Historical Postbot interaction trends

## Enhanced Violations
- [ ] **Test Coverage Violations** - Collections without adequate tests
- [ ] **Mock Server Violations** - Collections that should have mocks but don't
- [ ] **Workspace Naming Violations** - Non-compliant workspace names
- [ ] **Asset ID Violations** - Workspaces missing required asset IDs
- [ ] **Tag Violations** - Workspaces/collections missing required tags
- [ ] **Environment Association Violations** - Missing dev/staging/prod links

## Time-Series Data
- [ ] **Daily/Weekly/Monthly Snapshots** - Historical data for all metrics
- [ ] **Growth Rate Calculations** - Month-over-month growth percentages
- [ ] **Trend Analysis** - Identifying improving vs declining metrics
- [ ] **Comparative Analysis** - Team-to-team governance comparisons

## Implementation Priority
1. **Fix Current Data Issues** - Accurate user counts, actual data collection
2. **Add Missing Core Metrics** - Test coverage, mock servers, proper violations
3. **Implement Historical Tracking** - Time-series data storage and trends
4. **Enhanced Governance Rules** - Naming conventions, asset IDs, tags
5. **Advanced Analytics** - Growth rates, comparative analysis