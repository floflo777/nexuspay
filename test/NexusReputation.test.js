const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NexusReputation", function () {
  let reputation;
  let admin, agent1, agent2, escrow;

  beforeEach(async function () {
    [admin, agent1, agent2, escrow] = await ethers.getSigners();

    const NexusReputation = await ethers.getContractFactory("NexusReputation");
    reputation = await NexusReputation.deploy();
    await reputation.waitForDeployment();

    await reputation.setEscrowContract(escrow.address);
  });

  describe("Agent Registration", function () {
    it("should register an agent", async function () {
      await expect(reputation.connect(agent1).registerAgent("SentinelBot"))
        .to.emit(reputation, "AgentRegistered")
        .withArgs(agent1.address, "SentinelBot");

      const profile = await reputation.getProfile(agent1.address);
      expect(profile.name).to.equal("SentinelBot");
      expect(profile.exists).to.be.true;
    });

    it("should reject duplicate registration", async function () {
      await reputation.connect(agent1).registerAgent("Bot1");
      await expect(
        reputation.connect(agent1).registerAgent("Bot2")
      ).to.be.revertedWith("NexusRep: already registered");
    });

    it("should reject empty name", async function () {
      await expect(
        reputation.connect(agent1).registerAgent("")
      ).to.be.revertedWith("NexusRep: invalid name");
    });
  });

  describe("Reputation Updates", function () {
    beforeEach(async function () {
      await reputation.connect(agent1).registerAgent("Agent1");
    });

    it("should record task completion from escrow", async function () {
      await reputation.connect(escrow).recordTaskCompletion(agent1.address, 5000000); // 5 USDC

      const profile = await reputation.getProfile(agent1.address);
      expect(profile.tasksCompleted).to.equal(1);
      expect(profile.totalEarned).to.equal(5000000);
    });

    it("should reject updates from unauthorized callers", async function () {
      await expect(
        reputation.connect(agent2).recordTaskCompletion(agent1.address, 1000000)
      ).to.be.revertedWith("NexusRep: unauthorized");
    });
  });

  describe("Ratings", function () {
    beforeEach(async function () {
      await reputation.connect(agent1).registerAgent("Agent1");
    });

    it("should accept ratings from other agents", async function () {
      await reputation.connect(agent2).submitRating(agent1.address, 85);

      const profile = await reputation.getProfile(agent1.address);
      expect(profile.avgRating).to.equal(85);
      expect(profile.ratingCount).to.equal(1);
    });

    it("should calculate running average", async function () {
      await reputation.connect(agent2).submitRating(agent1.address, 80);
      await reputation.connect(admin).submitRating(agent1.address, 90);

      const profile = await reputation.getProfile(agent1.address);
      expect(profile.avgRating).to.equal(85); // (80+90)/2
      expect(profile.ratingCount).to.equal(2);
    });

    it("should reject self-rating", async function () {
      await expect(
        reputation.connect(agent1).submitRating(agent1.address, 100)
      ).to.be.revertedWith("NexusRep: cannot self-rate");
    });

    it("should reject out-of-range ratings", async function () {
      await expect(
        reputation.connect(agent2).submitRating(agent1.address, 0)
      ).to.be.revertedWith("NexusRep: rating 1-100");
    });
  });

  describe("Trust Score", function () {
    it("should return 0 for unrated agents", async function () {
      await reputation.connect(agent1).registerAgent("Agent1");
      expect(await reputation.getTrustScore(agent1.address)).to.equal(0);
    });

    it("should calculate trust score from rating + volume", async function () {
      await reputation.connect(agent1).registerAgent("Agent1");
      await reputation.connect(agent2).submitRating(agent1.address, 80);

      // Complete some tasks
      for (let i = 0; i < 5; i++) {
        await reputation.connect(escrow).recordTaskCompletion(agent1.address, 1000000);
      }

      const score = await reputation.getTrustScore(agent1.address);
      expect(score).to.equal(85); // 80 (rating) + 5 (volume bonus)
    });

    it("should reduce trust score from lost disputes", async function () {
      await reputation.connect(agent1).registerAgent("Agent1");
      await reputation.connect(agent2).registerAgent("Agent2");
      await reputation.connect(agent2).submitRating(agent1.address, 80);

      // Agent1 loses a dispute
      await reputation.connect(escrow).recordDispute(agent2.address, agent1.address);

      const score = await reputation.getTrustScore(agent1.address);
      expect(score).to.equal(75); // 80 - 5 (dispute penalty)
    });
  });

  describe("Leaderboard", function () {
    it("should return leaderboard entries", async function () {
      await reputation.connect(agent1).registerAgent("Agent1");
      await reputation.connect(agent2).registerAgent("Agent2");

      const [agents, scores] = await reputation.getLeaderboard(0, 10);
      expect(agents.length).to.equal(2);
    });
  });
});
