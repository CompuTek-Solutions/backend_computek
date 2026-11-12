import express from 'express';
import { getInventory, updateInventory, getLowStock } from '../controllers/inventoryController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

router.get('/', authenticate, getInventory);
router.get('/low-stock', authenticate, getLowStock);
router.put('/', authenticate, updateInventory);

export default router;
