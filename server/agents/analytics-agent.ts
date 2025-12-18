/**
 * Analytics Agent (Tier 1)
 * Handles GA4 queries using Google Analytics Data API
 */

import { google } from 'googleapis';
import { litellm } from '../lib/litellm';
import { log } from '../index';

export interface AnalyticsQuery {
  propertyId: string;
  query: string;
}

export interface AnalyticsResponse {
  success: boolean;
  data?: any;
  explanation: string;
  error?: string;
}

// Allowlist of valid GA4 metrics and dimensions
const VALID_METRICS = [
  'activeUsers',
  'sessions',
  'screenPageViews',
  'eventCount',
  'conversions',
  'totalRevenue',
  'averageSessionDuration',
  'bounceRate',
  'engagementRate',
  'newUsers',
  'userEngagementDuration',
  'sessionConversionRate',
];

const VALID_DIMENSIONS = [
  'date',
  'pagePath',
  'pageTitle',
  'country',
  'city',
  'deviceCategory',
  'browser',
  'operatingSystem',
  'sessionSource',
  'sessionMedium',
  'sessionCampaignName',
  'landingPage',
  'eventName',
];

export class AnalyticsAgent {
  private analyticsDataClient: any;

  constructor() {
    this.initializeClient();
  }

  private initializeClient() {
    try {
      // Load credentials from credentials.json at runtime
      const auth = new google.auth.GoogleAuth({
        keyFile: './credentials.json',
        scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
      });

      this.analyticsDataClient = google.analyticsdata({
        version: 'v1beta',
        auth,
      });

      log('Analytics Agent initialized with credentials.json', 'analytics-agent');
    } catch (error) {
      console.error('Failed to initialize Analytics Agent:', error);
      throw new Error('Analytics Agent initialization failed. Ensure credentials.json exists at project root.');
    }
  }

  async processQuery(query: AnalyticsQuery): Promise<AnalyticsResponse> {
    try {
      log(`Processing GA4 query for property ${query.propertyId}`, 'analytics-agent');

      // Step 1: Use LLM to infer metrics, dimensions, and date ranges
      const reportingPlan = await this.inferReportingPlan(query.query);

      // Step 2: Validate against allowlist
      this.validateFields(reportingPlan);

      // Step 3: Execute GA4 query
      const ga4Data = await this.executeGA4Query(query.propertyId, reportingPlan);

      // Step 4: Generate natural-language explanation
      const explanation = await this.generateExplanation(query.query, reportingPlan, ga4Data);

      return {
        success: true,
        data: ga4Data,
        explanation,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Analytics Agent error: ${errorMessage}`, 'analytics-agent');
      return {
        success: false,
        explanation: `Failed to process analytics query: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  private async inferReportingPlan(query: string): Promise<any> {
    const prompt = `You are a Google Analytics 4 expert. Given a natural-language analytics question, infer the GA4 reporting plan.

Available metrics: ${VALID_METRICS.join(', ')}
Available dimensions: ${VALID_DIMENSIONS.join(', ')}

Question: "${query}"

Return a JSON object with this structure:
{
  "metrics": ["metric1", "metric2"],
  "dimensions": ["dimension1"],
  "dateRanges": [{"startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}],
  "orderBy": [{"metric": {"metricName": "metricName"}, "desc": true}],
  "limit": 10
}

Rules:
- Use ONLY metrics and dimensions from the lists above
- For "last N days", calculate dates from today
- For "previous period", create two date ranges
- Include orderBy only if sorting is implied
- Set appropriate limit (default 10)

Return ONLY valid JSON, no explanation.`;

    const response = await litellm.chat(
      [
        { role: 'system', content: 'You are a GA4 reporting expert. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      'gemini-2.5-flash',
      { temperature: 0.3 }
    );

    // Clean response and parse JSON
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse reporting plan from LLM response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  private validateFields(plan: any): void {
    // Validate metrics
    for (const metric of plan.metrics || []) {
      if (!VALID_METRICS.includes(metric)) {
        throw new Error(`Invalid metric: ${metric}. Must be one of: ${VALID_METRICS.join(', ')}`);
      }
    }

    // Validate dimensions
    for (const dimension of plan.dimensions || []) {
      if (!VALID_DIMENSIONS.includes(dimension)) {
        throw new Error(`Invalid dimension: ${dimension}. Must be one of: ${VALID_DIMENSIONS.join(', ')}`);
      }
    }
  }

  private async executeGA4Query(propertyId: string, plan: any): Promise<any> {
    const request = {
      property: `properties/${propertyId}`,
      dateRanges: plan.dateRanges,
      dimensions: plan.dimensions?.map((name: string) => ({ name })) || [],
      metrics: plan.metrics?.map((name: string) => ({ name })) || [],
      limit: plan.limit || 10,
      orderBys: plan.orderBy || [],
    };

    log(`Executing GA4 query: ${JSON.stringify(request)}`, 'analytics-agent');

    const response = await this.analyticsDataClient.properties.runReport({
      property: request.property,
      requestBody: request,
    });

    return response.data;
  }

  private async generateExplanation(query: string, plan: any, data: any): Promise<string> {
    const prompt = `You are a data analyst. Explain the following GA4 results in natural language.

User Question: "${query}"

Query Details:
- Metrics: ${plan.metrics.join(', ')}
- Dimensions: ${plan.dimensions.join(', ')}
- Date Range: ${JSON.stringify(plan.dateRanges)}

GA4 Results:
${JSON.stringify(data, null, 2)}

Provide a clear, concise explanation that:
1. Directly answers the user's question
2. Highlights key findings and trends
3. Mentions if data is empty or sparse
4. Uses natural language (avoid technical jargon)

Keep it under 200 words.`;

    return await litellm.chat(
      [
        { role: 'system', content: 'You are a helpful data analyst.' },
        { role: 'user', content: prompt },
      ],
      'gemini-2.5-flash',
      { temperature: 0.7 }
    );
  }
}
