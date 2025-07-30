# 🚀 Introducing **Postman Probe**

### Real‑time API governance insights your execs can actually act on

> “This totally changes the way we communicate about our initiatives" — Early Design Partner

![Postman Probe Dashboard](https://github.com/jaredboynton/postman-probe/blob/main/dashboard.png)

## Why Postman Probe?

Enterprise teams love Postman for hands‑on collaboration, but translating day‑to‑day activity into *API initiative progress* has always felt... wishy-washy. Probe closes that gap -- it auto‑pulls usage & governance data straight from the Postman API, diffs it against your business objectives, and publishes a living dashboard you can skim before your first coffee.

**No more:**

- Copy‑pasting metrics into slide decks every Friday
- Wondering whether increased request traffic = concrete ROI
- Chasing half the org for status updates on API inventory, testing, or governance

**Yes to:**

- Instant clarity on adoption, standardization, and risk trends
- KPIs framed in non‑technical language (time‑to‑market, reliability, audit readiness)
- Direct hooks into your existing BI stack (Grafana, Power BI, Tableau… you name it)

## What Probe Tracks out‑of‑the‑box

| Theme             | Example KPI                              | Why it Matters                 |
| ----------------- | ---------------------------------------- | ------------------------------ |
| **Adoption**      | % of active developers vs. licensed      | License ROI & enablement focus |
| **Quality**       | Collection test coverage & failure rate  | Shipping confidence            |
| **Governance**    | Specs that pass style & security linting | Reduced tech debt              |
| **Collaboration** | Cross‑team workspace contributions       | Silos dismantled               |
| **Risk**          | Unreviewed public APIs                   | Compliance pulse check         |

*(All metrics are customizable; plug in your own OKRs or regulatory thresholds.)*

## Under the Hood

1. **Secure Service Account** — Probe uses a scoped Postman API key; no user passwords
2. **Containerized Collector** — Docker image polls, normalizes, and stores metrics (PostgreSQL by default).
3. **Instant Visualization** — Grafana dashboards built in, but swap in whatever BI tool you already trust
4. **Webhook Rules Engine** *(optional)* — Trigger Jira tickets, Slack alerts, or PagerDuty incidents

## 🚀 Quick Deploy Options

### Option 1: Serverless

**For demo and production use:**

```bash
git clone https://github.com/jaredboynton/postman-probe.git
cd postman-probe
export POSTMAN_API_KEY="your-api-key-here"
./scripts/deploy-full-stack.sh
```

**What you get in 5 minutes:**
- 📊 **Live executive dashboard** with zero maintenance
- 🔧 **API endpoints** for PowerBI/Tableau integration  
- ⏰ **Auto-refreshing data** every 6 hours
- 🔒 **Enterprise security** with proper authentication
- 💰 **Serverless scaling** — only pay for what you use

**For teams with existing Grafana:**
```bash
./scripts/deploy-collector-only.sh
```

### Option 2: Local

```bash
git clone https://github.com/jaredboynton/postman-probe.git
cd postman-probe
docker compose up -d
```

Paste your Postman API key when prompted.
