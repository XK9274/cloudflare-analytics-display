/**
 * AnalyticsDashboard class: handles UI updates and fetching
 */
class AnalyticsDashboard {
  constructor() {
    this.trafficChart = null;
    this.httpStatusChart = null;
    this.refreshInterval = 30; // seconds
    this.refreshTimer = null;
    this.countdownTimer = null;
    this.lastUpdateTime = null;
    this.isLoading = false;
    this.isFirstLoad = true;

    this.init();
  }

  updateTopPaths(paths) {
    const list = document.getElementById('pathsList');
    if (!list) return;
    if (!paths || paths.length === 0) {
      list.innerHTML = '<div class="loading">No path data available</div>';
      return;
    }
    const html = paths.slice(0, 8).map(item => {
      const path = item.path || '/';
      const requests = item.requests || 0;
      const bytes = item.bytes || 0;
      return `
        <div class="geo-item">
          <div class="geo-country"><span>${path}</span></div>
          <div class="geo-stats">
            <span class="geo-stat primary">${formatNumber(requests)} req</span>
            <span class="geo-stat">${formatBytes(bytes)}</span>
          </div>
        </div>
      `;
    }).join('');
    list.innerHTML = html;
  }

  updateCacheBreakdown(breakdown) {
    const list = document.getElementById('cacheList');
    if (!list) return;
    if (!breakdown || Object.keys(breakdown).length === 0) {
      list.innerHTML = '<div class="loading">No cache status data</div>';
      return;
    }
    const order = ['HIT','MISS','BYPASS','EXPIRED','STALE','REVALIDATED','UPDATING','UNKNOWN'];
    const items = Object.entries(breakdown).map(([k,v]) => ({ status: k.toUpperCase(), requests: v.requests||0, bytes: v.bytes||0 }));
    items.sort((a,b)=>{
      const ai = order.indexOf(a.status);
      const bi = order.indexOf(b.status);
      if (ai === -1 && bi === -1) return b.requests - a.requests;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    const html = items.map(item => `
      <div class="geo-item">
        <div class="geo-country"><span>${item.status}</span></div>
        <div class="geo-stats">
          <span class="geo-stat primary">${formatNumber(item.requests)} req</span>
          <span class="geo-stat">${formatBytes(item.bytes)}</span>
        </div>
      </div>
    `).join('');
    list.innerHTML = html;
  }

  init() {
    console.log('Initializing Cloudflare Analytics Dashboard');

    // Install error handler early so early failures don't leave the loader stuck
    window.addEventListener('error', (event) => {
      console.error('Dashboard error:', event.error || event.message || event);
      this.showError('Dashboard initialization failed');
      this.showLoading(false);
    });

    // Initialize clock
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);

    // Initialize theme from localStorage if set
    this.initTheme();

    // Fetch data first to avoid blocking on chart init
    this.fetchAnalytics();

    // Initialize dashboard (safe-guarded)
    try {
      this.initializeCharts();
    } catch (err) {
      console.error('Chart initialization failed:', err);
      this.showError('Chart initialization failed');
      this.showLoading(false);
    }

    // Setup refresh timer
    this.startRefreshTimer();

    // Handle visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.fetchAnalytics();
      }
    });
  }

  updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateString = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    document.getElementById('currentTime').textContent = `${dateString} ${timeString}`;
  }

  initializeCharts() {
    const ctx = document.getElementById('trafficChart').getContext('2d');
    const pageviewsColor = this.getCssVariable('--chart-pageviews', '#00d4ff');
    const cachedPageviewsColor = this.getCssVariable('--chart-cached-pageviews', '#4ecdc4');
    const requestsColor = this.getCssVariable('--chart-requests', '#ff6b6b');
    const cachedRequestsColor = this.getCssVariable('--chart-cached-requests', '#45b7d1');
    const gridColor = this.getCssVariable('--border-tertiary', 'rgba(127,127,127,0.2)');
    const tickColor = this.getCssVariable('--text-tertiary', '#888');
    const tooltipBg = this.getCssVariable('--bg-overlay', 'rgba(0,0,0,0.8)');
    const tooltipText = this.getCssVariable('--text-primary', '#fff');
    const tooltipBorder = this.getCssVariable('--border-primary', 'rgba(0, 212, 255, 0.5)');

    this.trafficChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Page Views',
            data: [],
            borderColor: pageviewsColor,
            backgroundColor: this.colorWithAlpha(pageviewsColor, 0.12),
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
          {
            label: 'Cached Page Views',
            data: [],
            borderColor: cachedPageviewsColor,
            backgroundColor: this.colorWithAlpha(cachedPageviewsColor, 0.12),
            borderWidth: 2,
            borderDash: [5, 4],
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
          {
            label: 'Requests',
            data: [],
            borderColor: requestsColor,
            backgroundColor: this.colorWithAlpha(requestsColor, 0.12),
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
          {
            label: 'Cached Requests',
            data: [],
            borderColor: cachedRequestsColor,
            backgroundColor: this.colorWithAlpha(cachedRequestsColor, 0.12),
            borderWidth: 2,
            borderDash: [5, 4],
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: tooltipBg, titleColor: tooltipText, bodyColor: tooltipText, borderColor: tooltipBorder, borderWidth: 1 },
        },
        scales: {
          x: {
            display: true,
            grid: { color: gridColor, drawBorder: false },
            ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 12 },
          },
          y: {
            display: true,
            grid: { color: gridColor, drawBorder: false },
            ticks: { color: tickColor, font: { size: 10 }, callback: (v) => formatNumber(v) },
          },
        },
        elements: { line: { borderJoinStyle: 'round' } },
      },
    });

    const statusCanvas = document.getElementById('httpStatusChart');
    if (statusCanvas) {
      const statusCtx = statusCanvas.getContext('2d');
      const status2xxColor = this.getCssVariable('--status-success', '#4ecdc4');
      const status3xxColor = this.getCssVariable('--status-redirect', '#45b7d1');
      const status4xxColor = this.getCssVariable('--status-error', '#ff6b6b');
      const status5xxColor = this.getCssVariable('--status-server-error', '#ff4757');

      this.httpStatusChart = new Chart(statusCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: '2xx',
              data: [],
              borderColor: status2xxColor,
              backgroundColor: this.colorWithAlpha(status2xxColor, 0.2),
              borderWidth: 1.5,
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              stack: 'status',
            },
            {
              label: '3xx',
              data: [],
              borderColor: status3xxColor,
              backgroundColor: this.colorWithAlpha(status3xxColor, 0.2),
              borderWidth: 1.5,
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              stack: 'status',
            },
            {
              label: '4xx',
              data: [],
              borderColor: status4xxColor,
              backgroundColor: this.colorWithAlpha(status4xxColor, 0.2),
              borderWidth: 1.5,
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              stack: 'status',
            },
            {
              label: '5xx',
              data: [],
              borderColor: status5xxColor,
              backgroundColor: this.colorWithAlpha(status5xxColor, 0.2),
              borderWidth: 1.5,
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              stack: 'status',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: tooltipBg, titleColor: tooltipText, bodyColor: tooltipText, borderColor: tooltipBorder, borderWidth: 1 },
          },
          scales: {
            x: {
              display: true,
              grid: { color: gridColor, drawBorder: false },
              ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 12 },
            },
            y: {
              display: true,
              stacked: true,
              grid: { color: gridColor, drawBorder: false },
              ticks: { color: tickColor, font: { size: 10 }, callback: (v) => formatNumber(v) },
            },
          },
          elements: { line: { borderJoinStyle: 'round' } },
        },
      });
    }

    this.applyTrafficChartTheme();
    this.applyHttpStatusChartTheme();
  }

  async fetchAnalytics() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.showLoading(true);
    this.hideError();

    try {
      const response = await fetch('/api/analytics');
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      this.updateDashboard(data);
      this.lastUpdateTime = new Date();
      this.refreshInterval = data.refreshInterval || 30;
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      this.showError(`Failed to load data: ${error.message}`);
    } finally {
      this.isLoading = false;
      this.showLoading(false);
      this.isFirstLoad = false;
    }
  }

  updateDashboard(data) {
    this.updateMetrics(data.totals, data.cache);
    this.updateTrafficChart(data.timeseries);
    this.updateGeographicData(data.geographic);
    this.updateHttpStatus(data.httpStatus);
    this.updateHttpStatusTrend(data.httpStatusSeries);
    this.updateLastUpdated(data.lastUpdated);
    this.updateSystemInfo(data);
  }

  updateMetrics(totals, cache) {
    // Page Views
    const pageviews = totals.pageviews || 0;
    document.getElementById('pageviews').textContent = formatNumber(pageviews);
    const pvCached = (cache && cache.estCachedPageviews) || 0;
    const pvCachedEl = document.getElementById('pageviewsCached');
    if (pvCachedEl) pvCachedEl.textContent = formatNumber(pvCached);

    // Unique Visitors
    const uniques = totals.uniques || 0;
    document.getElementById('uniques').textContent = formatNumber(uniques);
    const uqCached = (cache && cache.estCachedUniques) || 0;
    const uqCachedEl = document.getElementById('uniquesCached');
    if (uqCachedEl) uqCachedEl.textContent = formatNumber(uqCached);

    // Total Requests
    const requests = totals.requests || 0;
    document.getElementById('requests').textContent = formatNumber(requests);
    const reqCached = (cache && cache.cachedRequests) || 0;
    const reqCachedEl = document.getElementById('requestsCached');
    if (reqCachedEl) reqCachedEl.textContent = formatNumber(reqCached);
    const cacheHitRateEl = document.getElementById('cacheHitRate');
    if (cache && cacheHitRateEl && cache.cacheRatio !== undefined) {
      cacheHitRateEl.textContent = `${Math.round(cache.cacheRatio * 100)}% hit`;
    }

    // Bandwidth
    const bandwidth = totals.bytes || 0;
    document.getElementById('bandwidth').textContent = formatBytes(bandwidth);
    const estCachedBytes = cache && cache.cacheRatio ? Math.round(bandwidth * cache.cacheRatio) : 0;
    const bwCachedEl = document.getElementById('bandwidthCached');
    if (bwCachedEl) bwCachedEl.textContent = formatBytes(estCachedBytes);

    // Add pulse animation to updated cards
    ['pageviewsCard','pageviewsCachedCard','uniquesCard','uniquesCachedCard','requestsCard','requestsCachedCard','bandwidthCard','bandwidthCachedCard'].forEach(id => {
      const card = document.getElementById(id);
      if (card) {
        card.style.animation = 'none';
        setTimeout(() => { card.style.animation = 'pulse 0.5s ease-in-out'; }, 10);
      }
    });
  }

  updateTrafficChart(timeseries) {
    if (!this.trafficChart) return;
    if (!timeseries || timeseries.length === 0) {
      this.trafficChart.data.labels = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);
      this.trafficChart.data.datasets[0].data = new Array(24).fill(0);
      this.trafficChart.data.datasets[1].data = new Array(24).fill(0);
      this.trafficChart.data.datasets[2].data = new Array(24).fill(0);
      this.trafficChart.data.datasets[3].data = new Array(24).fill(0);
      this.trafficChart.update('none');
      return;
    }

    const labels = timeseries.map(p => {
      const d = new Date(p.datetime);
      return `${d.getHours().toString().padStart(2, '0')}:00`;
    });
    const pageviewsData = timeseries.map(p => p.pageviews || 0);
    const requestsData = timeseries.map(p => p.requests || 0);
    const cachedPageviewsData = timeseries.map(p => {
      if (typeof p.cachedPageviews === 'number') return p.cachedPageviews;
      const ratio = p.cacheRatio || 0;
      return Math.round((p.pageviews || 0) * ratio);
    });
    const cachedRequestsData = timeseries.map(p => p.cachedRequests || 0);

    this.trafficChart.data.labels = labels;
    this.trafficChart.data.datasets[0].data = pageviewsData;
    this.trafficChart.data.datasets[1].data = cachedPageviewsData;
    this.trafficChart.data.datasets[2].data = requestsData;
    this.trafficChart.data.datasets[3].data = cachedRequestsData;
    this.trafficChart.update('none');
  }

  updateGeographicData(geographic) {
    const geoList = document.getElementById('geoList');
    if (!geographic || geographic.length === 0) {
      geoList.innerHTML = '<div class="loading">No geographic data available</div>';
      return;
    }
    const geoHTML = geographic.slice(0, 8).map((country) => {
      const countryName = this.getCountryName(country.country);
      const requests = country.requests || 0;
      const pageviews = country.pageviews || 0;
      return `
        <div class="geo-item">
          <div class="geo-country"><span>${countryName}</span></div>
          <div class="geo-stats">
            <span class="geo-stat primary">${formatNumber(pageviews)}</span>
            <span class="geo-stat">${formatNumber(requests)} req</span>
          </div>
        </div>
      `;
    }).join('');
    geoList.innerHTML = geoHTML;
  }

  updateHttpStatus(httpStatus) {
    let status2xx = 0, status3xx = 0, status4xx = 0, status5xx = 0;
    if (!httpStatus) httpStatus = {};

    if (typeof httpStatus === 'object' && !Array.isArray(httpStatus)) {
      status2xx = httpStatus['2xx'] || 0;
      status3xx = httpStatus['3xx'] || 0;
      status4xx = httpStatus['4xx'] || 0;
      status5xx = httpStatus['5xx'] || 0;
    } else if (Array.isArray(httpStatus)) {
      httpStatus.forEach((status) => {
        const code = status.edgeResponseStatus || status.httpStatusCode;
        const requests = status.requests || 0;
        if (code >= 200 && code < 300) status2xx += requests;
        else if (code >= 300 && code < 400) status3xx += requests;
        else if (code >= 400 && code < 500) status4xx += requests;
        else if (code >= 500 && code < 600) status5xx += requests;
      });
    }

    document.getElementById('status2xx').textContent = formatNumber(status2xx);
    document.getElementById('status3xx').textContent = formatNumber(status3xx);
    document.getElementById('status4xx').textContent = formatNumber(status4xx);
    document.getElementById('status5xx').textContent = formatNumber(status5xx);
  }

  updateHttpStatusTrend(statusSeries) {
    if (!this.httpStatusChart) return;

    if (!statusSeries || statusSeries.length === 0) {
      const fallbackLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
      const zeroData = new Array(fallbackLabels.length).fill(0);
      this.httpStatusChart.data.labels = fallbackLabels;
      this.httpStatusChart.data.datasets.forEach((dataset) => {
        dataset.data = zeroData.slice();
      });
      this.httpStatusChart.update('none');
      return;
    }

    const labels = statusSeries.map((point) => {
      const d = new Date(point.datetime);
      return `${d.getHours().toString().padStart(2, '0')}:00`;
    });

    this.httpStatusChart.data.labels = labels;
    this.httpStatusChart.data.datasets[0].data = statusSeries.map((point) => point['2xx'] || 0);
    this.httpStatusChart.data.datasets[1].data = statusSeries.map((point) => point['3xx'] || 0);
    this.httpStatusChart.data.datasets[2].data = statusSeries.map((point) => point['4xx'] || 0);
    this.httpStatusChart.data.datasets[3].data = statusSeries.map((point) => point['5xx'] || 0);
    this.httpStatusChart.update('none');
  }

  updateLastUpdated(lastUpdated) {
    if (lastUpdated) {
      const time = new Date(lastUpdated);
      const timeString = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      document.getElementById('lastUpdated').textContent = `Updated: ${timeString}`;
    }
    const ver = document.body?.dataset?.version;
    if (ver) document.getElementById('buildVersion').textContent = `v${ver}`;
  }

  updateSystemInfo(data) {
    if (data && data.siteStatus) {
      const statusElement = document.getElementById('systemStatus');
      const status = data.siteStatus.status;
      const message = data.siteStatus.message;
      statusElement.textContent = message || status;
      statusElement.className = 'info-value';
      switch (status) {
        case 'online': statusElement.classList.add('online'); break;
        case 'offline':
        case 'error': statusElement.classList.add('error'); break;
        default: statusElement.classList.add('warning');
      }
    } else {
      document.getElementById('systemStatus').textContent = 'Online';
      document.getElementById('systemStatus').className = 'info-value online';
    }
    document.getElementById('refreshInterval').textContent = `${this.refreshInterval}s`;
  }

  startRefreshTimer() {
    this.stopRefreshTimer();
    let countdown = this.refreshInterval;
    const updateCountdown = () => {
      document.getElementById('nextUpdate').textContent = `${countdown}s`;
      countdown--;
      if (countdown < 0) countdown = this.refreshInterval;
    };
    updateCountdown();
    this.countdownTimer = setInterval(updateCountdown, 1000);
    this.refreshTimer = setInterval(() => { this.fetchAnalytics(); }, this.refreshInterval * 1000);
  }

  stopRefreshTimer() {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
  }

  showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = (show && this.isFirstLoad) ? 'flex' : 'none';
  }

  applyTrafficChartTheme() {
    if (!this.trafficChart) return;

    const datasetColorMap = {
      'Page Views': this.getCssVariable('--chart-pageviews', '#00d4ff'),
      'Cached Page Views': this.getCssVariable('--chart-cached-pageviews', '#4ecdc4'),
      Requests: this.getCssVariable('--chart-requests', '#ff6b6b'),
      'Cached Requests': this.getCssVariable('--chart-cached-requests', '#45b7d1'),
    };

    this.trafficChart.data.datasets.forEach((dataset) => {
      const baseColor = datasetColorMap[dataset.label];
      if (!baseColor) return;
      dataset.borderColor = baseColor;
      dataset.backgroundColor = this.colorWithAlpha(baseColor, 0.12);
    });

    const gridColor = this.getCssVariable('--border-tertiary', 'rgba(127,127,127,0.2)');
    const tickColor = this.getCssVariable('--text-tertiary', '#888');
    const tooltipBg = this.getCssVariable('--bg-overlay', 'rgba(0,0,0,0.8)');
    const tooltipText = this.getCssVariable('--text-primary', '#fff');
    const tooltipBorder = this.getCssVariable('--border-primary', 'rgba(0, 212, 255, 0.5)');

    this.trafficChart.options.scales.x.grid.color = gridColor;
    this.trafficChart.options.scales.y.grid.color = gridColor;
    this.trafficChart.options.scales.x.ticks.color = tickColor;
    this.trafficChart.options.scales.y.ticks.color = tickColor;
    this.trafficChart.options.plugins.tooltip.backgroundColor = tooltipBg;
    this.trafficChart.options.plugins.tooltip.titleColor = tooltipText;
    this.trafficChart.options.plugins.tooltip.bodyColor = tooltipText;
    this.trafficChart.options.plugins.tooltip.borderColor = tooltipBorder;
    this.trafficChart.update('none');
  }

  applyHttpStatusChartTheme() {
    if (!this.httpStatusChart) return;

    const datasetColorMap = {
      '2xx': this.getCssVariable('--status-success', '#4ecdc4'),
      '3xx': this.getCssVariable('--status-redirect', '#45b7d1'),
      '4xx': this.getCssVariable('--status-error', '#ff6b6b'),
      '5xx': this.getCssVariable('--status-server-error', '#ff4757'),
    };

    this.httpStatusChart.data.datasets.forEach((dataset) => {
      const baseColor = datasetColorMap[dataset.label];
      if (!baseColor) return;
      dataset.borderColor = baseColor;
      dataset.backgroundColor = this.colorWithAlpha(baseColor, 0.2);
    });

    const gridColor = this.getCssVariable('--border-tertiary', 'rgba(127,127,127,0.2)');
    const tickColor = this.getCssVariable('--text-tertiary', '#888');
    const tooltipBg = this.getCssVariable('--bg-overlay', 'rgba(0,0,0,0.8)');
    const tooltipText = this.getCssVariable('--text-primary', '#fff');
    const tooltipBorder = this.getCssVariable('--border-primary', 'rgba(0, 212, 255, 0.5)');

    this.httpStatusChart.options.scales.x.grid.color = gridColor;
    this.httpStatusChart.options.scales.y.grid.color = gridColor;
    this.httpStatusChart.options.scales.x.ticks.color = tickColor;
    this.httpStatusChart.options.scales.y.ticks.color = tickColor;
    this.httpStatusChart.options.plugins.tooltip.backgroundColor = tooltipBg;
    this.httpStatusChart.options.plugins.tooltip.titleColor = tooltipText;
    this.httpStatusChart.options.plugins.tooltip.bodyColor = tooltipText;
    this.httpStatusChart.options.plugins.tooltip.borderColor = tooltipBorder;
    this.httpStatusChart.update('none');
  }

  getCssVariable(name, defaultValue) {
    const bodyStyles = document.body ? getComputedStyle(document.body) : null;
    const rootStyles = getComputedStyle(document.documentElement);
    const bodyValue = bodyStyles ? bodyStyles.getPropertyValue(name) : '';
    const rootValue = rootStyles ? rootStyles.getPropertyValue(name) : '';
    const value = (bodyValue && bodyValue.trim()) || (rootValue && rootValue.trim()) || '';
    return value.length ? value : defaultValue;
  }

  colorWithAlpha(color, alpha = 0.2) {
    if (!color) return `rgba(0,0,0,${alpha})`;
    const trimmed = color.trim();

    const clampAlpha = (value) => Math.min(1, Math.max(0, value));
    const parseHex = (hex) => parseInt(hex, 16);

    if (/^#([0-9a-f]{3})$/i.test(trimmed)) {
      const [, hex] = trimmed.match(/^#([0-9a-f]{3})$/i);
      const r = parseHex(hex[0] + hex[0]);
      const g = parseHex(hex[1] + hex[1]);
      const b = parseHex(hex[2] + hex[2]);
      return `rgba(${r}, ${g}, ${b}, ${clampAlpha(alpha)})`;
    }

    if (/^#([0-9a-f]{6})([0-9a-f]{2})?$/i.test(trimmed)) {
      const [, hex, alphaHex] = trimmed.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
      const r = parseHex(hex.slice(0, 2));
      const g = parseHex(hex.slice(2, 4));
      const b = parseHex(hex.slice(4, 6));
      const existingAlpha = alphaHex ? parseHex(alphaHex) / 255 : 1;
      return `rgba(${r}, ${g}, ${b}, ${clampAlpha(existingAlpha * alpha)})`;
    }

    if (/^rgba?\(/i.test(trimmed)) {
      const values = trimmed
        .replace(/rgba?\(/i, '')
        .replace(/\)/, '')
        .split(',')
        .map((part) => part.trim());
      const r = parseFloat(values[0]) || 0;
      const g = parseFloat(values[1]) || 0;
      const b = parseFloat(values[2]) || 0;
      const existingAlpha = values[3] !== undefined ? parseFloat(values[3]) : 1;
      return `rgba(${r}, ${g}, ${b}, ${clampAlpha(existingAlpha * alpha)})`;
    }

    return trimmed;
  }

  initTheme() {
    const saved = localStorage.getItem('dashboard-theme');
    if (saved) document.body.dataset.theme = saved;

    const swatches = document.querySelectorAll('.theme-swatch');
    swatches.forEach(btn => {
      const theme = btn.dataset.theme;
      const presetColors = {
        dark: '#1a1a2e', light: '#f3f6f9', 'one-light': '#fafafa', 'e-ink': '#ffffff',
        sepia: '#f4f1e8', 'solarized-blue': '#268bd2', 'solarized-green': '#859900', 'solarized-orange': '#cb4b16', oceanic: '#012b36',
        stellar: '#161b22', monokai: '#272822', 'one-dark': '#282c34'
      };
      if (presetColors[theme]) btn.style.background = presetColors[theme];
      btn.addEventListener('click', () => {
        document.body.dataset.theme = theme;
        localStorage.setItem('dashboard-theme', theme);
        this.applyTrafficChartTheme();
        this.applyHttpStatusChartTheme();
      });
    });
  }

  showError(message) {
    const errorElement = document.getElementById('errorMessage');
    const errorText = errorElement.querySelector('.error-text');
    errorText.textContent = message;
    errorElement.style.display = 'block';
    document.getElementById('systemStatus').textContent = 'Error';
    document.getElementById('systemStatus').className = 'info-value error';
  }

  hideError() {
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('systemStatus').textContent = 'Online';
    document.getElementById('systemStatus').className = 'info-value online';
  }

  getCountryFlag(countryCode) {
    const flagMap = {
      'US': '🇺🇸', 'GB': '🇬🇧', 'CA': '🇨🇦', 'DE': '🇩🇪', 'FR': '🇫🇷',
      'JP': '🇯🇵', 'AU': '🇦🇺', 'BR': '🇧🇷', 'IN': '🇮🇳', 'CN': '🇨🇳',
      'RU': '🇷🇺', 'IT': '🇮🇹', 'ES': '🇪🇸', 'NL': '🇳🇱', 'SE': '🇸🇪',
      'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮', 'BE': '🇧🇪', 'CH': '🇨🇭'
    };
    return flagMap[countryCode] || '🌍';
  }

  getCountryName(countryCode) {
    const nameMap = {
      'US': 'United States', 'GB': 'United Kingdom', 'CA': 'Canada',
      'DE': 'Germany', 'FR': 'France', 'JP': 'Japan', 'AU': 'Australia',
      'BR': 'Brazil', 'IN': 'India', 'CN': 'China', 'RU': 'Russia',
      'IT': 'Italy', 'ES': 'Spain', 'NL': 'Netherlands', 'SE': 'Sweden',
      'NO': 'Norway', 'DK': 'Denmark', 'FI': 'Finland', 'BE': 'Belgium',
      'CH': 'Switzerland'
    };
    return nameMap[countryCode] || countryCode;
  }
}
