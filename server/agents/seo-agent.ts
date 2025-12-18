/**
 * SEO Agent (Tier 2)
 * Handles SEO queries from Screaming Frog Google Sheets data
 */

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { litellm } from '../lib/litellm';
import { log } from '../index';

export interface SEOQuery {
  query: string;
  spreadsheetId?: string;
}

export interface SEOResponse {
  success: boolean;
  data?: any;
  explanation: string;
  error?: string;
}

export class SEOAgent {
  private serviceAccountAuth: JWT | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initializeAuth();
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private async initializeAuth() {
    try {
      // Load credentials from credentials.json using dynamic import
      const fs = await import('fs');
      const path = await import('path');
      const credPath = path.resolve(process.cwd(), 'credentials.json');
      const credsData = fs.readFileSync(credPath, 'utf8');
      const creds = JSON.parse(credsData);
      
      this.serviceAccountAuth = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      log('SEO Agent initialized with credentials.json', 'seo-agent');
    } catch (error) {
      console.error('Failed to initialize SEO Agent:', error);
      throw new Error('SEO Agent initialization failed. Ensure credentials.json exists at project root.');
    }
  }

  async processQuery(query: SEOQuery): Promise<SEOResponse> {
    try {
      await this.ensureInitialized();
      log(`Processing SEO query`, 'seo-agent');

      // Get spreadsheet ID from query or environment
      const spreadsheetId = query.spreadsheetId || process.env.SEO_SPREADSHEET_ID;
      if (!spreadsheetId) {
        throw new Error('No spreadsheet ID provided. Set SEO_SPREADSHEET_ID or include in request.');
      }

      // Step 1: Load Google Sheet data
      const sheetData = await this.loadSpreadsheetData(spreadsheetId);

      // Step 2: Use LLM to generate filtering/aggregation plan
      const dataPlan = await this.inferDataPlan(query.query, sheetData);

      // Step 3: Execute data operations
      const results = await this.executeDataOperations(sheetData, dataPlan);

      // Step 4: Generate explanation
      const explanation = await this.generateExplanation(query.query, results);

      return {
        success: true,
        data: results,
        explanation,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`SEO Agent error: ${errorMessage}`, 'seo-agent');
      return {
        success: false,
        explanation: `Failed to process SEO query: ${errorMessage}`,
        error: errorMessage,
      };
    }
  }

  private async loadSpreadsheetData(spreadsheetId: string): Promise<any[]> {
    const doc = new GoogleSpreadsheet(spreadsheetId, this.serviceAccountAuth!);
    await doc.loadInfo();

    log(`Loaded spreadsheet: ${doc.title}`, 'seo-agent');

    // Get first sheet
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    // Convert to JSON
    const data = rows.map(row => {
      const obj: any = {};
      sheet.headerValues.forEach(header => {
        obj[header] = row.get(header);
      });
      return obj;
    });

    log(`Loaded ${data.length} rows from spreadsheet`, 'seo-agent');
    return data;
  }

  private async inferDataPlan(query: string, sampleData: any[]): Promise<any> {
    const columns = Object.keys(sampleData[0] || {});
    const sampleRows = sampleData.slice(0, 3);

    const prompt = `You are a data analysis expert. Given a natural-language SEO question and spreadsheet data, create a data processing plan.

Available columns: ${columns.join(', ')}

Sample data:
${JSON.stringify(sampleRows, null, 2)}

Question: "${query}"

Return a JSON object with this structure:
{
  "operation": "filter" | "aggregate" | "group" | "calculate",
  "filters": [{"column": "columnName", "operator": "==|!=|>|<|contains", "value": "value"}],
  "groupBy": "columnName",
  "sortBy": {"column": "columnName", "desc": true},
  "limit": 10,
  "outputFormat": "natural" | "json"
}

Return ONLY valid JSON.`;

    const response = await litellm.chat(
      [
        { role: 'system', content: 'You are a data processing expert. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      'gemini-2.5-flash',
      { temperature: 0.3 }
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse data plan from LLM response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  private async executeDataOperations(data: any[], plan: any): Promise<any> {
    let result = [...data];

    // Apply filters
    if (plan.filters && plan.filters.length > 0) {
      for (const filter of plan.filters) {
        result = result.filter(row => {
          const value = row[filter.column];
          switch (filter.operator) {
            case '==':
              return value == filter.value;
            case '!=':
              return value != filter.value;
            case '>':
              return parseFloat(value) > parseFloat(filter.value);
            case '<':
              return parseFloat(value) < parseFloat(filter.value);
            case 'contains':
              return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
            default:
              return true;
          }
        });
      }
    }

    // Apply grouping
    if (plan.groupBy) {
      const groups: any = {};
      result.forEach(row => {
        const key = row[plan.groupBy];
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(row);
      });
      result = Object.entries(groups).map(([key, items]) => ({
        [plan.groupBy]: key,
        count: (items as any[]).length,
        items: items,
      }));
    }

    // Apply sorting
    if (plan.sortBy) {
      result.sort((a, b) => {
        const aVal = a[plan.sortBy.column];
        const bVal = b[plan.sortBy.column];
        const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        return plan.sortBy.desc ? -comparison : comparison;
      });
    }

    // Apply limit
    if (plan.limit) {
      result = result.slice(0, plan.limit);
    }

    return {
      plan,
      resultCount: result.length,
      results: result,
    };
  }

  private async generateExplanation(query: string, results: any): Promise<string> {
    const prompt = `You are an SEO expert. Explain the following SEO analysis results.

User Question: "${query}"

Results:
${JSON.stringify(results, null, 2)}

Provide a clear, actionable explanation that:
1. Directly answers the user's question
2. Highlights SEO risks or opportunities
3. Provides context (e.g., "X out of Y pages")
4. Uses natural language

Keep it under 200 words.`;

    return await litellm.chat(
      [
        { role: 'system', content: 'You are an SEO consultant.' },
        { role: 'user', content: prompt },
      ],
      'gemini-2.5-flash',
      { temperature: 0.7 }
    );
  }
}
