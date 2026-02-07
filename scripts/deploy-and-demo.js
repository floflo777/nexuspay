/**
 * NexusPay Full Deployment + On-Chain Demo
 *
 * Deploys contracts to Base Sepolia and executes a complete demo:
 * 1. Deploy NexusEscrow + NexusReputation
 * 2. Mint testnet USDC to demo agents
 * 3. Agent A creates a task with 2 milestones
 * 4. Agent B accepts and completes the task
 * 5. USDC flows through escrow with 1.5% fee
 * 6. Reputation updated on-chain
 * 7. All transactions logged with block explorer links
 *
 * Usage: DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy-and-demo.js
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const EXPLORER = "https://sepolia.basescan.org";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Set DEPLOYER_PRIVATE_KEY env variable");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
  const deployer = new ethers.Wallet(privateKey, provider);

  console.log("=== NexusPay Deployment + Demo ===");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Chain: Base Sepolia (84532)`);
  console.log(`Balance: ${ethers.formatEther(await provider.getBalance(deployer.address))} ETH\n`);

  // Load compiled artifacts
  const escrowArtifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../artifacts/contracts/NexusEscrow.sol/NexusEscrow.json"))
  );
  const repArtifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../artifacts/contracts/NexusReputation.sol/NexusReputation.json"))
  );

  // --- DEPLOY ---
  console.log("--- Deploying Contracts ---");

  const RepFactory = new ethers.ContractFactory(repArtifact.abi, repArtifact.bytecode, deployer);
  const reputation = await RepFactory.deploy();
  await reputation.waitForDeployment();
  const repAddr = await reputation.getAddress();
  console.log(`NexusReputation: ${repAddr}`);
  console.log(`  ${EXPLORER}/address/${repAddr}`);

  const EscrowFactory = new ethers.ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode, deployer);
  const escrow = await EscrowFactory.deploy(USDC_BASE_SEPOLIA, deployer.address);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log(`NexusEscrow: ${escrowAddr}`);
  console.log(`  ${EXPLORER}/address/${escrowAddr}`);

  // Link contracts
  const linkTx = await reputation.setEscrowContract(escrowAddr);
  await linkTx.wait();
  console.log(`Linked reputation -> escrow`);

  // --- DEMO AGENTS ---
  console.log("\n--- Setting Up Demo Agents ---");

  // Create 2 demo agent wallets (derived from deployer)
  const agentA = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes("nexuspay-demo-agent-a")), provider);
  const agentB = new ethers.Wallet(ethers.keccak256(ethers.toUtf8Bytes("nexuspay-demo-agent-b")), provider);

  console.log(`Agent A (Client): ${agentA.address}`);
  console.log(`Agent B (Worker): ${agentB.address}`);

  // Fund agents with ETH for gas
  console.log("\nFunding agents with ETH...");
  const fundA = await deployer.sendTransaction({ to: agentA.address, value: ethers.parseEther("0.001") });
  await fundA.wait();
  const fundB = await deployer.sendTransaction({ to: agentB.address, value: ethers.parseEther("0.001") });
  await fundB.wait();
  console.log("Agents funded");

  // Register agents in reputation system
  console.log("\nRegistering agents...");
  const repA = reputation.connect(agentA);
  const regATx = await repA.registerAgent("SentinelBot");
  await regATx.wait();
  console.log(`  SentinelBot registered: ${EXPLORER}/tx/${regATx.hash}`);

  const repB = reputation.connect(agentB);
  const regBTx = await repB.registerAgent("AnalyticsAgent");
  await regBTx.wait();
  console.log(`  AnalyticsAgent registered: ${EXPLORER}/tx/${regBTx.hash}`);

  // --- TASK DEMO ---
  console.log("\n--- Task Lifecycle Demo ---");

  // Check if Agent A has USDC (they'd need some from faucet)
  const usdc = new ethers.Contract(USDC_BASE_SEPOLIA, [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function transfer(address,uint256) returns (bool)",
  ], deployer);

  const deployerUSDC = await usdc.balanceOf(deployer.address);
  console.log(`Deployer USDC: ${ethers.formatUnits(deployerUSDC, 6)}`);

  if (deployerUSDC >= ethers.parseUnits("5", 6)) {
    // Transfer USDC to Agent A
    const transferTx = await usdc.transfer(agentA.address, ethers.parseUnits("10", 6));
    await transferTx.wait();
    console.log(`Transferred 10 USDC to Agent A`);

    // Agent A approves escrow
    const usdcA = usdc.connect(agentA);
    const approveTx = await usdcA.approve(escrowAddr, ethers.parseUnits("10", 6));
    await approveTx.wait();

    // Agent A creates task
    const escrowA = escrow.connect(agentA);
    const createTx = await escrowA.createTask(
      "Analyze Moltbook Sentiment",
      "Analyze 1000 posts for sentiment trends",
      ["Raw sentiment data (JSON)", "Summary report"],
      [ethers.parseUnits("3", 6), ethers.parseUnits("2", 6)],
      0,
      ethers.ZeroHash
    );
    const createReceipt = await createTx.wait();
    console.log(`Task created: ${EXPLORER}/tx/${createTx.hash}`);

    // Agent B accepts
    const escrowB = escrow.connect(agentB);
    const acceptTx = await escrowB.acceptTask(0);
    await acceptTx.wait();
    console.log(`Task accepted: ${EXPLORER}/tx/${acceptTx.hash}`);

    // Agent B delivers milestone 1
    const hash1 = ethers.keccak256(ethers.toUtf8Bytes("sentiment-data-v1"));
    const deliverTx = await escrowB.deliverMilestone(0, 0, hash1);
    await deliverTx.wait();
    console.log(`Milestone 1 delivered: ${EXPLORER}/tx/${deliverTx.hash}`);

    // Agent A approves milestone 1
    const approve1Tx = await escrowA.approveMilestone(0, 0);
    await approve1Tx.wait();
    console.log(`Milestone 1 approved (3 USDC released): ${EXPLORER}/tx/${approve1Tx.hash}`);

    // Check Agent B's USDC balance
    const agentBUSDC = await usdc.balanceOf(agentB.address);
    console.log(`Agent B USDC after milestone 1: ${ethers.formatUnits(agentBUSDC, 6)}`);

    // Milestone 2
    const hash2 = ethers.keccak256(ethers.toUtf8Bytes("summary-report-v1"));
    const deliver2Tx = await escrowB.deliverMilestone(0, 1, hash2);
    await deliver2Tx.wait();
    const approve2Tx = await escrowA.approveMilestone(0, 1);
    await approve2Tx.wait();
    console.log(`Milestone 2 approved (2 USDC released): ${EXPLORER}/tx/${approve2Tx.hash}`);

    // Final balances
    const finalB = await usdc.balanceOf(agentB.address);
    const feeBalance = await usdc.balanceOf(deployer.address);
    console.log(`\nFinal Agent B USDC: ${ethers.formatUnits(finalB, 6)} (after 1.5% fees)`);
    console.log(`Platform fees collected: check fee collector balance`);

    // Rating
    const rateTx = await repA.submitRating(agentB.address, 92);
    await rateTx.wait();
    console.log(`Agent A rated Agent B: 92/100 - ${EXPLORER}/tx/${rateTx.hash}`);

    const trustScore = await reputation.getTrustScore(agentB.address);
    console.log(`Agent B trust score: ${trustScore}`);
  } else {
    console.log("Insufficient USDC for demo. Get testnet USDC from https://faucet.circle.com");
    console.log("Then re-run this script.");
  }

  // --- SAVE DEPLOYMENT ---
  const deployment = {
    network: "Base Sepolia",
    chainId: 84532,
    deployer: deployer.address,
    contracts: {
      NexusEscrow: escrowAddr,
      NexusReputation: repAddr,
      USDC: USDC_BASE_SEPOLIA,
    },
    demoAgents: {
      agentA: agentA.address,
      agentB: agentB.address,
    },
    explorer: EXPLORER,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(__dirname, "../deployment.json"), JSON.stringify(deployment, null, 2));
  console.log("\n--- Deployment saved to deployment.json ---");
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch(console.error);
