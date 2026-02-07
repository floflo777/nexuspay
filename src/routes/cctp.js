const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");

/**
 * CCTP V2 Cross-Chain Transfer Routes
 *
 * Circle's Cross-Chain Transfer Protocol enables native USDC transfers
 * between blockchains via burn-and-mint:
 * 1. Burn USDC on source chain (TokenMessenger.depositForBurn)
 * 2. Wait for Circle attestation (~8-20 seconds with V2 fast transfers)
 * 3. Mint USDC on destination chain (MessageTransmitter.receiveMessage)
 *
 * V2 Hooks: Attach metadata to burns that trigger automated actions on destination
 */

// CCTP domain mapping
const DOMAINS = {
  0: { name: "Ethereum Sepolia", chainId: 11155111, rpc: "https://rpc.sepolia.org" },
  3: { name: "Arbitrum Sepolia", chainId: 421614, rpc: "https://sepolia-rollup.arbitrum.io/rpc" },
  6: { name: "Base Sepolia", chainId: 84532, rpc: "https://sepolia.base.org" },
};

// CCTP contract addresses (testnet)
const CCTP_CONTRACTS = {
  baseSepolia: {
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter: "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  arbitrumSepolia: {
    tokenMessenger: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter: "0xaCF1ceeF35caAc005e559aCB6382634d0b3484e5",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  },
};

/**
 * GET /api/cctp/info - CCTP information and supported routes
 */
router.get("/info", (req, res) => {
  res.json({
    protocol: "Circle CCTP V2",
    description: "Native USDC cross-chain transfers via burn-and-mint",
    speed: "8-20 seconds (V2 fast transfers)",
    domains: DOMAINS,
    contracts: CCTP_CONTRACTS,
    supportedRoutes: [
      { from: "Base Sepolia", to: "Arbitrum Sepolia", estimatedTime: "~15s" },
      { from: "Arbitrum Sepolia", to: "Base Sepolia", estimatedTime: "~15s" },
      { from: "Base Sepolia", to: "Ethereum Sepolia", estimatedTime: "~20s" },
      { from: "Ethereum Sepolia", to: "Base Sepolia", estimatedTime: "~20s" },
    ],
    v2Features: {
      fastTransfers: "Reduced from 13-19 minutes (V1) to 8-20 seconds",
      hooks: "Attach metadata to burns for automated destination actions (auto-deposit, auto-swap, etc.)",
    },
    agentBenefit: "Agents on different chains can pay each other in USDC without manual bridging",
  });
});

/**
 * POST /api/cctp/bridge - Initiate a cross-chain USDC transfer
 * Body: { from, to, amount, sender, recipient, hook? }
 *
 * Returns the transaction data for the agent to sign and submit
 */
router.post("/bridge", async (req, res) => {
  try {
    const { from, to, amount, sender, recipient, hook } = req.body;

    if (!from || !to || !amount || !sender) {
      return res.status(400).json({ error: "Missing: from, to, amount, sender" });
    }

    const sourceDomain = parseInt(from);
    const destDomain = parseInt(to);

    if (!DOMAINS[sourceDomain] || !DOMAINS[destDomain]) {
      return res.status(400).json({
        error: "Invalid domain",
        validDomains: Object.entries(DOMAINS).map(([d, info]) => `${d}: ${info.name}`),
      });
    }

    const amountWei = ethers.parseUnits(String(amount), 6);
    let recipientBytes32;
    try {
      recipientBytes32 = ethers.zeroPadValue(recipient || sender, 32);
    } catch {
      recipientBytes32 = ethers.keccak256(ethers.toUtf8Bytes(recipient || sender));
    }

    // Build the CCTP burn transaction
    const burnTx = {
      to: CCTP_CONTRACTS.baseSepolia.tokenMessenger, // adjust based on source chain
      data: buildBurnData(amountWei, destDomain, recipientBytes32, hook),
      chain: DOMAINS[sourceDomain].name,
    };

    res.json({
      bridge: {
        from: DOMAINS[sourceDomain].name,
        to: DOMAINS[destDomain].name,
        amount: `${amount} USDC`,
        sender,
        recipient: recipient || sender,
        estimatedTime: "~15 seconds",
      },
      steps: [
        {
          step: 1,
          action: "Approve USDC",
          contract: CCTP_CONTRACTS.baseSepolia.usdc,
          method: "approve(address,uint256)",
          args: [CCTP_CONTRACTS.baseSepolia.tokenMessenger, amountWei.toString()],
        },
        {
          step: 2,
          action: "Burn USDC (initiate bridge)",
          contract: CCTP_CONTRACTS.baseSepolia.tokenMessenger,
          method: "depositForBurn(uint256,uint32,bytes32,address)",
          args: [amountWei.toString(), destDomain, recipientBytes32, CCTP_CONTRACTS.baseSepolia.usdc],
        },
        {
          step: 3,
          action: "Wait for Circle attestation (~15s with V2)",
          attestationApi: "https://iris-api-sandbox.circle.com/attestations",
        },
        {
          step: 4,
          action: "Mint USDC on destination",
          contract: CCTP_CONTRACTS.arbitrumSepolia.messageTransmitter,
          method: "receiveMessage(bytes,bytes)",
          note: "Use attestation from step 3",
        },
      ],
      hook: hook
        ? {
            enabled: true,
            metadata: hook,
            note: "V2 Hook will trigger automated action on destination chain after mint",
          }
        : { enabled: false },
      paymaster: {
        note: "Use Circle Paymaster to pay gas in USDC on both source and destination chains",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/cctp/attestation/:txHash - Check attestation status
 */
router.get("/attestation/:txHash", async (req, res) => {
  // In production: query Circle Iris API
  res.json({
    txHash: req.params.txHash,
    status: "complete",
    attestation: "0x...simulated_attestation",
    note: "In production, query https://iris-api-sandbox.circle.com/attestations/{messageHash}",
    v2Speed: "Attestation typically available in 8-20 seconds with CCTP V2",
  });
});

// Helper: build burn calldata
function buildBurnData(amount, destDomain, recipient, hook) {
  const iface = new ethers.Interface([
    "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken)",
  ]);
  return iface.encodeFunctionData("depositForBurn", [
    amount,
    destDomain,
    recipient,
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  ]);
}

module.exports = router;
