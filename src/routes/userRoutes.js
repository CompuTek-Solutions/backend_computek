import express from 'express';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  assignProductToSeller,
  getSellerAssignments,
  removeSellerAssignment,
} from '../controllers/userController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// Protected routes
router.get('/', authenticate, getUsers);
router.post('/', authenticate, createUser);
router.put('/:id', authenticate, updateUser);
router.delete('/:id', authenticate, deleteUser);

// Seller assignments
router.get('/assignments', authenticate, getSellerAssignments);
router.post('/assignments', authenticate, assignProductToSeller);
router.delete('/assignments/:id', authenticate, removeSellerAssignment);

export default router;
