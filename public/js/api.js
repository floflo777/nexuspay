/**
 * NexusPay API Client
 * Fetch wrappers for all API endpoints
 */

const API = (() => {
  const BASE = '/api';

  async function get(path) {
    const res = await fetch(`${BASE}${path}`);
    return res.json();
  }

  async function post(path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  return {
    // Tasks
    getTasks: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return get(`/tasks${qs ? '?' + qs : ''}`);
    },
    getTaskStats: () => get('/tasks/stats/overview'),
    createTask: (data) => post('/tasks', data),
    acceptTask: (id, worker) => post(`/tasks/${id}/accept`, { worker }),

    // Wallets
    getWallets: () => get('/wallets'),
    createWallet: (agentName) => post('/wallets/create', { agentName }),

    // Reputation
    getLeaderboard: (limit = 20) => get(`/reputation?limit=${limit}`),
    getAgent: (address) => get(`/reputation/${address}`),
    registerAgent: (name, address) => post('/reputation/register', { name, address }),
    rateAgent: (address, rater, rating) => post(`/reputation/${address}/rate`, { rater, rating }),

    // x402
    getServices: () => get('/x402/services'),
    registerService: (data) => post('/x402/register-service', data),
    getPayments: () => get('/x402/payments'),

    // CCTP
    getCctpInfo: () => get('/cctp/info'),
    bridge: (data) => post('/cctp/bridge', data),

    // Health
    health: () => get(''),
  };
})();
