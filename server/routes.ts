import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { Orchestrator } from "./orchestrator";
import { log } from "./index";

// Request validation schema
const queryRequestSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  propertyId: z.string().optional(),
  spreadsheetId: z.string().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize orchestrator
  const orchestrator = new Orchestrator();

  // POST /query - Main API endpoint
  app.post("/query", async (req, res) => {
    try {
      // Validate request body
      const validation = queryRequestSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request",
          details: validation.error.errors,
        });
      }

      const { query, propertyId, spreadsheetId } = validation.data;

      log(`Received query: "${query}" (propertyId: ${propertyId || 'none'})`, 'api');

      // Process query through orchestrator
      const result = await orchestrator.processQuery({
        query,
        propertyId,
        spreadsheetId,
      });

      // Return response
      const statusCode = result.success ? 200 : 500;
      return res.status(statusCode).json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Query endpoint error: ${errorMessage}`, 'api');
      
      return res.status(500).json({
        success: false,
        response: "Internal server error",
        error: errorMessage,
      });
    }
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  log('Routes registered: POST /query, GET /health', 'routes');

  return httpServer;
}
