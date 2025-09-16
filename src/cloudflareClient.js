const axios = require('axios');
const { CLOUDFLARE_CONFIG } = require('./config');

const cloudflareAPI = axios.create({
  baseURL: CLOUDFLARE_CONFIG.baseURL,
  headers: {
    Authorization: `Bearer ${CLOUDFLARE_CONFIG.apiToken}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

module.exports = { cloudflareAPI };

