const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");

// In-memory task store (mirrors on-chain state for fast API access)
const tasks = new Map();
let taskIdCounter = 0;

/**
 * GET /api/tasks - List all tasks
 */
router.get("/", (req, res) => {
  const { status, limit = 20, offset = 0 } = req.query;
  let taskList = Array.from(tasks.values());

  if (status) {
    taskList = taskList.filter((t) => t.status === status);
  }

  taskList.sort((a, b) => b.createdAt - a.createdAt);

  res.json({
    tasks: taskList.slice(Number(offset), Number(offset) + Number(limit)),
    total: taskList.length,
    offset: Number(offset),
    limit: Number(limit),
  });
});

/**
 * GET /api/tasks/:id - Get task by ID
 */
router.get("/:id", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

/**
 * POST /api/tasks - Create a new task
 * Body: { title, description, milestones: [{ description, amount }], client, destinationDomain?, destinationRecipient? }
 */
router.post("/", async (req, res) => {
  try {
    const { title, description, milestones, client, destinationDomain = 0, destinationRecipient } = req.body;

    if (!title || !milestones || !client) {
      return res.status(400).json({ error: "Missing required fields: title, milestones, client" });
    }

    const totalAmount = milestones.reduce((sum, m) => sum + parseFloat(m.amount), 0);

    const taskId = String(taskIdCounter++);
    const task = {
      id: taskId,
      title,
      description: description || "",
      client,
      worker: null,
      status: "open",
      milestones: milestones.map((m, i) => ({
        index: i,
        description: m.description,
        amount: parseFloat(m.amount),
        status: "pending",
        deliverableHash: null,
      })),
      totalAmount,
      releasedAmount: 0,
      destinationDomain,
      destinationRecipient: destinationRecipient || client,
      createdAt: Date.now(),
      completedAt: null,
      txHash: null, // on-chain tx hash when submitted
    };

    tasks.set(taskId, task);

    res.status(201).json({
      task,
      onChainInstructions: {
        contract: process.env.NEXUS_ESCROW_ADDRESS,
        method: "createTask",
        args: [
          title,
          description,
          milestones.map((m) => m.description),
          milestones.map((m) => ethers.parseUnits(String(m.amount), 6).toString()),
          destinationDomain,
          destinationRecipient ? ethers.zeroPadValue(destinationRecipient, 32) : ethers.ZeroHash,
        ],
        note: "Approve USDC first, then call createTask. Use Circle Paymaster for gasless execution.",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/:id/accept - Accept a task
 */
router.post("/:id/accept", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (task.status !== "open") return res.status(400).json({ error: "Task is not open" });

  const { worker } = req.body;
  if (!worker) return res.status(400).json({ error: "Missing worker address" });

  task.worker = worker;
  task.status = "in_progress";

  res.json({ task });
});

/**
 * POST /api/tasks/:id/deliver/:milestoneIndex - Deliver a milestone
 */
router.post("/:id/deliver/:milestoneIndex", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const milestoneIndex = parseInt(req.params.milestoneIndex);
  const milestone = task.milestones[milestoneIndex];
  if (!milestone) return res.status(404).json({ error: "Milestone not found" });
  if (milestone.status !== "pending") return res.status(400).json({ error: "Milestone not pending" });

  const { deliverableHash } = req.body;
  milestone.status = "delivered";
  milestone.deliverableHash = deliverableHash || ethers.keccak256(ethers.toUtf8Bytes(Date.now().toString()));

  res.json({ task });
});

/**
 * POST /api/tasks/:id/approve/:milestoneIndex - Approve and release payment
 */
router.post("/:id/approve/:milestoneIndex", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const milestoneIndex = parseInt(req.params.milestoneIndex);
  const milestone = task.milestones[milestoneIndex];
  if (!milestone) return res.status(404).json({ error: "Milestone not found" });
  if (milestone.status !== "delivered") return res.status(400).json({ error: "Milestone not delivered" });

  milestone.status = "approved";
  task.releasedAmount += milestone.amount;

  // Check if all milestones complete
  const allDone = task.milestones.every((m) => m.status === "approved");
  if (allDone) {
    task.status = "completed";
    task.completedAt = Date.now();
  }

  const fee = milestone.amount * 0.015;
  const workerPayout = milestone.amount - fee;

  res.json({
    task,
    payment: {
      milestoneAmount: milestone.amount,
      platformFee: fee,
      workerPayout,
      currency: "USDC",
      note: "On-chain: call approveMilestone(taskId, milestoneIndex) on NexusEscrow contract",
    },
  });
});

/**
 * GET /api/tasks/stats/overview - Platform statistics
 */
router.get("/stats/overview", (req, res) => {
  const taskList = Array.from(tasks.values());
  const completed = taskList.filter((t) => t.status === "completed");
  const totalVolume = completed.reduce((sum, t) => sum + t.totalAmount, 0);

  res.json({
    totalTasks: taskList.length,
    openTasks: taskList.filter((t) => t.status === "open").length,
    inProgress: taskList.filter((t) => t.status === "in_progress").length,
    completed: completed.length,
    totalVolumeUSDC: totalVolume,
    platformFeesUSDC: totalVolume * 0.015,
  });
});

module.exports = router;
