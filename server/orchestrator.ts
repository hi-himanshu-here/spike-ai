import { litellm } from './lib/litellm';
import { AnalyticsAgent } from './agents/analytics-agent';
import { SEOAgent } from './agents/seo-agent';
import { log } from './index';
import type { AnalyticsResponse } from './agents/analytics-agent';


export interface QueryRequest {
  query: string;
  propertyId?: string;
  spreadsheetId?: string;
}

export interface OrchestratorResponse {
  success: boolean;
  response: string;
  data?: any;
  metadata?: {
    intent: string;
    agentsUsed: string[];
    processingTime: number;
  };
  error?: string;
}

type AgentType = 'analytics' | 'seo' | 'both';

export class Orchestrator {
  private analyticsAgent: AnalyticsAgent;
  private seoAgent: SEOAgent;

  constructor() {
    this.analyticsAgent = new AnalyticsAgent();
    this.seoAgent = new SEOAgent();
    log('Orchestrator initialized', 'orchestrator');
  }

  async processQuery(request: QueryRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now();

    try {
      log(`Processing query: "${request.query}"`, 'orchestrator');

      
      const intent = await this.detectIntent(request.query, request.propertyId);
      log(`Detected intent: ${intent}`, 'orchestrator');

      
      let response: OrchestratorResponse;

      switch (intent) {
        case 'analytics':
          response = await this.routeToAnalytics(request);
          break;
        case 'seo':
          response = await this.routeToSEO(request);
          break;
        case 'both':
          response = await this.routeToBoth(request);
          break;
        default:
          throw new Error(`Unknown intent: ${intent}`);
      }

      // Add metadata
      response.metadata = {
        intent,
        agentsUsed: intent === 'both' ? ['analytics', 'seo'] : [intent],
        processingTime: Date.now() - startTime,
      };

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Orchestrator error: ${errorMessage}`, 'orchestrator');
      return {
        success: false,
        response: `Failed to process query: ${errorMessage}`,
        error: errorMessage,
        metadata: {
          intent: 'unknown',
          agentsUsed: [],
          processingTime: Date.now() - startTime,
        },
      };
    }
  }

  private async detectIntent(query: string, propertyId?: string): Promise<AgentType> {
    
    const hasPropertyId = !!propertyId;

    const prompt = `You are an intent classifier. Determine if this question is about:
- "analytics": Google Analytics, GA4, website traffic, user behavior, page views, sessions
- "seo": SEO audit, Screaming Frog, URLs, indexability, meta tags, title tags, HTTPS
- "both": Requires both analytics AND SEO data (e.g., "top pages by views with their title tags")

Question: "${query}"
Has GA4 Property ID: ${hasPropertyId}

Rules:
- If the question mentions specific metrics (page views, users, sessions), it's "analytics"
- If it mentions SEO elements (title tags, meta descriptions, indexability), it's "seo"
- If it requires combining both types of data, it's "both"
- If propertyId is provided and question is about analytics, it's "analytics"

Return ONLY one word: "analytics", "seo", or "both"`;

    const response = await litellm.chat(
      [
        { role: 'system', content: 'You are an intent classifier. Return only: analytics, seo, or both' },
        { role: 'user', content: prompt },
      ],
      'gemini-2.5-flash',
      { temperature: 0.2 }
    );

    const intent = response.trim().toLowerCase();
    if (!['analytics', 'seo', 'both'].includes(intent)) {
      // Fallback logic
      if (hasPropertyId) return 'analytics';
      if (query.toLowerCase().includes('seo') || query.toLowerCase().includes('title') || query.toLowerCase().includes('meta')) {
        return 'seo';
      }
      return 'analytics';
    }

    return intent as AgentType;
  }

  private async routeToAnalytics(request: QueryRequest): Promise<OrchestratorResponse> {
    if (!request.propertyId) {
      return {
        success: false,
        response: 'Analytics queries require a propertyId. Please provide a GA4 property ID in your request.',
        error: 'Missing propertyId',
      };
    }

    const result = await this.analyticsAgent.processQuery({
      propertyId: request.propertyId,
      query: request.query,
    });

    return {
      success: result.success,
      response: result.explanation,
      data: result.data,
      error: result.error,
    };
  }

  private async routeToSEO(request: QueryRequest): Promise<OrchestratorResponse> {
    const result = await this.seoAgent.processQuery({
      query: request.query,
      spreadsheetId: request.spreadsheetId,
    });

    return {
      success: result.success,
      response: result.explanation,
      data: result.data,
      error: result.error,
    };
  }

  private async routeToBoth(request: QueryRequest): Promise<OrchestratorResponse> {
    // Execute both agents in parallel
    const [analyticsResult, seoResult] = await Promise.all([
      request.propertyId
        ? this.analyticsAgent.processQuery({
            propertyId: request.propertyId,
            query: request.query,
          })
        : Promise.resolve<AnalyticsResponse>({success: false,explanation: 'No propertyId provided',error: 'Missing propertyId',}),
      this.seoAgent.processQuery({
        query: request.query,
        spreadsheetId: request.spreadsheetId,
      }),
    ]);

    // Aggregate responses
    const aggregatedResponse = await this.aggregateResponses(request.query, analyticsResult, seoResult);

    return {
      success: analyticsResult.success && seoResult.success,
      response: aggregatedResponse,
      data: {
        analytics: analyticsResult.success ? analyticsResult.data : null,
        seo: seoResult.data,
      },
    };
  }

  private async aggregateResponses(query: string, analyticsResult: any, seoResult: any): Promise<string> {
    const prompt = `You are a data analyst. Combine insights from both Analytics and SEO data to answer this question.

Question: "${query}"

Analytics Results:
${analyticsResult.explanation}

SEO Results:
${seoResult.explanation}

Provide a unified answer that:
1. Combines insights from both sources
2. Directly answers the user's question
3. Highlights correlations or patterns
4. Is clear and actionable

Keep it under 250 words.`;

    return await litellm.chat(
      [
        { role: 'system', content: 'You are a comprehensive data analyst.' },
        { role: 'user', content: prompt },
      ],
      'gemini-2.5-flash',
      { temperature: 0.7 }
    );
  }
}
