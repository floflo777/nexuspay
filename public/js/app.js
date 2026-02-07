/**
 * NexusPay Main Application
 * Loads data from API, populates DOM, handles forms
 */

const App = (() => {
  let refreshTimer = null;

  // ═══ DATA LOADERS ═══

  async function loadStats() {
    try {
      const data = await API.getTaskStats();
      const services = await API.getServices();

      const counters = {
        'stat-tasks': { value: data.totalTasks || 0, suffix: '' },
        'stat-volume': { value: data.totalVolumeUSDC || 0, prefix: '$', suffix: '' },
        'stat-agents': { value: 0, suffix: '' },
        'stat-x402': { value: (services.services || []).length, suffix: '' },
      };

      // Get agent count
      const rep = await API.getLeaderboard(100);
      counters['stat-agents'].value = rep.total || 0;

      Object.entries(counters).forEach(([id, conf]) => {
        const el = document.querySelector(`[data-counter="${id}"]`);
        if (el) {
          el.dataset.target = conf.value;
          el.dataset.prefix = conf.prefix || '';
          el.dataset.suffix = conf.suffix || '';
          // If already visible, animate immediately
          if (el.dataset.animated === 'true') {
            Animations.animateCounter(el, conf.value);
          } else {
            el.textContent = (conf.prefix || '') + conf.value + (conf.suffix || '');
          }
        }
      });
    } catch (e) {
      console.warn('Stats load failed:', e);
    }
  }

  async function loadTasks() {
    try {
      const data = await API.getTasks({ limit: 50 });
      const container = document.getElementById('task-list');
      if (!container) return;

      if (!data.tasks || data.tasks.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted)">No tasks yet. Create one!</div>';
        return;
      }

      container.innerHTML = data.tasks.map(t => Components.taskCard(t)).join('');
    } catch (e) {
      console.warn('Tasks load failed:', e);
    }
  }

  async function loadLeaderboard() {
    try {
      const data = await API.getLeaderboard(10);
      const tbody = document.getElementById('leaderboard-body');
      if (!tbody) return;

      if (!data.leaderboard || data.leaderboard.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:2rem;">No agents registered yet</td></tr>';
        return;
      }

      tbody.innerHTML = data.leaderboard.map((a, i) => Components.leaderboardRow(a, i + 1)).join('');
    } catch (e) {
      console.warn('Leaderboard load failed:', e);
    }
  }

  async function loadServices() {
    try {
      const data = await API.getServices();
      const container = document.getElementById('services-grid');
      if (!container || !data.services) return;

      container.innerHTML = data.services.map(s => Components.serviceCard(s)).join('');
    } catch (e) {
      console.warn('Services load failed:', e);
    }
  }

  // ═══ FORM HANDLERS ═══

  function initCreateTaskForm() {
    const form = document.getElementById('create-task-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = form.querySelector('[name="title"]').value;
      const description = form.querySelector('[name="description"]').value;
      const m1desc = form.querySelector('[name="m1desc"]').value;
      const m1amount = parseFloat(form.querySelector('[name="m1amount"]').value);
      const client = form.querySelector('[name="client"]').value;

      if (!title || !m1desc || !m1amount || !client) return;

      try {
        const result = await API.createTask({
          title,
          description,
          milestones: [{ description: m1desc, amount: m1amount }],
          client,
        });

        if (result.task) {
          const success = form.querySelector('.form-success');
          success.textContent = `Task #${result.task.id} created!`;
          success.style.display = 'block';
          form.reset();
          setTimeout(() => { success.style.display = 'none'; }, 3000);
          loadTasks();
          loadStats();
        }
      } catch (e) {
        console.error('Create task failed:', e);
      }
    });
  }

  function initBridgeForm() {
    const form = document.getElementById('bridge-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const from = form.querySelector('[name="from"]').value;
      const to = form.querySelector('[name="to"]').value;
      const amount = form.querySelector('[name="amount"]').value;
      const sender = form.querySelector('[name="sender"]').value;

      if (!amount || !sender) return;

      try {
        const result = await API.bridge({ from, to, amount, sender });
        const success = form.querySelector('.form-success');
        success.textContent = `Bridge initiated: ${amount} USDC ${result.bridge?.from} → ${result.bridge?.to}`;
        success.style.display = 'block';
        setTimeout(() => { success.style.display = 'none'; }, 4000);
      } catch (e) {
        console.error('Bridge failed:', e);
      }
    });
  }

  // ═══ API DOCS TABS ═══

  function initDocsTabs() {
    const tabs = document.querySelectorAll('.doc-tab');
    const panels = document.querySelectorAll('.doc-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(`docs-${tab.dataset.tab}`);
        if (panel) panel.classList.add('active');
      });
    });
  }

  // ═══ REFRESH LOOP ═══

  function startAutoRefresh() {
    refreshTimer = setInterval(() => {
      loadStats();
      loadTasks();
      loadLeaderboard();
    }, 30000);
  }

  // ═══ INIT ═══

  async function init() {
    Animations.initAll();
    initCreateTaskForm();
    initBridgeForm();
    initDocsTabs();

    // Load all data
    await Promise.all([
      loadStats(),
      loadTasks(),
      loadLeaderboard(),
      loadServices(),
    ]);

    startAutoRefresh();
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { loadStats, loadTasks, loadLeaderboard, loadServices };
})();
