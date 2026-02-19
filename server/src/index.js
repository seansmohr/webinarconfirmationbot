const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initializeCronJobs } = require('./cron/schedulerCron');

const dashboardRoutes = require('./routes/dashboardRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const syncRoutes = require('./routes/syncRoutes');

const app = express();

// Middleware
app.use(cors({
  origin: config.server.nodeEnv === 'production'
    ? config.server.clientUrl
    : '*',
}));
app.use(express.json());

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/sync', syncRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static frontend in production
if (config.server.nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Start server
app.listen(config.server.port, () => {
  console.log(`[Server] Webinar Confirmation Bot running on port ${config.server.port}`);
  console.log(`[Server] Environment: ${config.server.nodeEnv}`);

  if (config.ghl.pipelineId) {
    console.log(`[Server] Pipeline filter: ${config.ghl.pipelineId}`);
  } else {
    console.warn('[Server] ⚠ WARNING: No GHL_PIPELINE_ID set — syncing ALL contacts from the location. Set GHL_PIPELINE_ID to scope to a specific pipeline.');
  }

  // Initialize cron jobs
  initializeCronJobs();

  console.log('[Server] Ready to process webinar confirmation calls.');
});
