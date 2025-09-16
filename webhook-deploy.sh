#!/bin/bash

# Cloudflare Analytics Display Auto-Deployment Script
# Handles GitHub webhook deployments with Docker Compose

set -euo pipefail

# Configuration
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$REPO_DIR/docker-compose.yml"
DEPLOY_LOG="/tmp/analytics-deploy.log"

# Function to log with timestamp
deploy_log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$DEPLOY_LOG"
}

# Function to handle deployment failure
handle_failure() {
    local error_msg="$1"
    deploy_log "DEPLOYMENT FAILED: $error_msg"
    echo "ERROR: $error_msg" >&2
    exit 1
}

# Main deployment function
deploy_site() {
    deploy_log "Starting cloudflare-analytics deployment..."

    # Change to repo directory
    cd "$REPO_DIR" || handle_failure "Cannot access repository directory"

    # Stop current containers
    deploy_log "Stopping current containers..."
    docker-compose down -v || handle_failure "Failed to stop containers"

    # Fetch latest changes
    deploy_log "Fetching latest changes from repository..."
    git fetch origin || handle_failure "Failed to fetch from repository"

    # Get current and remote commit hashes
    local current_commit=$(git rev-parse HEAD)
    local remote_commit=$(git rev-parse origin/main)

    if [ "$current_commit" = "$remote_commit" ]; then
        deploy_log "Repository already up to date"
    else
        deploy_log "Updating from $current_commit to $remote_commit"

        # Pull latest changes
        git reset --hard origin/main || handle_failure "Failed to update repository"

        # Log recent changes
        deploy_log "Recent changes:"
        git log --oneline -5 | while read line; do
            deploy_log "  $line"
        done
    fi

    # Clean up any orphaned Docker resources
    deploy_log "Cleaning up Docker resources..."
    docker system prune -f --volumes 2>/dev/null || true

    # Build and start new containers
    deploy_log "Building and starting new containers..."
    docker-compose up -d --build || handle_failure "Failed to build and start containers"

    # Wait for health check
    deploy_log "Waiting for application health check..."
    local health_attempts=0
    local max_attempts=30

    while [ $health_attempts -lt $max_attempts ]; do
        if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
            deploy_log "Health check passed"
            break
        fi

        health_attempts=$((health_attempts + 1))
        if [ $health_attempts -eq $max_attempts ]; then
            handle_failure "Health check failed after $max_attempts attempts"
        fi

        deploy_log "Health check attempt $health_attempts/$max_attempts failed, retrying..."
        sleep 10
    done

    # Verify containers are running
    if ! docker-compose ps | grep -q "Up"; then
        handle_failure "Containers failed to start properly"
    fi

    # Success!
    local final_commit=$(git rev-parse HEAD)
    deploy_log "Deployment successful! Running commit: $final_commit"
}

# Verify webhook authenticity (if GitHub secret is set)
verify_webhook() {
    if [ -n "${GITHUB_WEBHOOK_SECRET:-}" ] && [ -n "${HTTP_X_HUB_SIGNATURE_256:-}" ]; then
        local expected_sig="sha256=$(echo -n "$1" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" -binary | xxd -p -c 256)"
        if [ "$HTTP_X_HUB_SIGNATURE_256" != "$expected_sig" ]; then
            echo "ERROR: Invalid webhook signature" >&2
            exit 1
        fi
    fi
}

# Main execution
main() {
    # If called with webhook payload, verify it
    if [ $# -gt 0 ]; then
        verify_webhook "$1"
    fi

    # Run deployment
    deploy_site
}

# Execute main function with all arguments
main "$@"