const axios = require('axios');

async function checkSiteAvailability(SITE_URL) {
  if (!SITE_URL) {
    return { status: 'unknown', message: 'No site URL configured' };
  }

  try {
    const startTime = Date.now();
    const response = await axios.get(SITE_URL, {
      timeout: 10000,
      validateStatus: (status) => status < 500,
    });
    const responseTime = Date.now() - startTime;

    return {
      status: 'online',
      statusCode: response.status,
      responseTime,
      message: `HTTP ${response.status} - ${responseTime}ms`,
    };
  } catch (error) {
    if (error.code === 'ENOTFOUND') {
      return { status: 'offline', message: 'DNS resolution failed' };
    } else if (error.code === 'ECONNREFUSED') {
      return { status: 'offline', message: 'Connection refused' };
    } else if (error.code === 'TIMEOUT') {
      return { status: 'offline', message: 'Request timeout' };
    } else if (error.response) {
      return { status: 'error', statusCode: error.response.status, message: `HTTP ${error.response.status}` };
    }
    return { status: 'offline', message: error.message || 'Unknown error' };
  }
}

module.exports = { checkSiteAvailability };

