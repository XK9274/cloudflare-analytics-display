/**
 * AnalyticsDashboard class: handles UI updates and fetching
 */
class AnalyticsDashboard {
  constructor() {
    this.trafficChart = null;
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
    const styles = getComputedStyle(document.documentElement);
    const pageviewsColor = styles.getPropertyValue('--chart-pageviews').trim();
    const requestsColor = styles.getPropertyValue('--chart-requests').trim();
    const tooltipBg = getComputedStyle(document.body).getPropertyValue('--bg-overlay').trim() || 'rgba(0,0,0,0.8)';
    const tooltipText = styles.getPropertyValue('--text-primary').trim() || '#fff';
    const tooltipBorder = styles.getPropertyValue('--border-primary').trim() || 'rgba(0, 212, 255, 0.5)';

    this.trafficChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Page Views',
            data: [],
            borderColor: pageviewsColor,
            backgroundColor: pageviewsColor + '20',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
          },
          {
            label: 'Requests',
            data: [],
            borderColor: requestsColor,
            backgroundColor: requestsColor + '20',
            borderWidth: 2,
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
            grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-tertiary').trim() || 'rgba(127,127,127,0.2)', drawBorder: false },
            ticks: { color: styles.getPropertyValue('--text-tertiary').trim() || '#888', font: { size: 10 }, maxTicksLimit: 12 },
          },
          y: {
            display: true,
            grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-tertiary').trim() || 'rgba(127,127,127,0.2)', drawBorder: false },
            ticks: { color: styles.getPropertyValue('--text-tertiary').trim() || '#888', font: { size: 10 }, callback: (v) => formatNumber(v) },
          },
        },
        elements: { line: { borderJoinStyle: 'round' } },
      },
    });
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
      this.trafficChart.update('none');
      return;
    }

    const labels = timeseries.map(p => {
      const d = new Date(p.datetime);
      return `${d.getHours().toString().padStart(2, '0')}:00`;
    });
    const pageviewsData = timeseries.map(p => p.pageviews || 0);
    const requestsData = timeseries.map(p => p.requests || 0);

    this.trafficChart.data.labels = labels;
    this.trafficChart.data.datasets[0].data = pageviewsData;
    this.trafficChart.data.datasets[1].data = requestsData;
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
        if (this.trafficChart) {
          const styles = getComputedStyle(document.documentElement);
          const pageviewsColor = styles.getPropertyValue('--chart-pageviews').trim();
          const requestsColor = styles.getPropertyValue('--chart-requests').trim();
          this.trafficChart.data.datasets[0].borderColor = pageviewsColor;
          this.trafficChart.data.datasets[0].backgroundColor = pageviewsColor + '20';
          this.trafficChart.data.datasets[1].borderColor = requestsColor;
          this.trafficChart.data.datasets[1].backgroundColor = requestsColor + '20';
          const gridColor = styles.getPropertyValue('--border-tertiary').trim() || 'rgba(127,127,127,0.2)';
          const tickColor = styles.getPropertyValue('--text-tertiary').trim() || '#888';
          this.trafficChart.options.scales.x.grid.color = gridColor;
          this.trafficChart.options.scales.y.grid.color = gridColor;
          this.trafficChart.options.scales.x.ticks.color = tickColor;
          this.trafficChart.options.scales.y.ticks.color = tickColor;
          const tooltipBg = getComputedStyle(document.body).getPropertyValue('--bg-overlay').trim() || 'rgba(0,0,0,0.8)';
          const tooltipText = styles.getPropertyValue('--text-primary').trim() || '#fff';
          const tooltipBorder = styles.getPropertyValue('--border-primary').trim() || 'rgba(0, 212, 255, 0.5)';
          this.trafficChart.options.plugins.tooltip.backgroundColor = tooltipBg;
          this.trafficChart.options.plugins.tooltip.titleColor = tooltipText;
          this.trafficChart.options.plugins.tooltip.bodyColor = tooltipText;
          this.trafficChart.options.plugins.tooltip.borderColor = tooltipBorder;
          this.trafficChart.update('none');
        }
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

