// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NexusEscrow
 * @notice Milestone-based escrow for AI agent task marketplace with USDC payments
 * @dev Supports multi-milestone tasks, dispute resolution, and CCTP hook metadata
 */
contract NexusEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    enum TaskStatus { Open, Accepted, InProgress, Completed, Disputed, Cancelled }
    enum MilestoneStatus { Pending, Delivered, Approved, Disputed, Released }

    struct Milestone {
        string description;
        uint256 amount;
        MilestoneStatus status;
        bytes32 deliverableHash; // keccak256 of deliverable for verification
    }

    struct Task {
        address client;         // agent posting the task
        address worker;         // agent executing the task
        string title;
        string description;
        TaskStatus status;
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 milestoneCount;
        uint256 createdAt;
        uint256 completedAt;
        uint32 destinationDomain; // CCTP domain for cross-chain payout (0=ETH, 3=ARB, 6=BASE)
        bytes32 destinationRecipient; // CCTP recipient address (bytes32 for cross-chain)
    }

    uint256 public taskCounter;
    uint256 public constant PLATFORM_FEE_BPS = 150; // 1.5%
    uint256 public constant DISPUTE_BOND_BPS = 500;  // 5% bond for disputes
    address public admin;
    address public feeCollector;

    mapping(uint256 => Task) public tasks;
    mapping(uint256 => mapping(uint256 => Milestone)) public milestones;
    mapping(address => uint256) public agentTasksCompleted;
    mapping(address => uint256) public agentTotalEarned;
    mapping(address => uint256) public agentDisputesLost;

    event TaskCreated(uint256 indexed taskId, address indexed client, string title, uint256 totalAmount, uint256 milestoneCount);
    event TaskAccepted(uint256 indexed taskId, address indexed worker);
    event MilestoneDelivered(uint256 indexed taskId, uint256 milestoneIndex, bytes32 deliverableHash);
    event MilestoneApproved(uint256 indexed taskId, uint256 milestoneIndex, uint256 amount);
    event MilestoneDisputed(uint256 indexed taskId, uint256 milestoneIndex);
    event TaskCompleted(uint256 indexed taskId, address indexed worker, uint256 totalPaid);
    event TaskCancelled(uint256 indexed taskId);
    event DisputeResolved(uint256 indexed taskId, uint256 milestoneIndex, bool inFavorOfWorker);
    event CrossChainPayoutInitiated(uint256 indexed taskId, uint32 destinationDomain, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "NexusEscrow: not admin");
        _;
    }

    modifier onlyClient(uint256 taskId) {
        require(msg.sender == tasks[taskId].client, "NexusEscrow: not client");
        _;
    }

    modifier onlyWorker(uint256 taskId) {
        require(msg.sender == tasks[taskId].worker, "NexusEscrow: not worker");
        _;
    }

    constructor(address _usdc, address _feeCollector) {
        require(_usdc != address(0), "NexusEscrow: zero USDC address");
        usdc = IERC20(_usdc);
        admin = msg.sender;
        feeCollector = _feeCollector;
    }

    /**
     * @notice Create a new task with milestones and deposit USDC
     * @param _title Task title
     * @param _description Task description
     * @param _milestoneDescriptions Array of milestone descriptions
     * @param _milestoneAmounts Array of USDC amounts per milestone (6 decimals)
     * @param _destinationDomain CCTP domain for cross-chain payout (0 for same-chain)
     * @param _destinationRecipient Recipient address as bytes32 (for CCTP)
     */
    function createTask(
        string calldata _title,
        string calldata _description,
        string[] calldata _milestoneDescriptions,
        uint256[] calldata _milestoneAmounts,
        uint32 _destinationDomain,
        bytes32 _destinationRecipient
    ) external nonReentrant returns (uint256 taskId) {
        require(_milestoneDescriptions.length == _milestoneAmounts.length, "NexusEscrow: length mismatch");
        require(_milestoneDescriptions.length > 0 && _milestoneDescriptions.length <= 10, "NexusEscrow: 1-10 milestones");

        uint256 total = 0;
        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            require(_milestoneAmounts[i] > 0, "NexusEscrow: zero amount");
            total += _milestoneAmounts[i];
        }

        // Transfer USDC to escrow
        usdc.safeTransferFrom(msg.sender, address(this), total);

        taskId = taskCounter++;
        Task storage t = tasks[taskId];
        t.client = msg.sender;
        t.title = _title;
        t.description = _description;
        t.status = TaskStatus.Open;
        t.totalAmount = total;
        t.milestoneCount = _milestoneDescriptions.length;
        t.createdAt = block.timestamp;
        t.destinationDomain = _destinationDomain;
        t.destinationRecipient = _destinationRecipient;

        for (uint256 i = 0; i < _milestoneDescriptions.length; i++) {
            milestones[taskId][i] = Milestone({
                description: _milestoneDescriptions[i],
                amount: _milestoneAmounts[i],
                status: MilestoneStatus.Pending,
                deliverableHash: bytes32(0)
            });
        }

        emit TaskCreated(taskId, msg.sender, _title, total, _milestoneDescriptions.length);
    }

    /**
     * @notice Accept an open task as a worker
     */
    function acceptTask(uint256 taskId) external {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Open, "NexusEscrow: not open");
        require(t.client != msg.sender, "NexusEscrow: cannot self-accept");

        t.worker = msg.sender;
        t.status = TaskStatus.InProgress;

        emit TaskAccepted(taskId, msg.sender);
    }

    /**
     * @notice Worker delivers a milestone with a deliverable hash
     */
    function deliverMilestone(uint256 taskId, uint256 milestoneIndex, bytes32 _deliverableHash) external onlyWorker(taskId) {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.InProgress, "NexusEscrow: not in progress");
        require(milestoneIndex < t.milestoneCount, "NexusEscrow: invalid milestone");

        Milestone storage m = milestones[taskId][milestoneIndex];
        require(m.status == MilestoneStatus.Pending, "NexusEscrow: milestone not pending");

        m.status = MilestoneStatus.Delivered;
        m.deliverableHash = _deliverableHash;

        emit MilestoneDelivered(taskId, milestoneIndex, _deliverableHash);
    }

    /**
     * @notice Client approves a delivered milestone, releasing USDC to worker
     */
    function approveMilestone(uint256 taskId, uint256 milestoneIndex) external onlyClient(taskId) nonReentrant {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.InProgress, "NexusEscrow: not in progress");

        Milestone storage m = milestones[taskId][milestoneIndex];
        require(m.status == MilestoneStatus.Delivered, "NexusEscrow: not delivered");

        m.status = MilestoneStatus.Approved;

        uint256 fee = (m.amount * PLATFORM_FEE_BPS) / 10000;
        uint256 workerPayout = m.amount - fee;

        // Pay worker
        usdc.safeTransfer(t.worker, workerPayout);
        // Collect fee
        if (fee > 0) {
            usdc.safeTransfer(feeCollector, fee);
        }

        t.releasedAmount += m.amount;

        emit MilestoneApproved(taskId, milestoneIndex, workerPayout);

        // Check if all milestones are done
        if (_allMilestonesComplete(taskId)) {
            t.status = TaskStatus.Completed;
            t.completedAt = block.timestamp;
            agentTasksCompleted[t.worker]++;
            agentTotalEarned[t.worker] += t.releasedAmount;
            emit TaskCompleted(taskId, t.worker, t.releasedAmount);
        }
    }

    /**
     * @notice Client disputes a delivered milestone
     */
    function disputeMilestone(uint256 taskId, uint256 milestoneIndex) external onlyClient(taskId) {
        Milestone storage m = milestones[taskId][milestoneIndex];
        require(m.status == MilestoneStatus.Delivered, "NexusEscrow: not delivered");

        m.status = MilestoneStatus.Disputed;
        tasks[taskId].status = TaskStatus.Disputed;

        emit MilestoneDisputed(taskId, milestoneIndex);
    }

    /**
     * @notice Admin resolves a dispute
     */
    function resolveDispute(uint256 taskId, uint256 milestoneIndex, bool inFavorOfWorker) external onlyAdmin nonReentrant {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Disputed, "NexusEscrow: not disputed");

        Milestone storage m = milestones[taskId][milestoneIndex];
        require(m.status == MilestoneStatus.Disputed, "NexusEscrow: milestone not disputed");

        if (inFavorOfWorker) {
            m.status = MilestoneStatus.Released;
            uint256 fee = (m.amount * PLATFORM_FEE_BPS) / 10000;
            uint256 workerPayout = m.amount - fee;
            usdc.safeTransfer(t.worker, workerPayout);
            if (fee > 0) {
                usdc.safeTransfer(feeCollector, fee);
            }
            t.releasedAmount += m.amount;
        } else {
            m.status = MilestoneStatus.Pending; // Reset to pending, client can re-assign
            usdc.safeTransfer(t.client, m.amount);
            t.releasedAmount += m.amount; // Track as released (refunded)
            agentDisputesLost[t.worker]++;
        }

        // Return task to InProgress if there are still milestones
        t.status = TaskStatus.InProgress;

        emit DisputeResolved(taskId, milestoneIndex, inFavorOfWorker);

        if (_allMilestonesComplete(taskId)) {
            t.status = TaskStatus.Completed;
            t.completedAt = block.timestamp;
            agentTasksCompleted[t.worker]++;
            agentTotalEarned[t.worker] += t.releasedAmount;
        }
    }

    /**
     * @notice Cancel an open task (only if no worker has accepted)
     */
    function cancelTask(uint256 taskId) external onlyClient(taskId) nonReentrant {
        Task storage t = tasks[taskId];
        require(t.status == TaskStatus.Open, "NexusEscrow: not open");

        t.status = TaskStatus.Cancelled;
        usdc.safeTransfer(t.client, t.totalAmount);

        emit TaskCancelled(taskId);
    }

    // --- View Functions ---

    function getTask(uint256 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }

    function getMilestone(uint256 taskId, uint256 index) external view returns (Milestone memory) {
        return milestones[taskId][index];
    }

    function getAgentStats(address agent) external view returns (
        uint256 completed,
        uint256 earned,
        uint256 disputesLost
    ) {
        return (agentTasksCompleted[agent], agentTotalEarned[agent], agentDisputesLost[agent]);
    }

    function getOpenTasks(uint256 offset, uint256 limit) external view returns (uint256[] memory taskIds) {
        uint256 count = 0;
        uint256[] memory temp = new uint256[](limit);

        for (uint256 i = offset; i < taskCounter && count < limit; i++) {
            if (tasks[i].status == TaskStatus.Open) {
                temp[count] = i;
                count++;
            }
        }

        taskIds = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            taskIds[i] = temp[i];
        }
    }

    // --- Internal ---

    function _allMilestonesComplete(uint256 taskId) internal view returns (bool) {
        Task storage t = tasks[taskId];
        for (uint256 i = 0; i < t.milestoneCount; i++) {
            MilestoneStatus s = milestones[taskId][i].status;
            if (s != MilestoneStatus.Approved && s != MilestoneStatus.Released) {
                return false;
            }
        }
        return true;
    }
}
