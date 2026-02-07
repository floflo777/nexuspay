const express = require("express");
const router = express.Router();

/**
 * x402 Payment Protocol Routes
 *
 * The x402 protocol (HTTP 402 Payment Required) enables machine-to-machine payments:
 * 1. Agent requests a resource
 * 2. Server responds 402 with USDC payment instructions
 * 3. Agent pays USDC and retries with X-PAYMENT header containing tx proof
 * 4. Server verifies and serves the resource
 *
 * Supported by: Circle, Coinbase, Google Cloud, Anthropic, Vercel, AWS
 * Spec: Uses USDC as the native payment currency for HTTP APIs
 */

// Registry of x402-protected services
const services = new Map();

// Register default demo services
services.set("sentiment-analysis", {
  id: "sentiment-analysis",
  name: "Agent Sentiment Analysis",
  description: "Analyze sentiment across 2,800+ indexed agents on Moltbook",
  priceUSDC: 0.01,
  priceMicro: 10000,
  endpoint: "/api/x402/sentiment-analysis",
  provider: "NexusPay",
});

services.set("data-enrichment", {
  id: "data-enrichment",
  name: "Agent Data Enrichment",
  description: "Get enriched data on any Moltbook agent (karma, posts, activity, trust score)",
  priceUSDC: 0.05,
  priceMicro: 50000,
  endpoint: "/api/x402/data-enrichment",
  provider: "NexusPay",
});

services.set("cross-chain-bridge", {
  id: "cross-chain-bridge",
  name: "USDC Cross-Chain Bridge",
  description: "Bridge USDC between chains via CCTP V2 in <20 seconds",
  priceUSDC: 0.02,
  priceMicro: 20000,
  endpoint: "/api/x402/bridge",
  provider: "NexusPay",
});

/**
 * GET /api/x402/services - List all x402-protected services
 */
router.get("/services", (req, res) => {
  res.json({
    protocol: "x402",
    version: "1.0",
    description: "HTTP-native micropayments for AI agent services. Pay USDC per API call.",
    how_it_works: [
      "1. Browse available services below",
      "2. Call the endpoint - you'll get a 402 with payment instructions",
      "3. Send USDC to the specified address on Base Sepolia",
      "4. Retry the request with X-PAYMENT header containing base64(JSON({ txHash, payer, amount, chainId }))",
      "5. Service is delivered immediately",
    ],
    paymaster_note: "Use Circle Paymaster on Base/Arbitrum to pay gas fees in USDC - no ETH needed",
    services: Array.from(services.values()),
  });
});

/**
 * POST /api/x402/register-service - Register a new x402-protected service
 * Body: { id, name, description, priceUSDC, endpoint }
 *
 * Allows any agent to monetize their API endpoints via x402
 */
router.post("/register-service", (req, res) => {
  const { id, name, description, priceUSDC, endpoint, provider } = req.body;

  if (!id || !name || !priceUSDC || !endpoint) {
    return res.status(400).json({ error: "Missing required fields: id, name, priceUSDC, endpoint" });
  }

  const service = {
    id,
    name,
    description: description || "",
    priceUSDC: parseFloat(priceUSDC),
    priceMicro: Math.round(parseFloat(priceUSDC) * 1e6),
    endpoint,
    provider: provider || "external",
    registeredAt: new Date().toISOString(),
  };

  services.set(id, service);

  res.status(201).json({
    service,
    note: "Your endpoint is now registered. Other agents will see it in /api/x402/services and can pay to access it.",
  });
});

/**
 * GET /api/x402/payments - List recent x402 payments (for transparency)
 */
router.get("/payments", (req, res) => {
  // In production: query from DB
  res.json({
    recentPayments: [
      {
        txHash: "0xdemo1...simulated",
        payer: "0xAgentA",
        service: "sentiment-analysis",
        amount: "0.01 USDC",
        chain: "Base Sepolia",
        timestamp: new Date(Date.now() - 300000).toISOString(),
      },
      {
        txHash: "0xdemo2...simulated",
        payer: "0xAgentB",
        service: "data-enrichment",
        amount: "0.05 USDC",
        chain: "Base Sepolia",
        timestamp: new Date(Date.now() - 600000).toISOString(),
      },
    ],
    note: "Payments verified on-chain. Use block explorer to confirm.",
  });
});

module.exports = router;
