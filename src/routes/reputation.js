const express = require("express");
const router = express.Router();

// In-memory reputation store (mirrors on-chain NexusReputation contract)
const agents = new Map();

/**
 * POST /api/reputation/register - Register an agent
 * Body: { name, address }
 */
router.post("/register", (req, res) => {
  const { name, address } = req.body;
  if (!name || !address) return res.status(400).json({ error: "Missing name or address" });

  if (agents.has(address)) {
    return res.json({ agent: agents.get(address), note: "Already registered" });
  }

  const agent = {
    name,
    address,
    registeredAt: new Date().toISOString(),
    tasksCompleted: 0,
    tasksPosted: 0,
    totalEarned: 0,
    totalSpent: 0,
    avgRating: 0,
    ratingCount: 0,
    disputesWon: 0,
    disputesLost: 0,
    x402CallsServed: 0,
    x402Revenue: 0,
    trustScore: 0,
  };

  agents.set(address, agent);

  res.status(201).json({
    agent,
    onChain: {
      contract: process.env.NEXUS_REPUTATION_ADDRESS,
      method: "registerAgent(string)",
      args: [name],
      note: "Also register on-chain for permanent reputation record",
    },
  });
});

/**
 * GET /api/reputation/:address - Get agent reputation
 */
router.get("/:address", (req, res) => {
  const agent = agents.get(req.params.address);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  // Calculate trust score
  agent.trustScore = calculateTrustScore(agent);

  res.json({ agent });
});

/**
 * GET /api/reputation - Leaderboard
 */
router.get("/", (req, res) => {
  const { limit = 20, sortBy = "trustScore" } = req.query;

  let agentList = Array.from(agents.values()).map((a) => ({
    ...a,
    trustScore: calculateTrustScore(a),
  }));

  agentList.sort((a, b) => b[sortBy] - a[sortBy]);

  res.json({
    leaderboard: agentList.slice(0, Number(limit)),
    total: agentList.length,
    onChainContract: process.env.NEXUS_REPUTATION_ADDRESS,
  });
});

/**
 * POST /api/reputation/:address/rate - Rate an agent
 * Body: { rater, rating (1-100) }
 */
router.post("/:address/rate", (req, res) => {
  const agent = agents.get(req.params.address);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { rater, rating } = req.body;
  if (!rater || !rating || rating < 1 || rating > 100) {
    return res.status(400).json({ error: "Missing rater or invalid rating (1-100)" });
  }

  const totalRating = agent.avgRating * agent.ratingCount + rating;
  agent.ratingCount++;
  agent.avgRating = Math.round(totalRating / agent.ratingCount);
  agent.trustScore = calculateTrustScore(agent);

  res.json({ agent });
});

function calculateTrustScore(agent) {
  if (agent.ratingCount === 0) return 0;
  const ratingComponent = agent.avgRating;
  const volumeBonus = Math.min(agent.tasksCompleted, 10);
  const disputePenalty = agent.disputesLost * 5;
  return Math.max(0, ratingComponent + volumeBonus - disputePenalty);
}

module.exports = router;
