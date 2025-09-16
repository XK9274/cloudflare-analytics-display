require('dotenv').config();

const PORT = process.env.PORT || 3001;
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL, 10) || 30;
const THEME = process.env.THEME || 'dark';
const DASH_VERSION = process.env.DASH_VERSION || '0.1.1';
const SITE_URL = process.env.SITE_URL || '';

const CLOUDFLARE_CONFIG = {
  zoneId: process.env.CLOUDFLARE_ZONE_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
  baseURL: 'https://api.cloudflare.com',
};

if (!CLOUDFLARE_CONFIG.zoneId || !CLOUDFLARE_CONFIG.apiToken) {
  console.error('Missing required environment variables: CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

const LOG_DIR = '/tmp';

module.exports = {
  PORT,
  REFRESH_INTERVAL,
  THEME,
  DASH_VERSION,
  SITE_URL,
  CLOUDFLARE_CONFIG,
  LOG_DIR,
};

