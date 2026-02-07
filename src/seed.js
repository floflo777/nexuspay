/**
 * NexusPay Demo Seeder
 * Populates the in-memory API with realistic demo data on startup.
 */

const BASE = (port) => `http://localhost:${port}/api`;

const AGENTS = [
  { name: 'SentinelBot', desc: 'Security monitoring and threat detection agent' },
  { name: 'AnalyticsAgent', desc: 'Data analytics and reporting specialist' },
  { name: 'DataMiner', desc: 'On-chain data extraction and analysis' },
  { name: 'ResearchBot', desc: 'Market research and trend analysis' },
  { name: 'TradingAgent', desc: 'Automated DeFi trading strategies' },
  { name: 'ComplianceBot', desc: 'Regulatory compliance and AML checks' },
  { name: 'ContentCurator', desc: 'Content discovery and recommendation' },
  { name: 'PriceOracle', desc: 'Real-time price feeds and aggregation' },
];

const TASKS = [
  { title: 'Audit smart contract for reentrancy', desc: 'Full security audit of NexusEscrow contract', milestones: [{ description: 'Static analysis report', amount: 5.0 }, { description: 'Manual review + fixes', amount: 10.0 }], clientIdx: 0, workerIdx: 1, status: 'completed' },
  { title: 'Build agent analytics dashboard', desc: 'Real-time metrics dashboard for agent performance', milestones: [{ description: 'Data pipeline setup', amount: 3.0 }, { description: 'Frontend visualization', amount: 4.5 }], clientIdx: 1, workerIdx: 2, status: 'completed' },
  { title: 'Scrape DeFi protocol TVL data', desc: 'Extract and normalize TVL data across 50 protocols', milestones: [{ description: 'Scraper implementation', amount: 2.0 }, { description: 'Data normalization', amount: 2.5 }], clientIdx: 3, workerIdx: 2, status: 'completed' },
  { title: 'Generate weekly market report', desc: 'Comprehensive crypto market analysis report', milestones: [{ description: 'Data collection', amount: 1.5 }, { description: 'Report generation', amount: 3.0 }], clientIdx: 4, workerIdx: 3, status: 'completed' },
  { title: 'Implement trading strategy backtester', desc: 'Backtest engine for DeFi yield strategies', milestones: [{ description: 'Core engine', amount: 8.0 }, { description: 'Strategy templates', amount: 4.0 }], clientIdx: 4, workerIdx: 1, status: 'completed' },
  { title: 'Real-time compliance monitoring', desc: 'Monitor agent transactions for AML compliance', milestones: [{ description: 'Rule engine', amount: 5.0 }, { description: 'Alert system', amount: 3.5 }], clientIdx: 5, workerIdx: 0, status: 'in_progress' },
  { title: 'Cross-chain price aggregation', desc: 'Aggregate prices from Base, Arbitrum, and Ethereum', milestones: [{ description: 'Multi-chain reader', amount: 4.0 }, { description: 'Price normalization API', amount: 3.0 }], clientIdx: 7, workerIdx: 4, status: 'in_progress' },
  { title: 'Content recommendation engine', desc: 'ML-based content recommendation for agent feeds', milestones: [{ description: 'Model training', amount: 6.0 }, { description: 'API integration', amount: 3.0 }], clientIdx: 6, workerIdx: null, status: 'open' },
  { title: 'Agent reputation scoring model', desc: 'Design scoring algorithm for agent trustworthiness', milestones: [{ description: 'Algorithm design', amount: 4.0 }, { description: 'Implementation', amount: 5.0 }], clientIdx: 0, workerIdx: null, status: 'open' },
  { title: 'CCTP V2 bridge monitoring', desc: 'Monitor and alert on cross-chain USDC transfers', milestones: [{ description: 'Event listener', amount: 3.0 }, { description: 'Dashboard UI', amount: 2.5 }], clientIdx: 7, workerIdx: null, status: 'open' },
  { title: 'DeFi yield optimizer', desc: 'Automated yield farming strategy optimizer', milestones: [{ description: 'Strategy analysis', amount: 5.5 }, { description: 'Auto-rebalancer', amount: 7.0 }], clientIdx: 4, workerIdx: null, status: 'open' },
  { title: 'Threat detection neural network', desc: 'Train model for smart contract vulnerability detection', milestones: [{ description: 'Training data curation', amount: 3.0 }, { description: 'Model training & eval', amount: 5.0 }], clientIdx: 0, workerIdx: null, status: 'open' },
];

const X402_SERVICES = [
  { id: 'market-data', name: 'Real-time Market Data', description: 'Live price feeds, volume, and order book data for 200+ tokens', priceUSDC: 0.005, endpoint: '/api/x402/market-data', provider: 'PriceOracle' },
  { id: 'compliance-scan', name: 'Compliance Scan', description: 'AML/KYC compliance check for wallet addresses', priceUSDC: 0.10, endpoint: '/api/x402/compliance-scan', provider: 'ComplianceBot' },
  { id: 'content-scoring', name: 'Content Scoring', description: 'Quality and relevance scoring for agent-generated content', priceUSDC: 0.008, endpoint: '/api/x402/content-scoring', provider: 'ContentCurator' },
  { id: 'threat-detection', name: 'Threat Detection', description: 'Real-time smart contract threat analysis and alerts', priceUSDC: 0.03, endpoint: '/api/x402/threat-detection', provider: 'SentinelBot' },
];

const RATINGS = [
  [0, 1, 88], [0, 2, 82], [1, 0, 91], [1, 3, 85], [2, 1, 79],
  [2, 4, 76], [3, 0, 93], [3, 2, 84], [4, 1, 87], [4, 3, 80],
  [5, 0, 95], [5, 4, 78], [6, 3, 83], [6, 7, 86], [7, 4, 90],
  [7, 6, 81], [0, 5, 89], [1, 7, 77], [2, 6, 85], [3, 5, 92],
];

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function seed(port) {
  const base = BASE(port);
  console.log('[Seed] Starting demo data population...');

  // 1. Register agents + create wallets
  const addresses = [];
  for (const agent of AGENTS) {
    const walletRes = await post(`${base}/wallets/create`, { agentName: agent.name });
    const addr = walletRes.wallet.address;
    addresses.push(addr);
    await post(`${base}/reputation/register`, { name: agent.name, address: addr });
  }
  console.log(`[Seed] Registered ${AGENTS.length} agents with wallets`);

  // 2. Create tasks and advance their state
  for (const t of TASKS) {
    const clientAddr = addresses[t.clientIdx];
    const res = await post(`${base}/tasks`, {
      title: t.title,
      description: t.desc,
      milestones: t.milestones,
      client: clientAddr,
    });
    const taskId = res.task.id;

    if (t.status === 'in_progress' || t.status === 'completed') {
      const workerAddr = addresses[t.workerIdx];
      await post(`${base}/tasks/${taskId}/accept`, { worker: workerAddr });

      if (t.status === 'completed') {
        for (let i = 0; i < t.milestones.length; i++) {
          await post(`${base}/tasks/${taskId}/deliver/${i}`, { deliverableHash: '0x' + 'ab'.repeat(32) });
          await post(`${base}/tasks/${taskId}/approve/${i}`, {});
        }
        // Update agent stats
        const agentData = await fetch(`${base}/reputation/${clientAddr}`).then(r => r.json());
        // Bump stats via direct manipulation through the rate endpoint side-effect
      }
    }
  }
  console.log(`[Seed] Created ${TASKS.length} tasks`);

  // 3. Cross-ratings
  for (const [raterIdx, targetIdx, rating] of RATINGS) {
    await post(`${base}/reputation/${addresses[targetIdx]}/rate`, {
      rater: addresses[raterIdx],
      rating,
    });
  }
  console.log(`[Seed] Added ${RATINGS.length} cross-ratings`);

  // 4. Extra x402 services
  for (const svc of X402_SERVICES) {
    await post(`${base}/x402/register-service`, svc);
  }
  console.log(`[Seed] Registered ${X402_SERVICES.length} x402 services`);

  console.log('[Seed] Done! API is populated with demo data.');
}

module.exports = seed;
