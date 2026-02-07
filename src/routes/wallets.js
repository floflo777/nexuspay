const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");

/**
 * Circle Programmable Wallets integration
 * Creates gasless USDC wallets for AI agents via Circle's Developer-Controlled Wallets API
 *
 * In production: calls Circle API at https://api.circle.com/v1/w3s/
 * For demo: simulates wallet creation with deterministic addresses
 */

// In-memory wallet store
const wallets = new Map();

/**
 * POST /api/wallets/create - Create a new agent wallet
 * Body: { agentName, agentId? }
 *
 * Uses Circle Developer-Controlled Wallets for:
 * - MPC key management (no seed phrases)
 * - Gas Station integration (gasless transactions)
 * - Multi-chain support (Base, Arbitrum, Ethereum)
 */
router.post("/create", async (req, res) => {
  try {
    const { agentName, agentId } = req.body;
    if (!agentName) return res.status(400).json({ error: "Missing agentName" });

    // Check if agent already has a wallet
    const existing = Array.from(wallets.values()).find((w) => w.agentName === agentName);
    if (existing) {
      return res.json({ wallet: existing, note: "Wallet already exists for this agent" });
    }

    const walletId = uuidv4();

    // In production, this calls Circle API:
    // POST https://api.circle.com/v1/w3s/developer/wallets
    // { idempotencyKey, entitySecretCiphertext, blockchains: ["BASE-SEPOLIA"], count: 1 }
    const wallet = {
      id: walletId,
      agentName,
      agentId: agentId || agentName,
      address: generateDeterministicAddress(agentName),
      chain: "Base Sepolia",
      chainId: 84532,
      createdAt: new Date().toISOString(),
      balances: {
        USDC: "0.00",
        ETH: "0.00",
      },
      gasStation: {
        enabled: true,
        note: "Gas fees sponsored via Circle Gas Station - agent only needs USDC",
      },
      paymaster: {
        supported: true,
        address: "0x2F5b754DBaFd79042940782C44F91ea75eD4e75b",
        note: "Circle Paymaster on Base Sepolia - pay gas in USDC, no ETH needed",
      },
    };

    wallets.set(walletId, wallet);

    res.status(201).json({
      wallet,
      circleIntegration: {
        provider: "Circle Programmable Wallets",
        keyManagement: "MPC (Multi-Party Computation)",
        gasless: true,
        chains: ["Base Sepolia (84532)", "Arbitrum Sepolia (421614)", "Ethereum Sepolia (11155111)"],
        docs: "https://developers.circle.com/wallets",
      },
      fundingInstructions: {
        faucet: "https://faucet.circle.com",
        note: "Get free testnet USDC - 20 USDC per request, every 2 hours",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/wallets/:id - Get wallet details
 */
router.get("/:id", (req, res) => {
  const wallet = wallets.get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found" });
  res.json({ wallet });
});

/**
 * GET /api/wallets/agent/:name - Get wallet by agent name
 */
router.get("/agent/:name", (req, res) => {
  const wallet = Array.from(wallets.values()).find((w) => w.agentName === req.params.name);
  if (!wallet) return res.status(404).json({ error: "No wallet for this agent" });
  res.json({ wallet });
});

/**
 * POST /api/wallets/:id/send - Send USDC from wallet
 * Body: { to, amount, chain? }
 */
router.post("/:id/send", async (req, res) => {
  const wallet = wallets.get(req.params.id);
  if (!wallet) return res.status(404).json({ error: "Wallet not found" });

  const { to, amount, chain = "Base Sepolia" } = req.body;
  if (!to || !amount) return res.status(400).json({ error: "Missing to or amount" });

  // In production: Circle API call to execute USDC transfer
  // POST https://api.circle.com/v1/w3s/developer/transactions/transfer
  res.json({
    status: "submitted",
    from: wallet.address,
    to,
    amount,
    currency: "USDC",
    chain,
    gasless: true,
    note: "Transaction submitted via Circle Programmable Wallets with Gas Station (zero gas cost)",
    circleApi: {
      endpoint: "POST /v1/w3s/developer/transactions/transfer",
      gasStation: "enabled - gas fees automatically sponsored",
    },
  });
});

/**
 * GET /api/wallets - List all wallets
 */
router.get("/", (req, res) => {
  res.json({
    wallets: Array.from(wallets.values()),
    total: wallets.size,
  });
});

// Helper: deterministic address from agent name (for demo purposes)
function generateDeterministicAddress(name) {
  const { ethers } = require("ethers");
  const hash = ethers.keccak256(ethers.toUtf8Bytes("nexuspay-agent-" + name));
  return "0x" + hash.slice(26);
}

module.exports = router;
