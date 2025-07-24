/**
 * Vercel Serverless Function Entry Point
 * Wraps the Express app for serverless deployment
 */

const GovernanceCollectorApp = require('../collector/src/main');

let app;

async function initializeApp() {
  if (!app) {
    try {
      const collectorApp = new GovernanceCollectorApp();
      await collectorApp.initialize();
      collectorApp.setupMiddleware();
      collectorApp.setupRoutes();
      app = collectorApp.app;
    } catch (error) {
      console.error('Failed to initialize app:', error);
      // Create a minimal error app
      const express = require('express');
      app = express();
      app.get('*', (req, res) => {
        res.status(500).json({ 
          error: 'Service initialization failed',
          message: error.message 
        });
      });
    }
  }
  return app;
}

module.exports = async (req, res) => {
  const expressApp = await initializeApp();
  return expressApp(req, res);
};