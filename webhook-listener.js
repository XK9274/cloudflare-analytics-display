#!/usr/bin/env node

/**
 * GitHub Webhook Listener for Cloudflare Analytics Display Auto-Deployment
 * Runs on Pi host (outside Docker) to handle repository updates
 */

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = process.env.WEBHOOK_PORT || 9001;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const DEPLOY_SCRIPT = path.join(__dirname, 'webhook-deploy.sh');
const LOG_FILE = '/tmp/analytics-webhook-listener.log';

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Logging function
function log(level, message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    console.log(logEntry.trim());
    fs.appendFileSync(LOG_FILE, logEntry);
}

// Verify GitHub webhook signature
function verifySignature(payload, signature) {
    if (!WEBHOOK_SECRET) {
        log('WARN', 'No webhook secret configured - skipping signature verification');
        return true;
    }
    
    if (!signature) {
        log('ERROR', 'No signature provided in webhook request');
        return false;
    }
    
    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');
    
    const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
    
    if (!isValid) {
        log('ERROR', 'Invalid webhook signature');
    }
    
    return isValid;
}

// Execute deployment script
function deployAnalytics(payload) {
    log('INFO', 'Starting analytics deployment process...');
    
    const deployment = spawn('bash', [DEPLOY_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            HTTP_X_HUB_SIGNATURE_256: payload.signature
        }
    });
    
    // Log deployment output
    deployment.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
            log('DEPLOY', output);
        }
    });
    
    deployment.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
            log('DEPLOY_ERROR', error);
        }
    });
    
    deployment.on('close', (code) => {
        if (code === 0) {
            log('INFO', 'Analytics deployment completed successfully');
        } else {
            log('ERROR', `Analytics deployment failed with exit code ${code}`);
        }
    });
    
    deployment.on('error', (error) => {
        log('ERROR', `Failed to start analytics deployment: ${error.message}`);
    });
}

// HTTP server to handle webhooks
const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
        return;
    }
    
    if (req.url !== '/webhook') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
    }
    
    let body = '';
    
    req.on('data', (chunk) => {
        body += chunk.toString();
    });
    
    req.on('end', () => {
        try {
            const signature = req.headers['x-hub-signature-256'];
            const event = req.headers['x-github-event'];
            
            log('INFO', `Received ${event} webhook from ${req.headers['user-agent']}`);
            
            // Verify signature
            if (!verifySignature(body, signature)) {
                res.writeHead(401, { 'Content-Type': 'text/plain' });
                res.end('Unauthorized');
                return;
            }
            
            // Parse payload
            const payload = JSON.parse(body);
            
            // Only deploy on push events to main branch
            if (event === 'push' && payload.ref === 'refs/heads/main') {
                const commits = payload.commits || [];
                const commitCount = commits.length;
                const lastCommit = commits[commitCount - 1];
                
                log('INFO', `Push to main branch: ${commitCount} commit(s)`);
                if (lastCommit) {
                    log('INFO', `Latest commit: ${lastCommit.id.substring(0, 7)} - ${lastCommit.message}`);
                    log('INFO', `Author: ${lastCommit.author.name} <${lastCommit.author.email}>`);
                }
                
                // Trigger deployment
                deployAnalytics({
                    signature: signature,
                    payload: payload
                });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'success',
                    message: 'Analytics deployment triggered',
                    commits: commitCount
                }));
            } else {
                log('INFO', `Ignoring ${event} event (not a push to main)`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'ignored',
                    message: 'Not a push to main branch'
                }));
            }
            
        } catch (error) {
            log('ERROR', `Error processing webhook: ${error.message}`);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    });
    
    req.on('error', (error) => {
        log('ERROR', `Request error: ${error.message}`);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request');
    });
});

// Health check endpoint
server.on('request', (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            service: 'cloudflare-analytics-webhook',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }));
        return;
    }
});

// Start server
server.listen(PORT, () => {
    log('INFO', `Cloudflare Analytics webhook listener started on port ${PORT}`);
    log('INFO', `Health check available at http://localhost:${PORT}/health`);
    log('INFO', `Webhook endpoint: http://localhost:${PORT}/webhook`);
    
    if (!WEBHOOK_SECRET) {
        log('WARN', 'GITHUB_WEBHOOK_SECRET not set - webhook signature verification disabled');
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    log('INFO', 'Received SIGINT - shutting down analytics webhook listener');
    server.close(() => {
        log('INFO', 'Analytics webhook listener stopped');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    log('INFO', 'Received SIGTERM - shutting down analytics webhook listener');
    server.close(() => {
        log('INFO', 'Analytics webhook listener stopped');
        process.exit(0);
    });
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