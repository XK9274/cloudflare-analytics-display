#!/usr/bin/env node

/**
 * Cloudflare Analytics Display Server
 * Real-time analytics dashboard for horizontal sidecar displays
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const { PORT, REFRESH_INTERVAL, THEME, DASH_VERSION } = require('./src/config');
const { log } = require('./src/logger');
const { fetchAnalyticsData, analyticsCache } = require('./src/services/analyticsService');

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    },
  },
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace('<body>', `<body data-theme="${THEME}" data-version="${DASH_VERSION}">`);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('./package.json').version,
    cache: {
      hasData: !!analyticsCache.data,
      lastUpdated: analyticsCache.lastUpdated,
      isUpdating: analyticsCache.isUpdating,
    },
  };
  res.json(health);
});

app.get('/api/analytics', async (req, res) => {
  try {
    const data = await fetchAnalyticsData();
    res.json(data);
  } catch (error) {
    log('ERROR', `API error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    server: 'Cloudflare Analytics Display',
    version: require('./package.json').version,
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    refreshInterval: REFRESH_INTERVAL,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  log('ERROR', `Server error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  log('INFO', `Cloudflare Analytics Display server started on port ${PORT}`);
  log('INFO', `Dashboard available at http://localhost:${PORT}`);
  log('INFO', `Health check available at http://localhost:${PORT}/health`);
  log('INFO', `API endpoint available at http://localhost:${PORT}/api/analytics`);
  log('INFO', `Data refresh interval: ${REFRESH_INTERVAL} seconds`);

  // Initial data fetch
  fetchAnalyticsData().catch((error) => {
    log('ERROR', `Initial data fetch failed: ${error.message}`);
  });
});

// Periodic data refresh
setInterval(() => {
  fetchAnalyticsData().catch((error) => {
    log('ERROR', `Scheduled data refresh failed: ${error.message}`);
  });
}, REFRESH_INTERVAL * 1000);

// Graceful shutdown
process.on('SIGINT', () => {
  log('INFO', 'Received SIGINT - shutting down analytics server');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('INFO', 'Received SIGTERM - shutting down analytics server');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log('ERROR', `Uncaught exception: ${error.message}`);
  log('ERROR', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', `Unhandled rejection at: ${promise}, reason: ${reason}`);
});

module.exports = app;

