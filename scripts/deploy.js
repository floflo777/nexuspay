const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  // USDC on Base Sepolia (Circle testnet USDC)
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

  // Deploy NexusReputation
  console.log("\nDeploying NexusReputation...");
  const NexusReputation = await hre.ethers.getContractFactory("NexusReputation");
  const reputation = await NexusReputation.deploy();
  await reputation.waitForDeployment();
  const repAddress = await reputation.getAddress();
  console.log("NexusReputation deployed to:", repAddress);

  // Deploy NexusEscrow
  console.log("\nDeploying NexusEscrow...");
  const NexusEscrow = await hre.ethers.getContractFactory("NexusEscrow");
  const escrow = await NexusEscrow.deploy(USDC_ADDRESS, deployer.address);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("NexusEscrow deployed to:", escrowAddress);

  // Link reputation to escrow
  console.log("\nLinking NexusReputation to NexusEscrow...");
  const linkTx = await reputation.setEscrowContract(escrowAddress);
  await linkTx.wait();
  console.log("Linked successfully");

  // Save deployment info
  const deployment = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      NexusEscrow: escrowAddress,
      NexusReputation: repAddress,
      USDC: USDC_ADDRESS,
    },
    deployedAt: new Date().toISOString(),
    blockNumber: await hre.ethers.provider.getBlockNumber(),
  };

  const deployPath = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(deployPath, JSON.stringify(deployment, null, 2));
  console.log("\nDeployment info saved to deployment.json");
  console.log(JSON.stringify(deployment, null, 2));

  // Verify contracts on block explorer
  if (process.env.BASESCAN_API_KEY) {
    console.log("\nVerifying contracts...");
    try {
      await hre.run("verify:verify", { address: repAddress, constructorArguments: [] });
      await hre.run("verify:verify", { address: escrowAddress, constructorArguments: [USDC_ADDRESS, deployer.address] });
      console.log("Verification complete");
    } catch (e) {
      console.log("Verification failed (may already be verified):", e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
