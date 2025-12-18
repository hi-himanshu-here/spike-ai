# Architecture Diagram - Spike AI Builder System

## System Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                 CLIENT                                   │
│                         (Evaluator / API Consumer)                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 │ HTTP POST
                                 │ /query
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API LAYER (Port 8080)                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  POST /query                                                    │    │
│  │  - Zod schema validation (propertyId, query, spreadsheetId)    │    │
│  │  - Request logging                                             │    │
│  │  - Error handling                                              │    │
│  └────────────────────┬───────────────────────────────────────────┘    │
└───────────────────────┼────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            ORCHESTRATOR                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  1. INTENT DETECTION (LiteLLM)                                   │  │
│  │     ┌───────────────────────────────────────────────────┐       │  │
│  │     │ Analyze query + context (propertyId present?)     │       │  │
│  │     │ Classify: "analytics" | "seo" | "both"            │       │  │
│  │     │ Model: gemini-2.5-flash (low temp for accuracy)   │       │  │
│  │     └───────────────────────────────────────────────────┘       │  │
│  │                                                                   │  │
│  │  2. AGENT ROUTING                                                │  │
│  │     ┌───────────────┬─────────────────┬─────────────────┐       │  │
│  │     │ Analytics     │      SEO        │      Both       │       │  │
│  │     │ (propertyId   │   (no props     │  (parallel      │       │  │
│  │     │  required)    │    required)    │   execution)    │       │  │
│  │     └───────┬───────┴────────┬────────┴────────┬────────┘       │  │
│  │             │                 │                 │                │  │
│  │             ▼                 ▼                 ▼                │  │
│  │     ┌───────────────┬─────────────────┬─────────────────┐       │  │
│  │     │ Route to      │  Route to       │  Route to       │       │  │
│  │     │ Analytics     │  SEO Agent      │  BOTH agents    │       │  │
│  │     │ Agent         │                 │  (Promise.all)  │       │  │
│  │     └───────┬───────┴────────┬────────┴────────┬────────┘       │  │
│  │             │                 │                 │                │  │
│  │  3. RESPONSE AGGREGATION                       │                │  │
│  │     ┌───────────────────────────────────────────┘                │  │
│  │     │ For "both": Combine insights using LiteLLM                │  │
│  │     │ Generate unified natural-language response                │  │
│  │     └────────────────────────────────────────────────────────   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────┬─────────────────────────────┬───────────────────────────────┘
            │                             │
            ▼                             ▼
┌───────────────────────────┐  ┌──────────────────────────────┐
│   ANALYTICS AGENT         │  │      SEO AGENT               │
│   (Tier 1)                │  │      (Tier 2)                │
├───────────────────────────┤  ├──────────────────────────────┤
│                           │  │                              │
│ 1. LLM Planning           │  │ 1. Load Google Sheet         │
│    ┌─────────────────┐    │  │    ┌────────────────────┐   │
│    │ Input: NL query │    │  │    │ Google Sheets API  │   │
│    │ Output: JSON    │    │  │    │ credentials.json   │   │
│    │ {               │    │  │    │ First sheet        │   │
│    │   metrics,      │    │  │    │ Dynamic columns    │   │
│    │   dimensions,   │    │  │    └────────────────────┘   │
│    │   dateRanges,   │    │  │                              │
│    │   orderBy       │    │  │ 2. LLM Data Planning         │
│    │ }               │    │  │    ┌────────────────────┐   │
│    └─────────────────┘    │  │    │ Input: Query +     │   │
│                           │  │    │        columns      │   │
│ 2. Validation             │  │    │ Output: Operation  │   │
│    ┌─────────────────┐    │  │    │ {                  │   │
│    │ Check against   │    │  │    │   filters,         │   │
│    │ VALID_METRICS   │    │  │    │   groupBy,         │   │
│    │ VALID_DIMENSIONS│    │  │    │   sortBy,          │   │
│    │ Reject invalid  │    │  │    │   limit            │   │
│    └─────────────────┘    │  │    │ }                  │   │
│                           │  │    └────────────────────┘   │
│ 3. GA4 API Call           │  │                              │
│    ┌─────────────────┐    │  │ 3. Execute Operations        │
│    │ Google Analytics│    │  │    ┌────────────────────┐   │
│    │ Data API v1beta │    │  │    │ Filter rows        │   │
│    │ credentials.json│    │  │    │ Group by column    │   │
│    │ Dynamic         │    │  │    │ Sort results       │   │
│    │ propertyId      │    │  │    │ Apply limit        │   │
│    │ runReport()     │    │  │    └────────────────────┘   │
│    └─────────────────┘    │  │                              │
│                           │  │ 4. LLM Explanation           │
│ 4. LLM Explanation        │  │    ┌────────────────────┐   │
│    ┌─────────────────┐    │  │    │ Natural language   │   │
│    │ Natural language│    │  │    │ SEO insights       │   │
│    │ Trend analysis  │    │  │    │ Actionable advice  │   │
│    │ Key metrics     │    │  │    │ JSON if requested  │   │
│    └─────────────────┘    │  │    └────────────────────┘   │
│                           │  │                              │
└───────────────────────────┘  └──────────────────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────────────────────────────────────────┐
│                    LITELLM CLIENT                          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Base URL: http://3.110.18.218                       │ │
│  │  Auth: Bearer $LITELLM_API_KEY                       │ │
│  │  Models: gemini-2.5-flash (default)                  │ │
│  │          gemini-2.5-pro                              │ │
│  │          gemini-3-pro-preview                        │ │
│  │  Retry Logic: Exponential backoff (3 attempts)       │ │
│  │  Rate Limit: 429 → 1s, 2s, 4s backoff               │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────┐
│                EXTERNAL DATA SOURCES                       │
│  ┌──────────────────────┐  ┌─────────────────────────┐   │
│  │ Google Analytics 4   │  │ Google Sheets           │   │
│  │ - Live API access    │  │ - Screaming Frog data   │   │
│  │ - Property-agnostic  │  │ - Schema detection      │   │
│  │ - Evaluator-safe     │  │ - Live ingestion        │   │
│  └──────────────────────┘  └─────────────────────────┘   │
└───────────────────────────────────────────────────────────┘
```

## Agent Interactions

### Tier 1: Analytics Only

```
User Query: "Page views for /pricing last 14 days"
     │
     ├─→ Orchestrator → Intent: "analytics"
     │
     └─→ Analytics Agent
           │
           ├─→ LLM: Infer metrics ["screenPageViews"], dimensions ["date", "pagePath"]
           ├─→ Validate: ✓ All fields in allowlist
           ├─→ GA4 API: runReport(propertyId, dateRanges, metrics, dimensions)
           ├─→ LLM: Generate explanation from results
           │
           └─→ Return: {success, data, explanation}
```

### Tier 2: SEO Only

```
User Query: "Pages with title tags > 60 characters"
     │
     ├─→ Orchestrator → Intent: "seo"
     │
     └─→ SEO Agent
           │
           ├─→ Load Google Sheet (first sheet, all rows)
           ├─→ LLM: Infer filter {column: "Title", operator: ">", value: 60}
           ├─→ Execute: Filter rows where title.length > 60
           ├─→ LLM: Generate SEO insights
           │
           └─→ Return: {success, data, explanation}
```

### Tier 3: Multi-Agent

```
User Query: "Top 10 pages by views with their title tags"
     │
     ├─→ Orchestrator → Intent: "both"
     │
     ├─→ Promise.all([
     │     Analytics Agent → GA4: Top 10 by pageViews
     │     SEO Agent → Sheet: All title tags
     │   ])
     │
     ├─→ Orchestrator → Aggregate:
     │     │
     │     └─→ LLM: Combine analytics + SEO data
     │           "Pages X, Y, Z have highest views. Their titles are..."
     │
     └─→ Return: {success, data: {analytics, seo}, explanation}
```

## Data Flow - End-to-End Example

**Request**:
```json
POST /query
{
  "propertyId": "123456789",
  "query": "What are the top 5 pages by views in the last 7 days?"
}
```

**Processing**:
1. API Layer validates request → propertyId ✓, query ✓
2. Orchestrator calls LiteLLM → Intent: "analytics"
3. Routes to Analytics Agent
4. Analytics Agent:
   - LLM infers: metrics=["screenPageViews"], dimensions=["pagePath"], dateRanges=[{startDate: "2025-12-11", endDate: "2025-12-18"}]
   - Validates: screenPageViews ✓, pagePath ✓
   - Calls GA4 API with propertyId="123456789"
   - Receives data: [{pagePath: "/home", pageViews: 1234}, ...]
   - LLM generates: "The top 5 pages by views are..."
5. Orchestrator returns response

**Response**:
```json
{
  "success": true,
  "response": "The top 5 pages by views in the last 7 days are:\n1. /home (1,234 views)\n2. /pricing (987 views)...",
  "data": {
    "dimensionHeaders": [...],
    "rows": [...]
  },
  "metadata": {
    "intent": "analytics",
    "agentsUsed": ["analytics"],
    "processingTime": 1847
  }
}
```

## Error Handling Flow

```
┌──────────────┐
│  API Error   │ → 400 Bad Request (validation fails)
└──────────────┘

┌──────────────┐
│  Orchestrator│ → Catches agent errors
│  Error       │ → Returns 500 with structured error
└──────────────┘

┌──────────────┐
│ Analytics    │ → Catches GA4 API errors
│ Agent Error  │ → Returns {success: false, error: "..."}
└──────────────┘

┌──────────────┐
│  SEO Agent   │ → Catches Sheets API errors
│  Error       │ → Returns {success: false, error: "..."}
└──────────────┘

┌──────────────┐
│  LiteLLM     │ → 429 Rate Limit → Exponential backoff (3 retries)
│  Error       │ → Other errors → Throw with context
└──────────────┘
```

## Deployment Architecture

```
┌────────────────────────────────────────────────────┐
│              Deployment Environment                 │
│  (Replit Workspace or Evaluator Machine)           │
│                                                     │
│  ┌────────────────────────────────────────────┐    │
│  │  credentials.json (at project root)        │    │
│  │  - Service account credentials             │    │
│  │  - GA4 Data API access                     │    │
│  │  - Sheets API access                       │    │
│  │  - Replaced by evaluators during testing   │    │
│  └────────────────────────────────────────────┘    │
│                                                     │
│  ┌────────────────────────────────────────────┐    │
│  │  Environment Variables                     │    │
│  │  - LITELLM_API_KEY (required)              │    │
│  │  - SEO_SPREADSHEET_ID (optional)           │    │
│  │  - PORT (defaults to 8080)                 │    │
│  └────────────────────────────────────────────┘    │
│                                                     │
│  ┌────────────────────────────────────────────┐    │
│  │  deploy.sh                                 │    │
│  │  1. npm install                            │    │
│  │  2. Verify credentials.json                │    │
│  │  3. PORT=8080 npm run dev (background)     │    │
│  │  4. Health check /health                   │    │
│  │  5. Exit if unhealthy                      │    │
│  └────────────────────────────────────────────┘    │
│                                                     │
│  ┌────────────────────────────────────────────┐    │
│  │  Server (Port 8080)                        │    │
│  │  - Express app                             │    │
│  │  - POST /query                             │    │
│  │  - GET /health                             │    │
│  └────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────┘
```

## Extension Points

The system is designed to easily add new agents:

```typescript
// New agent interface
interface Agent {
  processQuery(query: any): Promise<AgentResponse>;
}

// Register in orchestrator.ts
private weatherAgent: WeatherAgent;  // New agent

// Add to intent detection
type AgentType = 'analytics' | 'seo' | 'weather' | 'both';

// Add routing logic
case 'weather':
  return await this.routeToWeather(request);
```

This architecture supports unlimited domain expansion while maintaining the core orchestration pattern.
