// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new AnalyticsDashboard();
});

// Global function for retry button
function fetchAnalytics() {
  if (window.dashboard) {
    window.dashboard.fetchAnalytics();
  }
}

