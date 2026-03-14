import express from 'express';
import {
  createSale,
  getSales,
  getSaleDetails,
  getStatistics,
  getSellerStatistics,
  deleteSale,
} from '../controllers/salesController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// Protected routes
router.post('/', authenticate, createSale);
router.get('/', authenticate, getSales);
router.get('/stats/overview', authenticate, getStatistics);
router.get('/stats/seller', authenticate, getSellerStatistics);
router.get('/:id', authenticate, getSaleDetails);
router.delete('/:id', authenticate, deleteSale);

export default router;
