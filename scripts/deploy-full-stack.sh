#!/bin/bash

# Deploy Complete Postman Governance Stack (Grafana + Collector)
# One-click executive demo deployment

set -e

echo "🚀 Deploying Complete Postman Governance Stack..."

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

# Build collector container
echo "🏗️  Building collector container..."
cd collector
gcloud builds submit --tag gcr.io/$PROJECT_ID/postman-governance-collector:latest . --quiet
cd ..

# Create Grafana container with embedded config
echo "🏗️  Building Grafana container with dashboards..."
cat > cloudbuild-grafana.yaml << 'EOF'
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: 
  - 'build'
  - '-t'
  - 'gcr.io/$PROJECT_ID/postman-governance-grafana:latest'
  - '-f'
  - 'Dockerfile.grafana'
  - '.'
images:
- 'gcr.io/$PROJECT_ID/postman-governance-grafana:latest'
EOF

cat > Dockerfile.grafana << 'EOF'
FROM grafana/grafana:11.6.2

USER root

# Install Infinity datasource plugin
RUN grafana cli --pluginsDir "/var/lib/grafana/plugins" plugins install yesoreyeram-infinity-datasource

# Copy configuration files
COPY config/grafana.ini /etc/grafana/grafana.ini
COPY config/datasources/ /etc/grafana/provisioning/datasources/
COPY config/dashboards/ /etc/grafana/provisioning/dashboards/

# Set permissions (UID 472 is the default grafana user)
RUN chown -R 472:0 /etc/grafana/provisioning /var/lib/grafana && \
    chmod -R 755 /etc/grafana/provisioning

USER 472

EXPOSE 3000
EOF

# Build Grafana with config
gcloud builds submit --config=cloudbuild-grafana.yaml . --quiet

# Deploy collector service
echo "🚀 Deploying collector service..."
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

# Get collector URL for Grafana config
COLLECTOR_URL=$(gcloud run services describe postman-governance-collector --platform managed --region us-central1 --format "value(status.url)")

# Deploy Grafana service
echo "🚀 Deploying Grafana dashboard..."
gcloud run deploy postman-governance-grafana \
  --image gcr.io/$PROJECT_ID/postman-governance-grafana:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --port 3000 \
  --set-env-vars GF_SECURITY_ADMIN_USER=admin,GF_SECURITY_ADMIN_PASSWORD=admin123,GF_SECURITY_DISABLE_GRAVATAR=true,GF_ANALYTICS_REPORTING_ENABLED=false,COLLECTOR_API_URL=$COLLECTOR_URL \
  --quiet

# Get Grafana URL
GRAFANA_URL=$(gcloud run services describe postman-governance-grafana --platform managed --region us-central1 --format "value(status.url)")

# Set up automated collection
echo "⏰ Setting up automated data collection..."
gcloud scheduler jobs create http postman-governance-collection \
  --schedule="0 */6 * * *" \
  --uri="$COLLECTOR_URL/api/collect" \
  --http-method=POST \
  --location=us-central1 \
  --description="Automated Postman governance data collection every 6 hours" \
  --quiet 2>/dev/null || echo "   (Scheduler job already exists)"

# Trigger initial collection
echo "🔄 Triggering initial data collection..."
curl -X POST $COLLECTOR_URL/api/collect >/dev/null 2>&1 || true

# Cleanup
rm -f Dockerfile.grafana cloudbuild-grafana.yaml

echo ""
echo "✅ Full Stack Deployment Complete!"
echo ""
echo "🎯 EXECUTIVE DEMO URLS:"
echo "   📊 Grafana Dashboard: $GRAFANA_URL"
echo "   🔧 API Backend: $COLLECTOR_URL"
echo ""
echo "🔐 Grafana Login:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "📈 Key Endpoints:"
echo "   • $COLLECTOR_URL/health - System health"
echo "   • $COLLECTOR_URL/metrics - Prometheus metrics"
echo "   • $COLLECTOR_URL/api/governance/summary - Current data"
echo ""
echo "🎉 Your executive demo is ready!"
echo "   Open: $GRAFANA_URL"