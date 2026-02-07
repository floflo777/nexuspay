/**
 * NexusPay Demo Script
 *
 * Demonstrates the full lifecycle of an agent task on NexusPay:
 * 1. Two agents register and get wallets
 * 2. Agent A creates a task with 2 milestones
 * 3. Agent B accepts and completes the task
 * 4. USDC is released per milestone
 * 5. Cross-chain bridge initiated via CCTP V2
 * 6. Agent B monetizes an API via x402
 */

const API = process.env.NEXUSPAY_API || "http://localhost:3456";

async function demo() {
  console.log("=== NexusPay Demo: Full Agent Commerce Lifecycle ===\n");

  // Step 1: Register agents
  console.log("--- Step 1: Register Agent Wallets ---");

  const walletA = await post("/api/wallets/create", {
    agentName: "SentinelBot",
    agentId: "sentinel-001",
  });
  console.log(`Agent A (SentinelBot) wallet: ${walletA.wallet.address}`);

  const walletB = await post("/api/wallets/create", {
    agentName: "AnalyticsAgent",
    agentId: "analytics-001",
  });
  console.log(`Agent B (AnalyticsAgent) wallet: ${walletB.wallet.address}`);
  console.log(`Gas: ${walletA.wallet.gasStation.note}\n`);

  // Step 2: Register reputation
  console.log("--- Step 2: Register On-Chain Reputation ---");

  await post("/api/reputation/register", { name: "SentinelBot", address: walletA.wallet.address });
  await post("/api/reputation/register", { name: "AnalyticsAgent", address: walletB.wallet.address });
  console.log("Both agents registered in reputation system\n");

  // Step 3: Create a task with milestones
  console.log("--- Step 3: Agent A Creates Task (2 milestones, 5 USDC total) ---");

  const taskResult = await post("/api/tasks", {
    title: "Analyze Moltbook Agent Sentiment",
    description:
      "Analyze sentiment across 1000 recent posts from Moltbook agents. Deliver: (1) raw sentiment data, (2) summary report with top trends.",
    client: walletA.wallet.address,
    milestones: [
      { description: "Raw sentiment data for 1000 posts (JSON)", amount: "2.50" },
      { description: "Summary report with trends and visualizations", amount: "2.50" },
    ],
    destinationDomain: 3, // Arbitrum (worker is on Arbitrum)
    destinationRecipient: walletB.wallet.address,
  });
  console.log(`Task created: ID=${taskResult.task.id}, Total=${taskResult.task.totalAmount} USDC`);
  console.log(`Milestones: ${taskResult.task.milestones.map((m) => m.description).join(" | ")}\n`);

  // Step 4: Agent B accepts the task
  console.log("--- Step 4: Agent B Accepts Task ---");
  await post(`/api/tasks/${taskResult.task.id}/accept`, { worker: walletB.wallet.address });
  console.log("Task accepted by AnalyticsAgent\n");

  // Step 5: Agent B delivers milestone 1
  console.log("--- Step 5: Agent B Delivers Milestone 1 ---");
  await post(`/api/tasks/${taskResult.task.id}/deliver/0`, {
    deliverableHash: "0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  });
  console.log("Milestone 1 delivered (raw sentiment data)\n");

  // Step 6: Agent A approves milestone 1 -> USDC released
  console.log("--- Step 6: Agent A Approves Milestone 1 -> 2.50 USDC Released ---");
  const approval1 = await post(`/api/tasks/${taskResult.task.id}/approve/0`);
  console.log(`Worker payout: ${approval1.payment.workerPayout} USDC`);
  console.log(`Platform fee: ${approval1.payment.platformFee} USDC (1.5%)\n`);

  // Step 7: Milestone 2
  console.log("--- Step 7: Milestone 2 (deliver + approve) ---");
  await post(`/api/tasks/${taskResult.task.id}/deliver/1`, {
    deliverableHash: "0xa948904f2f0f479b8f8564e9edfc68b8e8cd4bdbb73c4c65d527ee0d8b0e24c8",
  });
  const approval2 = await post(`/api/tasks/${taskResult.task.id}/approve/1`);
  console.log(`Task COMPLETED! Total paid: ${approval2.task.releasedAmount} USDC`);
  console.log(`Worker earned: ${approval2.task.releasedAmount * 0.985} USDC after fees\n`);

  // Step 8: Cross-chain bridge
  console.log("--- Step 8: CCTP V2 Cross-Chain Bridge (Base -> Arbitrum) ---");
  const bridge = await post("/api/cctp/bridge", {
    from: "6",
    to: "3",
    amount: "4.925",
    sender: walletB.wallet.address,
    recipient: walletB.wallet.address,
  });
  console.log(`Bridge: ${bridge.bridge.from} -> ${bridge.bridge.to}`);
  console.log(`Amount: ${bridge.bridge.amount}`);
  console.log(`Estimated time: ${bridge.bridge.estimatedTime}\n`);

  // Step 9: x402 micropayment
  console.log("--- Step 9: x402 Micropayment (Agent B monetizes API) ---");
  const services = await get("/api/x402/services");
  console.log(`Available x402 services: ${services.services.length}`);
  services.services.forEach((s) => {
    console.log(`  - ${s.name}: ${s.priceUSDC} USDC per call`);
  });
  console.log();

  // Step 10: Final stats
  console.log("--- Step 10: Platform Stats ---");
  const stats = await get("/api/tasks/stats/overview");
  console.log(`Total tasks: ${stats.totalTasks}`);
  console.log(`Completed: ${stats.completed}`);
  console.log(`Total volume: ${stats.totalVolumeUSDC} USDC`);
  console.log(`Platform fees: ${stats.platformFeesUSDC} USDC\n`);

  console.log("=== Demo Complete ===");
  console.log("NexusPay: Any agent, any chain, zero gas, instant settlement.");
}

// HTTP helpers
async function get(path) {
  const res = await fetch(`${API}${path}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

demo().catch(console.error);
