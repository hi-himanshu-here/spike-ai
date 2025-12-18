Spike AI Builder – AI Analytics & SEO Backend
Overview

This project is a backend-only AI system built for the Spike AI Builder Hackathon.
It answers natural-language questions about Google Analytics 4 (GA4) and SEO audit data using a multi-agent architecture.

The system exposes a single HTTP API and dynamically routes user queries to specialized agents for analytics, SEO, or both.

No frontend is included or required.

Key Features

Natural Language Queries
Ask questions like:

“Top pages by traffic last 7 days”

“Which URLs are not using HTTPS?”

“Which high-traffic pages have SEO issues?”

Multi-Agent Architecture

Analytics Agent → GA4 Data API

SEO Agent → Google Sheets (Screaming Frog audit)

Orchestrator → Routes and combines results

Real Data, No Hardcoding

Uses live GA4 and Google Sheets APIs

No hardcoded property IDs or fake responses

Production-Style Error Handling

Graceful failures

No hallucinated results when data is missing

Clear explanations of limitations

Architecture
POST /query
   ↓
Orchestrator
   ↓
Intent Detection (LLM)
   ↓
Analytics Agent | SEO Agent | Both
   ↓
Data Fetch (GA4 / Sheets)
   ↓
LLM Explanation
   ↓
JSON Response

API Endpoints
Health Check
GET /health


Response:

{
  "status": "ok",
  "timestamp": "..."
}

Query Endpoint
POST /query

Request Body
{
  "propertyId": "GA4_PROPERTY_ID (optional)",
  "query": "Your natural language question",
  "spreadsheetId": "Google Sheet ID (optional)"
}


propertyId → Required for GA4 analytics queries

spreadsheetId → Optional (can also be set via env)

Example: Analytics Query
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "propertyId": "516821164",
    "query": "Top 5 pages by page views in the last 7 days"
  }'

Example: SEO Query
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Which URLs do not use HTTPS?"
  }'

Example: Multi-Agent Query
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "propertyId": "516821164",
    "query": "Which high traffic pages have SEO problems?"
  }'

Setup Instructions
1. Prerequisites

Node.js v18+

A Google Service Account

Access to:

Google Analytics Data API

Google Sheets API

Google Drive API

2. Add Credentials

Place your Google service account key at the project root:

credentials.json


This file must not be committed to GitHub.

3. Enable Google APIs

In the Google Cloud Console for your project:

Enable Google Analytics Data API

Enable Google Sheets API

Enable Google Drive API

4. Share Access

GA4:
Add the service account email as Viewer in GA4 Property Access.

Google Sheets:
Share the SEO spreadsheet with the service account email (Viewer).

5. Environment Variables
export LITELLM_API_KEY="your_spike_litellm_key"
export SEO_SPREADSHEET_ID="your_google_sheet_id"   # optional

6. Run the Server
bash deploy.sh


Server starts on:

http://localhost:3000

Tech Stack

Runtime: Node.js + TypeScript

Framework: Express.js

AI: LiteLLM (Gemini models)

Analytics: Google Analytics Data API

SEO Data: Google Sheets API

Validation: Zod

Design Decisions & Limitations

Backend-only by design
The challenge explicitly does not require a UI.

No data hallucination
If GA4 or SEO data is missing, the system explains the limitation instead of guessing.

External LLM dependency
Multi-agent queries depend on LiteLLM availability. The system includes retries and safe failure handling.

Security & Privacy

No credentials are hardcoded

API keys loaded via environment variables

Service account permissions are read-only

Submission Notes

This project demonstrates:

Real API integrations

Multi-agent orchestration

Production-style backend engineering

Clear separation of concerns

Honest handling of incomplete data

Author

Himanshu Tiwari
Spike AI Builder Hackathon Submission