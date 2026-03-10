import { query } from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'computek_solutions_secret_2026';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email/Nom d\'utilisateur et mot de passe sont requis' });
    }

    // Chercher l'utilisateur soit par email soit par name
    const result = await query(
      'SELECT * FROM users WHERE email = $1 OR name = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Ce compte a été désactivé' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
  }
};

export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, newEmail } = req.body;
    const userId = req.user.id;

    const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const user = userResult.rows[0];

    if (oldPassword) {
      const validPassword = await bcrypt.compare(oldPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
      }

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Nouveau mot de passe requis (min 6 caractères)' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await query('UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
        hashedPassword,
        userId,
      ]);
    }

    if (newEmail) {
      // Vérifier que le nouvel email n'existe pas
      const emailExists = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [
        newEmail,
        userId,
      ]);

      if (emailExists.rows.length > 0) {
        return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      }

      await query('UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
        newEmail,
        userId,
      ]);
    }

    const updatedUser = await query(
      'SELECT id, name, email, role FROM users WHERE id = $1',
      [userId]
    );

    res.json({
      message: 'Profil mis à jour avec succès',
      user: updatedUser.rows[0],
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
