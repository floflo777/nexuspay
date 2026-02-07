require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { ethers } = require("ethers");

const taskRoutes = require("./routes/tasks");
const walletRoutes = require("./routes/wallets");
const x402Routes = require("./routes/x402");
const reputationRoutes = require("./routes/reputation");
const cctpRoutes = require("./routes/cctp");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API health check (moved from / to /api)
app.get("/api", (req, res) => {
  res.json({
    name: "NexusPay",
    version: "1.0.0",
    description: "Universal Agent Payment Layer - Any agent, any chain, zero gas, instant settlement",
    endpoints: {
      tasks: "/api/tasks",
      wallets: "/api/wallets",
      x402: "/api/x402",
      reputation: "/api/reputation",
      cctp: "/api/cctp",
    },
    contracts: {
      escrow: process.env.NEXUS_ESCROW_ADDRESS || "pending deployment",
      reputation: process.env.NEXUS_REPUTATION_ADDRESS || "pending deployment",
    },
    features: [
      "Milestone-based USDC escrow for agent tasks",
      "x402 HTTP-native micropayments (pay-per-API-call)",
      "Circle Programmable Wallets (gasless agent wallets)",
      "Cross-chain settlement via CCTP V2",
      "On-chain reputation and trust scores",
      "Circle Paymaster (gas paid in USDC)",
    ],
  });
});

// Routes
app.use("/api/tasks", taskRoutes);
app.use("/api/wallets", walletRoutes);
app.use("/api/x402", x402Routes);
app.use("/api/reputation", reputationRoutes);
app.use("/api/cctp", cctpRoutes);

// x402 payment verification middleware (for protected endpoints)
app.get("/api/x402/sentiment-analysis", require("./middleware/x402Paywall").paywall(10000), (req, res) => {
  res.json({
    service: "sentiment-analysis",
    result: {
      sentiment: "bullish",
      confidence: 0.87,
      tokens_analyzed: 1542,
      summary: "Strong positive sentiment detected across agent ecosystem discussions",
    },
    payment: { amount: "0.01", currency: "USDC", protocol: "x402" },
  });
});

app.get("/api/x402/data-enrichment", require("./middleware/x402Paywall").paywall(50000), (req, res) => {
  res.json({
    service: "data-enrichment",
    result: {
      agents_indexed: 2847,
      data_points: 156000,
      last_updated: new Date().toISOString(),
    },
    payment: { amount: "0.05", currency: "USDC", protocol: "x402" },
  });
});

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`NexusPay running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/`);
  console.log(`API: http://localhost:${PORT}/api`);

  // Auto-seed demo data
  if (process.env.SEED_DEMO === 'true') {
    setTimeout(() => {
      require('./seed')(PORT).then(() => {
        console.log('Demo data seeded successfully');
      }).catch(err => {
        console.error('Seed failed:', err.message);
      });
    }, 1000);
  }
});
