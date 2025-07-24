#!/bin/bash

# Deploy Postman Governance Collector Only
# For customers with existing Grafana/monitoring infrastructure

set -e

echo "🚀 Deploying Postman Governance Collector (API Only)..."

# Check if required tools are installed
command -v gcloud >/dev/null 2>&1 || { echo "❌ gcloud CLI required but not installed. Aborting." >&2; exit 1; }

# Get project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No Google Cloud project set. Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📋 Project: $PROJECT_ID"

# Prompt for API key if not provided
if [ -z "$POSTMAN_API_KEY" ]; then
    echo "🔑 Enter your Postman API key:"
    read -s POSTMAN_API_KEY
fi

if [ -z "$POSTMAN_API_KEY" ]; then
    echo "❌ Postman API key required"
    exit 1
fi

# Enable required APIs
echo "🔧 Enabling required Google Cloud APIs..."
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com cloudscheduler.googleapis.com --quiet

# Build and deploy collector
echo "🏗️  Building collector container..."
cd collector
gcloud builds submit --tag gcr.io/$PROJECT_ID/postman-governance-collector:latest . --quiet

echo "🚀 Deploying collector to Cloud Run..."
gcloud run deploy postman-governance-collector \
  --image gcr.io/$PROJECT_ID/postman-governance-collector:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --port 3001 \
  --set-env-vars NODE_ENV=production,API_PORT=3001,API_HOST=0.0.0.0,LOG_LEVEL=INFO,POSTMAN_API_KEY=$POSTMAN_API_KEY \
  --quiet

# Get service URL
SERVICE_URL=$(gcloud run services describe postman-governance-collector --platform managed --region us-central1 --format "value(status.url)")

# Set up automated collection
echo "⏰ Setting up automated data collection..."
gcloud scheduler jobs create http postman-governance-collection \
  --schedule="0 */6 * * *" \
  --uri="$SERVICE_URL/api/collect" \
  --http-method=POST \
  --location=us-central1 \
  --description="Automated Postman governance data collection every 6 hours" \
  --quiet 2>/dev/null || echo "   (Scheduler job already exists)"

echo ""
echo "✅ Deployment Complete!"
echo ""
echo "🔗 API URL: $SERVICE_URL"
echo "📊 Health Check: $SERVICE_URL/health"
echo "📈 Prometheus Metrics: $SERVICE_URL/metrics"
echo "🔄 Manual Collection: curl -X POST $SERVICE_URL/api/collect"
echo ""
echo "📚 API Documentation:"
echo "   • GET /health - System health status"
echo "   • GET /metrics - Prometheus format metrics"
echo "   • GET /api/governance/summary - Current metrics summary"
echo "   • GET /api/governance/metrics - Historical data"
echo "   • POST /api/collect - Trigger manual collection"
echo ""
echo "🎯 Use this API as a data source in your existing Grafana/monitoring setup"