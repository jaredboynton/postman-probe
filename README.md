# 🚀 Introducing **Postman Probe**

### Real‑time API governance insights your execs can actually act on

> “This totally changes the way we communicate about our initiatives" — Early Design Partner

[Probe Dashboard](https://github.com/jaredboynton/postman-probe/blob/main/dashboard.png)

## Why Postman Probe?

Enterprise teams love Postman for hands‑on collaboration, but translating day‑to‑day activity into *board‑level progress* has always felt… manual. Probe closes that gap. It auto‑pulls usage & governance data straight from the Postman API, crunches it against your business objectives, and publishes a living dashboard the C‑suite can skim before their first coffee.

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

1. **Secure Service Account** — Probe uses a scoped Postman API key; no user passwords in sight.
2. **Containerized Collector** — Docker image polls, normalizes, and stores metrics (PostgreSQL by default).
3. **Instant Visualization** — We include Grafana dashboards, but swap in whatever BI tool your execs already trust.
4. **Webhook Rules Engine** *(optional)* — Trigger Jira tickets, Slack alerts, or PagerDuty incidents when thresholds tip.

Deploy on a laptop for a quick proof‑of‑concept or drop it into Kubernetes for scale—either way, setup is under 30 minutes.

## Jared's Two Cents 🧑‍💻

After hundreds of customer meetings, one pattern was clear: **great stories beat great stats**. Probe packages both. It lets platform teams walk into any QBR and say, *“Here’s the needle we moved this quarter—and here’s where we’re headed.”* That’s the conversation change that keeps budgets (and jobs) safe.
# Get Started Today

## 🚀 Quick Deploy Options

### Option 1: Executive Demo (Cloud Run) — Recommended

**For boardroom-ready demos and production use:**

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

### Option 2: Local Development

```bash
git clone https://github.com/jaredboynton/postman-probe.git
cd postman-probe
docker compose up -d
```

Paste your Postman API key when prompted.

Share the dashboard link with leadership—then take the weekend off.

---

**Need help with enterprise rollout?** Reach out — we love helping teams turn API chaos into executive clarity. 

Built with ♥ and way too much red bull
