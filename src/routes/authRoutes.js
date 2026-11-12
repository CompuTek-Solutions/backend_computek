import express from 'express';
import { login, getProfile, updatePassword } from '../controllers/authController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

router.post('/login', login);

router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updatePassword);

export default router;
