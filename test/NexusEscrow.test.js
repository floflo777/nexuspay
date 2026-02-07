const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NexusEscrow", function () {
  let escrow, usdc, reputation;
  let admin, client, worker, feeCollector;
  const USDC_DECIMALS = 6;

  beforeEach(async function () {
    [admin, client, worker, feeCollector] = await ethers.getSigners();

    // Deploy mock USDC (ERC20)
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy NexusReputation
    const NexusReputation = await ethers.getContractFactory("NexusReputation");
    reputation = await NexusReputation.deploy();
    await reputation.waitForDeployment();

    // Deploy NexusEscrow
    const NexusEscrow = await ethers.getContractFactory("NexusEscrow");
    escrow = await NexusEscrow.deploy(await usdc.getAddress(), feeCollector.address);
    await escrow.waitForDeployment();

    // Link reputation
    await reputation.setEscrowContract(await escrow.getAddress());

    // Mint USDC to client
    await usdc.mint(client.address, ethers.parseUnits("1000", USDC_DECIMALS));

    // Approve escrow
    await usdc.connect(client).approve(await escrow.getAddress(), ethers.parseUnits("1000", USDC_DECIMALS));
  });

  describe("Task Creation", function () {
    it("should create a task with milestones and deposit USDC", async function () {
      const tx = await escrow.connect(client).createTask(
        "Sentiment Analysis",
        "Analyze 1000 posts",
        ["Raw data", "Report"],
        [ethers.parseUnits("3", USDC_DECIMALS), ethers.parseUnits("2", USDC_DECIMALS)],
        0,
        ethers.ZeroHash
      );

      await expect(tx).to.emit(escrow, "TaskCreated").withArgs(
        0, client.address, "Sentiment Analysis",
        ethers.parseUnits("5", USDC_DECIMALS), 2
      );

      const task = await escrow.getTask(0);
      expect(task.client).to.equal(client.address);
      expect(task.status).to.equal(0); // Open
      expect(task.totalAmount).to.equal(ethers.parseUnits("5", USDC_DECIMALS));
      expect(task.milestoneCount).to.equal(2);

      // USDC transferred to escrow
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(ethers.parseUnits("5", USDC_DECIMALS));
    });

    it("should reject zero-amount milestones", async function () {
      await expect(
        escrow.connect(client).createTask("Test", "Desc", ["M1"], [0], 0, ethers.ZeroHash)
      ).to.be.revertedWith("NexusEscrow: zero amount");
    });

    it("should reject more than 10 milestones", async function () {
      const descs = Array(11).fill("Milestone");
      const amounts = Array(11).fill(ethers.parseUnits("1", USDC_DECIMALS));
      await expect(
        escrow.connect(client).createTask("Test", "Desc", descs, amounts, 0, ethers.ZeroHash)
      ).to.be.revertedWith("NexusEscrow: 1-10 milestones");
    });
  });

  describe("Task Acceptance", function () {
    beforeEach(async function () {
      await escrow.connect(client).createTask(
        "Task", "Desc",
        ["M1", "M2"],
        [ethers.parseUnits("3", USDC_DECIMALS), ethers.parseUnits("2", USDC_DECIMALS)],
        0, ethers.ZeroHash
      );
    });

    it("should allow worker to accept an open task", async function () {
      await expect(escrow.connect(worker).acceptTask(0))
        .to.emit(escrow, "TaskAccepted")
        .withArgs(0, worker.address);

      const task = await escrow.getTask(0);
      expect(task.worker).to.equal(worker.address);
      expect(task.status).to.equal(2); // InProgress
    });

    it("should not allow client to self-accept", async function () {
      await expect(
        escrow.connect(client).acceptTask(0)
      ).to.be.revertedWith("NexusEscrow: cannot self-accept");
    });

    it("should not allow accepting a non-open task", async function () {
      await escrow.connect(worker).acceptTask(0);
      await expect(
        escrow.connect(worker).acceptTask(0)
      ).to.be.revertedWith("NexusEscrow: not open");
    });
  });

  describe("Milestone Delivery & Approval", function () {
    beforeEach(async function () {
      await escrow.connect(client).createTask(
        "Task", "Desc",
        ["M1", "M2"],
        [ethers.parseUnits("3", USDC_DECIMALS), ethers.parseUnits("2", USDC_DECIMALS)],
        0, ethers.ZeroHash
      );
      await escrow.connect(worker).acceptTask(0);
    });

    it("should allow worker to deliver and client to approve a milestone", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("deliverable-data"));

      await expect(escrow.connect(worker).deliverMilestone(0, 0, hash))
        .to.emit(escrow, "MilestoneDelivered")
        .withArgs(0, 0, hash);

      const workerBalBefore = await usdc.balanceOf(worker.address);
      const feeBalBefore = await usdc.balanceOf(feeCollector.address);

      await expect(escrow.connect(client).approveMilestone(0, 0))
        .to.emit(escrow, "MilestoneApproved");

      // Check worker received payment minus 1.5% fee
      const milestone0Amount = ethers.parseUnits("3", USDC_DECIMALS);
      const fee = milestone0Amount * 150n / 10000n; // 1.5%
      const workerPayout = milestone0Amount - fee;

      expect(await usdc.balanceOf(worker.address)).to.equal(workerBalBefore + workerPayout);
      expect(await usdc.balanceOf(feeCollector.address)).to.equal(feeBalBefore + fee);
    });

    it("should complete task when all milestones approved", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));

      await escrow.connect(worker).deliverMilestone(0, 0, hash);
      await escrow.connect(client).approveMilestone(0, 0);

      await escrow.connect(worker).deliverMilestone(0, 1, hash);
      await expect(escrow.connect(client).approveMilestone(0, 1))
        .to.emit(escrow, "TaskCompleted")
        .withArgs(0, worker.address, ethers.parseUnits("5", USDC_DECIMALS));

      const task = await escrow.getTask(0);
      expect(task.status).to.equal(3); // Completed
    });
  });

  describe("Disputes", function () {
    beforeEach(async function () {
      await escrow.connect(client).createTask(
        "Task", "Desc", ["M1"],
        [ethers.parseUnits("5", USDC_DECIMALS)],
        0, ethers.ZeroHash
      );
      await escrow.connect(worker).acceptTask(0);
      await escrow.connect(worker).deliverMilestone(0, 0, ethers.ZeroHash);
    });

    it("should allow client to dispute a delivered milestone", async function () {
      await expect(escrow.connect(client).disputeMilestone(0, 0))
        .to.emit(escrow, "MilestoneDisputed")
        .withArgs(0, 0);

      const task = await escrow.getTask(0);
      expect(task.status).to.equal(4); // Disputed
    });

    it("should allow admin to resolve dispute in favor of worker", async function () {
      await escrow.connect(client).disputeMilestone(0, 0);

      const workerBalBefore = await usdc.balanceOf(worker.address);

      await expect(escrow.connect(admin).resolveDispute(0, 0, true))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(0, 0, true);

      const amount = ethers.parseUnits("5", USDC_DECIMALS);
      const fee = amount * 150n / 10000n;
      expect(await usdc.balanceOf(worker.address)).to.equal(workerBalBefore + amount - fee);
    });

    it("should allow admin to resolve dispute in favor of client", async function () {
      await escrow.connect(client).disputeMilestone(0, 0);

      const clientBalBefore = await usdc.balanceOf(client.address);

      await escrow.connect(admin).resolveDispute(0, 0, false);

      expect(await usdc.balanceOf(client.address)).to.equal(
        clientBalBefore + ethers.parseUnits("5", USDC_DECIMALS)
      );
    });
  });

  describe("Task Cancellation", function () {
    it("should refund client on cancellation of open task", async function () {
      await escrow.connect(client).createTask(
        "Task", "Desc", ["M1"],
        [ethers.parseUnits("5", USDC_DECIMALS)],
        0, ethers.ZeroHash
      );

      const balBefore = await usdc.balanceOf(client.address);
      await escrow.connect(client).cancelTask(0);

      expect(await usdc.balanceOf(client.address)).to.equal(
        balBefore + ethers.parseUnits("5", USDC_DECIMALS)
      );

      const task = await escrow.getTask(0);
      expect(task.status).to.equal(5n); // Cancelled
    });
  });

  describe("View Functions", function () {
    it("should return agent stats", async function () {
      const [completed, earned, disputes] = await escrow.getAgentStats(worker.address);
      expect(completed).to.equal(0);
      expect(earned).to.equal(0);
      expect(disputes).to.equal(0);
    });

    it("should list open tasks", async function () {
      await escrow.connect(client).createTask("T1", "D", ["M"], [ethers.parseUnits("1", USDC_DECIMALS)], 0, ethers.ZeroHash);
      await escrow.connect(client).createTask("T2", "D", ["M"], [ethers.parseUnits("1", USDC_DECIMALS)], 0, ethers.ZeroHash);

      const openTasks = await escrow.getOpenTasks(0, 10);
      expect(openTasks.length).to.equal(2);
    });
  });
});
