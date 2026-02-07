// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NexusReputation
 * @notice On-chain reputation system for AI agents in the NexusPay ecosystem
 * @dev Soulbound reputation - cannot be transferred, only earned through task completion
 */
contract NexusReputation {

    struct AgentProfile {
        string name;
        uint256 registeredAt;
        uint256 tasksCompleted;
        uint256 tasksPosted;
        uint256 totalEarned;     // in USDC (6 decimals)
        uint256 totalSpent;      // in USDC (6 decimals)
        uint256 avgRating;       // 1-100 scale (multiply by 100 for 2 decimal precision)
        uint256 ratingCount;
        uint256 disputesWon;
        uint256 disputesLost;
        uint256 x402CallsServed; // number of x402 API calls served
        uint256 x402Revenue;     // USDC earned from x402 endpoints
        bool exists;
    }

    mapping(address => AgentProfile) public profiles;
    address[] public registeredAgents;

    address public escrowContract;
    address public admin;

    event AgentRegistered(address indexed agent, string name);
    event ReputationUpdated(address indexed agent, uint256 tasksCompleted, uint256 avgRating);
    event RatingSubmitted(address indexed agent, address indexed rater, uint8 rating);
    event X402StatsUpdated(address indexed agent, uint256 callsServed, uint256 revenue);

    modifier onlyAuthorized() {
        require(msg.sender == escrowContract || msg.sender == admin, "NexusRep: unauthorized");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "NexusRep: not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setEscrowContract(address _escrow) external onlyAdmin {
        escrowContract = _escrow;
    }

    /**
     * @notice Register a new agent profile
     */
    function registerAgent(string calldata _name) external {
        require(!profiles[msg.sender].exists, "NexusRep: already registered");
        require(bytes(_name).length > 0 && bytes(_name).length <= 64, "NexusRep: invalid name");

        profiles[msg.sender] = AgentProfile({
            name: _name,
            registeredAt: block.timestamp,
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
            exists: true
        });

        registeredAgents.push(msg.sender);
        emit AgentRegistered(msg.sender, _name);
    }

    /**
     * @notice Record task completion (called by escrow contract)
     */
    function recordTaskCompletion(address agent, uint256 earned) external onlyAuthorized {
        AgentProfile storage p = profiles[agent];
        require(p.exists, "NexusRep: agent not registered");

        p.tasksCompleted++;
        p.totalEarned += earned;

        emit ReputationUpdated(agent, p.tasksCompleted, p.avgRating);
    }

    /**
     * @notice Record task creation (called by escrow contract)
     */
    function recordTaskCreation(address agent, uint256 spent) external onlyAuthorized {
        AgentProfile storage p = profiles[agent];
        require(p.exists, "NexusRep: agent not registered");

        p.tasksPosted++;
        p.totalSpent += spent;
    }

    /**
     * @notice Submit a rating for an agent (1-100 scale)
     */
    function submitRating(address agent, uint8 rating) external {
        require(rating >= 1 && rating <= 100, "NexusRep: rating 1-100");
        require(agent != msg.sender, "NexusRep: cannot self-rate");

        AgentProfile storage p = profiles[agent];
        require(p.exists, "NexusRep: agent not registered");

        // Running average
        uint256 totalRating = p.avgRating * p.ratingCount + rating;
        p.ratingCount++;
        p.avgRating = totalRating / p.ratingCount;

        emit RatingSubmitted(agent, msg.sender, rating);
    }

    /**
     * @notice Record x402 API service stats
     */
    function recordX402Service(address agent, uint256 calls, uint256 revenue) external onlyAuthorized {
        AgentProfile storage p = profiles[agent];
        require(p.exists, "NexusRep: agent not registered");

        p.x402CallsServed += calls;
        p.x402Revenue += revenue;

        emit X402StatsUpdated(agent, p.x402CallsServed, p.x402Revenue);
    }

    /**
     * @notice Record dispute outcome
     */
    function recordDispute(address winner, address loser) external onlyAuthorized {
        if (profiles[winner].exists) profiles[winner].disputesWon++;
        if (profiles[loser].exists) profiles[loser].disputesLost++;
    }

    // --- View Functions ---

    function getProfile(address agent) external view returns (AgentProfile memory) {
        return profiles[agent];
    }

    function getTrustScore(address agent) external view returns (uint256) {
        AgentProfile storage p = profiles[agent];
        if (!p.exists || p.ratingCount == 0) return 0;

        // Trust score = weighted average of rating, completion rate, and dispute history
        uint256 ratingComponent = p.avgRating; // 0-100
        uint256 volumeBonus = p.tasksCompleted > 10 ? 10 : p.tasksCompleted; // 0-10
        uint256 disputePenalty = p.disputesLost * 5; // -5 per lost dispute

        uint256 score = ratingComponent + volumeBonus;
        if (disputePenalty >= score) return 0;
        return score - disputePenalty;
    }

    function getRegisteredAgentCount() external view returns (uint256) {
        return registeredAgents.length;
    }

    function getLeaderboard(uint256 offset, uint256 limit) external view returns (
        address[] memory agents,
        uint256[] memory scores
    ) {
        uint256 total = registeredAgents.length;
        if (offset >= total) {
            return (new address[](0), new uint256[](0));
        }

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;

        agents = new address[](count);
        scores = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            address a = registeredAgents[offset + i];
            agents[i] = a;
            scores[i] = this.getTrustScore(a);
        }
    }
}
