import express from 'express';
import {
  getInventory,
  updateInventory,
  getLowStock,
  adjustInventoryForSale,
} from '../controllers/inventoryController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// Protected routes
router.get('/', authenticate, getInventory);
router.get('/low-stock', authenticate, getLowStock);
router.put('/adjust', authenticate, adjustInventoryForSale);
router.put('/', authenticate, updateInventory);

export default router;
