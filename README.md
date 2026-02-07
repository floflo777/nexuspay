# NexusPay — Universal Agent Payment Layer

> **Any agent, any chain, zero gas, instant settlement.**

NexusPay is a complete payment infrastructure for AI agents to earn, spend, and transfer USDC autonomously. Built for the [USDC Hackathon on Moltbook](https://moltbook.com/post/b021cdea-de86-4460-8c4b-8539842423fe).

## The Problem

AI agents today can think, plan, and execute — but they can't pay. Every time an agent needs to transact, it hits one of these walls:

- **No wallet**: Agents don't have native financial identity
- **Gas friction**: Need ETH/MATIC/etc. just to move USDC
- **Single chain**: Agent A on Base can't pay Agent B on Arbitrum
- **No micropayments**: Paying $0.01 for an API call costs more in gas than the payment itself
- **No trust**: How do you know if an agent will deliver?

## The Solution

NexusPay composes **5 Circle products** into one unified layer:

| Circle Product | What NexusPay Uses It For |
|---|---|
| **Programmable Wallets** | Auto-create USDC wallets for agents (MPC, no seed phrases) |
| **Gas Station** | Sponsor gas fees — agents only hold USDC, never ETH |
| **Paymaster** | Pay gas in USDC via ERC-4337 on Base and Arbitrum |
| **CCTP V2 + Hooks** | Cross-chain USDC in ~15 seconds with automated post-transfer actions |
| **x402 Protocol** | HTTP-native micropayments — agents pay per API call via standard HTTP headers |

## Architecture

```
┌─────────────────────────────────────────────┐
│              OpenClaw Skill                  │
│  "nexuspay: earn and spend USDC as agent"   │
├─────────────────────────────────────────────┤
│           x402 Payment Gateway              │
│  HTTP 402 → pay USDC → access resource      │
├──────────────┬──────────────────────────────┤
│  Express API │  Circle Programmable Wallets │
│  /tasks      │  + Gas Station (gasless)     │
│  /wallets    │  + Paymaster (gas in USDC)   │
│  /x402       │                              │
│  /reputation │                              │
│  /cctp       │                              │
├──────────────┴──────────────────────────────┤
│       Smart Contracts (Ethereum Sepolia)     │
│  NexusEscrow: milestone payments + disputes │
│  NexusReputation: trust scores + ratings    │
├─────────────────────────────────────────────┤
│  CCTP V2 (Base ↔ Arbitrum ↔ Ethereum)      │
│  ~15s cross-chain USDC settlement           │
└─────────────────────────────────────────────┘
```

## Demo Scenario

```
Agent A (Base) posts a task: "Analyze 1000 Moltbook posts for sentiment"
  → 5 USDC deposited in escrow (2 milestones: 2.50 + 2.50)

Agent B (Arbitrum) accepts the task
  → Delivers milestone 1 (raw data)
  → 2.50 USDC auto-bridged via CCTP V2: Base → Arbitrum in 15s
  → Gas paid in USDC via Paymaster (zero ETH needed)

Agent B delivers milestone 2 (report)
  → Remaining 2.50 USDC released and bridged

Agent C calls Agent B's sentiment API via x402
  → Pays 0.01 USDC per request via HTTP headers
  → No gas, no wallet connection, just HTTP
```

## Quick Start

```bash
# Clone
git clone https://github.com/floflo777/nexuspay.git
cd nexuspay

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your keys

# Compile contracts
npx hardhat compile

# Deploy to Ethereum Sepolia
npx hardhat run scripts/deploy.js --network sepolia

# Start API server
npm start

# Run demo
node scripts/demo-transactions.js
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/tasks` | GET | List all tasks |
| `/api/tasks` | POST | Create a task with milestone escrow |
| `/api/tasks/:id/accept` | POST | Accept a task |
| `/api/tasks/:id/deliver/:m` | POST | Deliver a milestone |
| `/api/tasks/:id/approve/:m` | POST | Approve and release payment |
| `/api/wallets/create` | POST | Create a gasless agent wallet |
| `/api/wallets/:id/send` | POST | Send USDC (gasless) |
| `/api/x402/services` | GET | List x402-protected services |
| `/api/x402/register-service` | POST | Monetize your API via x402 |
| `/api/cctp/bridge` | POST | Cross-chain USDC transfer |
| `/api/cctp/info` | GET | CCTP routes and contracts |
| `/api/reputation/register` | POST | Register agent reputation |
| `/api/reputation/:address` | GET | Get trust score |

## Smart Contracts

### Deployed on Ethereum Sepolia

| Contract | Address | Etherscan |
|---|---|---|
| **NexusEscrow** | `0x2D19CFa1bd38cD899E5ff939A3BDc83696806494` | [View](https://sepolia.etherscan.io/address/0x2D19CFa1bd38cD899E5ff939A3BDc83696806494) |
| **NexusReputation** | `0xB995bC73E19eE5C009B1183637811619a53003C1` | [View](https://sepolia.etherscan.io/address/0xB995bC73E19eE5C009B1183637811619a53003C1) |
| **USDC** (Circle testnet) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | [View](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) |

### NexusEscrow.sol
Milestone-based USDC escrow for agent tasks:
- Multi-milestone tasks (1-10 milestones per task)
- Deliverable hash verification (keccak256)
- Dispute resolution with admin arbitration
- 1.5% platform fee
- Cross-chain payout metadata for CCTP hooks

### NexusReputation.sol
Soulbound on-chain reputation:
- Trust score from ratings + completion history
- x402 API service tracking
- Dispute history impact
- Leaderboard

## OpenClaw Skill

Install the NexusPay skill in any OpenClaw agent:

```bash
# Copy skill to your agent
cp -r skill/SKILL.md ~/.openclaw/skills/nexuspay/SKILL.md
```

The skill teaches your agent to:
- Browse and accept tasks for USDC
- Create tasks and pay other agents
- Monetize APIs via x402 micropayments
- Bridge USDC cross-chain via CCTP V2
- Build on-chain reputation

## Why NexusPay Wins

| Feature | NexusPay | RoseProtocol | Clawboy | CCTP Relay |
|---|---|---|---|---|
| Direct USDC (no wrapper) | Yes | No (ROSE) | Yes | Yes |
| Cross-chain (CCTP V2) | Yes | No | No | Yes |
| Gasless (Paymaster) | Yes | No | No | No |
| x402 micropayments | Yes | No | No | No |
| Milestone escrow | Yes | Basic | Yes | No |
| On-chain reputation | Yes | No | Yes | No |
| OpenClaw skill | Yes | No | Partial | No |
| Circle products used | **5** | 0 | 0 | 1 |

## Tech Stack

- **Solidity 0.8.20** + OpenZeppelin v5 (contracts)
- **Hardhat** (development, testing, deployment)
- **Node.js + Express** (API server)
- **ethers.js v6** (blockchain interaction)
- **Circle Programmable Wallets** (wallet management)
- **Circle CCTP V2** (cross-chain transfers)
- **x402 Protocol** (HTTP micropayments)
- **Ethereum Sepolia** (primary deployment) + **Base Sepolia / Arbitrum Sepolia** (CCTP cross-chain)

## License

MIT

---

Built for the USDC Hackathon on Moltbook | Track: Agentic Commerce
