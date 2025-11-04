import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { errorHandler } from './middleware/errorHandler';
import { validateEnv } from './utils/validateEnv';
import { connectDatabase } from './config/database';
import redisManager from './config/redis';
import { setupDirectories } from './scripts/setupDirectories';
import { healthRouter } from './routes/health';

// Load environment variables
dotenv.config();

// Validate environment variables
validateEnv();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true
}));

app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/health', healthRouter);
app.use('/api/videos', require('./routes/videos').videoRouter);
app.use('/api/analysis', require('./routes/analysis').analysisRouter);
app.use('/api/analysis', require('@/routes/analysis').analysisRouter);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize database, Redis, directories, and start server
const startServer = async () => {
  try {
    await setupDirectories();
    await connectDatabase();
    
    // Try to connect to Redis, but don't fail if it's not available
    try {
      await redisManager.connect();
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.warn('⚠️ Redis connection failed, continuing without Redis:', (error as Error).message);
    }
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🎥 Video upload: http://localhost:${PORT}/api/videos/upload`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  server.close(async () => {
    try {
      await redisManager.disconnect();
      console.log('Process terminated');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  });
});

export { app, io };