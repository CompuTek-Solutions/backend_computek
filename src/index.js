import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './init.js';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import userRoutes from './routes/userRoutes.js';
import clientRoutes from './routes/clientRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Middlewares
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logs
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    error: 'Erreur serveur',
    message: err.message,
  });
});

// Start server
const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database initialized');

    app.listen(PORT, () => {
      console.log(`
🚀 API Server running on http://localhost:${PORT}
📦 CORS enabled for: ${CORS_ORIGIN}
🗄️  Database: computekSolutions (PostgreSQL)

Available endpoints:
  POST   /api/auth/login
  GET    /api/auth/profile
  PUT    /api/auth/profile
  GET    /api/products
  GET    /api/products/barcode/:barcode
  POST   /api/products
  PUT    /api/products/:id
  DELETE /api/products/:id
  GET    /api/inventory
  GET    /api/inventory/low-stock
  PUT    /api/inventory/:id
  GET    /api/sales
  POST   /api/sales
  GET    /api/sales/stats/overview
  GET    /api/sales/stats/seller
  GET    /api/users
  POST   /api/users
  PUT    /api/users/:id
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
