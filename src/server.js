require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const taskRoutes = require("./routes/tasks");
const walletRoutes = require("./routes/wallets");
const x402Routes = require("./routes/x402");
const reputationRoutes = require("./routes/reputation");
const cctpRoutes = require("./routes/cctp");

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
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
  // Example x402-protected endpoint: agent pays 0.01 USDC per call
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

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`NexusPay API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
});
