import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { fileURLToPath } from 'node:url';
import { connectDB } from './config/db.js';
import AutomationScheduleState from './models/AutomationScheduleState.js';
import automationRoutes from './routes/automationRoutes.js';
import brainRoutes from './routes/brainRoutes.js';
import youtubeRoutes from './routes/youtubeRoutes.js';
import { startAutomationScheduler, stopAutomationScheduler } from './services/schedulerService.js';

const app = express();
const configuredOrigins = process.env.FRONTEND_URL
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: configuredOrigins?.length ? configuredOrigins : true,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', async (req, res, next) => {
  try {
    const [latestRun] = await AutomationScheduleState.find({ lastRunAt: { $ne: null } })
      .select('channelId lastRunAt lastRunStatus lastRunStep lastRunError')
      .sort({ lastRunAt: -1 })
      .limit(1)
      .lean();
    return res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      automation: latestRun
        ? {
            channelId: latestRun.channelId,
            lastRunAt: latestRun.lastRunAt,
            status: latestRun.lastRunStatus,
            step: latestRun.lastRunStep,
            error: latestRun.lastRunError,
          }
        : null,
    });
  } catch (error) {
    return next(error);
  }
});

app.use('/api/automation', automationRoutes);
app.use('/api/brain', brainRoutes);
app.use('/api/youtube', youtubeRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (statusCode >= 500) {
    if (error.publishStage) {
      console.error(`[publish] failed during ${error.publishStage}.`);
    }
    console.error(error);
  }
  return res.status(statusCode).json({
    error: typeof error.publicMessage === 'string'
      ? error.publicMessage
      : statusCode >= 500
        ? 'An unexpected server error occurred.'
        : error.message,
  });
});

async function startServer() {
  await connectDB();
  startAutomationScheduler();
  const port = Number(process.env.PORT) || 5000;
  const server = app.listen(port, () => {
    console.log(`Dimag AI backend listening on port ${port}.`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received; closing server.`);
    stopAutomationScheduler();
    server.close(async (error) => {
      if (error) {
        console.error('Error closing HTTP server:', error);
        process.exitCode = 1;
      }
      const mongoose = await import('mongoose');
      await mongoose.default.disconnect();
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().catch((error) => {
    console.error('Failed to start Dimag AI backend:', error);
    process.exitCode = 1;
  });
}

export default app;
