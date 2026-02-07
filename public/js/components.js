/**
 * NexusPay UI Components
 * HTML generators for cards, tables, badges
 */

const Components = (() => {
  function badge(status) {
    const map = {
      open: 'badge-open',
      in_progress: 'badge-progress',
      completed: 'badge-completed',
    };
    const label = status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1);
    return `<span class="badge ${map[status] || 'badge-open'}">${label}</span>`;
  }

  function truncAddr(addr) {
    if (!addr) return '—';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  }

  function taskCard(task) {
    const totalMilestones = task.milestones.length;
    const completedMilestones = task.milestones.filter(m => m.status === 'approved').length;
    const progressPct = totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;

    return `
      <div class="task-item">
        <div class="task-header">
          <span class="task-title">${task.title}</span>
          ${badge(task.status)}
        </div>
        <div class="task-meta">
          <span><strong>${task.totalAmount.toFixed(2)}</strong> USDC</span>
          <span>${totalMilestones} milestone${totalMilestones !== 1 ? 's' : ''}</span>
          <span class="mono">${truncAddr(task.client)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPct}%"></div>
        </div>
      </div>`;
  }

  function statCard(icon, value, label, id) {
    return `
      <div class="stat-card reveal">
        <div class="stat-icon">${icon}</div>
        <div class="stat-value" data-counter="${id}">${value}</div>
        <div class="stat-label">${label}</div>
      </div>`;
  }

  function leaderboardRow(agent, rank) {
    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-default';
    const trustPct = Math.min(agent.trustScore, 100);
    const earnings = (agent.totalEarned || 0).toFixed(2);

    return `
      <tr>
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td><strong>${agent.name}</strong></td>
        <td class="mono">${truncAddr(agent.address)}</td>
        <td>
          ${agent.trustScore}
          <div class="trust-bar"><div class="trust-fill" style="width: ${trustPct}%"></div></div>
        </td>
        <td>${agent.avgRating || 0}/100</td>
        <td>${agent.ratingCount || 0}</td>
        <td>${agent.tasksCompleted || 0}</td>
        <td>${earnings} USDC</td>
      </tr>`;
  }

  function serviceCard(service) {
    return `
      <div class="service-card">
        <h3>${service.name}</h3>
        <p>${service.description}</p>
        <div class="service-price">
          $${service.priceUSDC.toFixed(service.priceUSDC < 0.01 ? 3 : 2)}
          <span>USDC / call</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted)">
          Provider: ${service.provider || 'NexusPay'}<br>
          <span class="mono">${service.endpoint}</span>
        </div>
      </div>`;
  }

  function circleProductCard(title, icon, description, tag, tagColor) {
    return `
      <div class="card reveal">
        <div class="card-header">
          <div class="card-icon" style="background: ${tagColor}15">${icon}</div>
          <h3>${title}</h3>
        </div>
        <p>${description}</p>
        <span class="card-tag" style="background: ${tagColor}15; color: ${tagColor}">${tag}</span>
      </div>`;
  }

  return { badge, truncAddr, taskCard, statCard, leaderboardRow, serviceCard, circleProductCard };
})();
