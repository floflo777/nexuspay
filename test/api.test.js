/**
 * API Integration Tests
 * Tests the full Express server endpoints
 */

const { spawn } = require("child_process");
const assert = require("assert");

const API = "http://localhost:3457"; // Use different port to avoid conflicts
let serverProcess;

async function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn("node", ["src/server.js"], {
      env: { ...process.env, PORT: "3457" },
      stdio: "pipe",
    });
    serverProcess.stdout.on("data", (data) => {
      if (data.toString().includes("running on port")) resolve();
    });
    serverProcess.stderr.on("data", (data) => {
      console.error("Server error:", data.toString());
    });
    setTimeout(() => reject(new Error("Server start timeout")), 5000);
  });
}

async function get(path) {
  const res = await fetch(`${API}${path}`);
  return { status: res.status, data: await res.json() };
}

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return fn()
      .then(() => { passed++; console.log(`  ✓ ${name}`); })
      .catch((e) => { failed++; console.log(`  ✗ ${name}: ${e.message}`); });
  }

  console.log("\n=== NexusPay API Integration Tests ===\n");

  // Health check
  console.log("Health:");
  await test("GET / returns NexusPay info", async () => {
    const { status, data } = await get("/");
    assert.strictEqual(status, 200);
    assert.strictEqual(data.name, "NexusPay");
    assert.strictEqual(data.version, "1.0.0");
    assert(data.features.length >= 5);
  });

  // Tasks
  console.log("\nTasks:");
  await test("POST /api/tasks creates a task", async () => {
    const { status, data } = await post("/api/tasks", {
      title: "Test Analysis",
      description: "Analyze data",
      milestones: [
        { description: "Raw data", amount: "3.00" },
        { description: "Report", amount: "2.00" },
      ],
      client: "0xAABBCCDD",
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.task.title, "Test Analysis");
    assert.strictEqual(data.task.totalAmount, 5);
    assert.strictEqual(data.task.milestones.length, 2);
    assert(data.onChainInstructions);
  });

  await test("GET /api/tasks lists tasks", async () => {
    const { data } = await get("/api/tasks");
    assert(data.tasks.length >= 1);
    assert(data.total >= 1);
  });

  await test("POST /api/tasks/:id/accept works", async () => {
    const { data } = await post("/api/tasks/0/accept", { worker: "0x1234" });
    assert.strictEqual(data.task.status, "in_progress");
    assert.strictEqual(data.task.worker, "0x1234");
  });

  await test("POST /api/tasks/:id/deliver/:m works", async () => {
    const { data } = await post("/api/tasks/0/deliver/0", { deliverableHash: "0xabc" });
    assert.strictEqual(data.task.milestones[0].status, "delivered");
  });

  await test("POST /api/tasks/:id/approve/:m releases payment", async () => {
    const { data } = await post("/api/tasks/0/approve/0");
    assert.strictEqual(data.task.milestones[0].status, "approved");
    assert(data.payment.workerPayout > 0);
    assert(data.payment.platformFee > 0);
  });

  // Wallets
  console.log("\nWallets:");
  await test("POST /api/wallets/create creates wallet", async () => {
    const { status, data } = await post("/api/wallets/create", { agentName: "TestBot" });
    assert.strictEqual(status, 201);
    assert(data.wallet.address.startsWith("0x"));
    assert.strictEqual(data.wallet.gasStation.enabled, true);
    assert.strictEqual(data.circleIntegration.gasless, true);
  });

  await test("POST /api/wallets/create rejects duplicate", async () => {
    const { data } = await post("/api/wallets/create", { agentName: "TestBot" });
    assert(data.note.includes("already exists"));
  });

  await test("GET /api/wallets/agent/:name finds wallet", async () => {
    const { data } = await get("/api/wallets/agent/TestBot");
    assert.strictEqual(data.wallet.agentName, "TestBot");
  });

  // x402
  console.log("\nx402:");
  await test("GET /api/x402/services lists services", async () => {
    const { data } = await get("/api/x402/services");
    assert(data.services.length >= 3);
    assert.strictEqual(data.protocol, "x402");
  });

  await test("GET x402-protected endpoint returns 402 without payment", async () => {
    const { status, data } = await get("/api/x402/sentiment-analysis");
    assert.strictEqual(status, 402);
    assert(data.payment_instructions);
    assert.strictEqual(data.payment_instructions.currency, "USDC");
  });

  await test("x402 endpoint accepts payment proof", async () => {
    const payment = Buffer.from(JSON.stringify({
      txHash: "0x" + "a".repeat(64),
      payer: "0xTestPayer",
      amount: "0.01",
      chainId: 84532,
    })).toString("base64");

    const res = await fetch(`${API}/api/x402/sentiment-analysis`, {
      headers: { "X-PAYMENT": payment },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.service, "sentiment-analysis");
  });

  await test("x402 rejects replay attack", async () => {
    const payment = Buffer.from(JSON.stringify({
      txHash: "0x" + "a".repeat(64), // same tx
      payer: "0xTestPayer",
      amount: "0.01",
      chainId: 84532,
    })).toString("base64");

    const res = await fetch(`${API}/api/x402/sentiment-analysis`, {
      headers: { "X-PAYMENT": payment },
    });
    assert.strictEqual(res.status, 400); // rejected - payment already used
  });

  await test("POST /api/x402/register-service adds service", async () => {
    const { status, data } = await post("/api/x402/register-service", {
      id: "custom-analysis",
      name: "Custom Analysis",
      priceUSDC: 0.03,
      endpoint: "/api/custom",
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.service.priceMicro, 30000);
  });

  // CCTP
  console.log("\nCCTP:");
  await test("GET /api/cctp/info returns route info", async () => {
    const { data } = await get("/api/cctp/info");
    assert.strictEqual(data.protocol, "Circle CCTP V2");
    assert(data.supportedRoutes.length >= 4);
  });

  await test("POST /api/cctp/bridge returns transfer steps", async () => {
    const { data } = await post("/api/cctp/bridge", {
      from: "6",
      to: "3",
      amount: "5.00",
      sender: "0xSender",
    });
    assert.strictEqual(data.bridge.from, "Base Sepolia");
    assert.strictEqual(data.bridge.to, "Arbitrum Sepolia");
    assert(data.steps.length === 4);
  });

  // Reputation
  console.log("\nReputation:");
  await test("POST /api/reputation/register creates agent", async () => {
    const { status, data } = await post("/api/reputation/register", {
      name: "RepBot",
      address: "0xRepBot",
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.agent.name, "RepBot");
  });

  await test("POST /api/reputation/:address/rate works", async () => {
    const { data } = await post("/api/reputation/0xRepBot/rate", {
      rater: "0xOther",
      rating: 85,
    });
    assert.strictEqual(data.agent.avgRating, 85);
    assert(data.agent.trustScore > 0);
  });

  await test("GET /api/reputation returns leaderboard", async () => {
    const { data } = await get("/api/reputation");
    assert(data.leaderboard.length >= 1);
  });

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  return failed === 0;
}

async function main() {
  try {
    console.log("Starting server...");
    await startServer();
    const success = await runTests();
    process.exit(success ? 0 : 1);
  } finally {
    if (serverProcess) serverProcess.kill();
  }
}

main();
