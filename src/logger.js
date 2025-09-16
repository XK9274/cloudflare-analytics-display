const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('./config');

function log(level, message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  console.log(logEntry);

  try {
    fs.appendFileSync(path.join(LOG_DIR, 'analytics.log'), `${logEntry}\n`);
  } catch (err) {
    console.error('Warning: Could not write to log file:', err.message);
  }
}

module.exports = { log };

