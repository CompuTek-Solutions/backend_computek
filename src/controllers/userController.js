import { query } from '../db.js';
import bcrypt from 'bcryptjs';

// Get all users (Admin only)
export const getUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const result = await query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY name ASC'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Create user (Admin only)
export const createUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const emailExists = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailExists.rows.length > 0) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (name, email, password, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, is_active`,
      [name, email, hashedPassword, role, true]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update user (Admin only)
export const updateUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { id } = req.params;
    const { name, email, password, role, is_active } = req.body;

    let updateFields = [];
    let params = [];
    let paramCount = 1;

    if (name) {
      updateFields.push(`name = $${paramCount}`);
      params.push(name);
      paramCount++;
    }

    if (email) {
      updateFields.push(`email = $${paramCount}`);
      params.push(email);
      paramCount++;
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push(`password = $${paramCount}`);
      params.push(hashedPassword);
      paramCount++;
    }

    if (role) {
      updateFields.push(`role = $${paramCount}`);
      params.push(role);
      paramCount++;
    }

    // commission_rate removed

    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount}`);
      params.push(is_active);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING id, name, email, role, is_active`;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete user (Admin only)
export const deleteUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { id } = req.params;

    // Ne pas permettre de supprimer l'admin
    const userResult = await query('SELECT role FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    if (userResult.rows[0].role === 'admin') {
      return res.status(400).json({ error: 'Impossible de supprimer un administrateur' });
    }

    const result = await query('DELETE FROM users WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Assign product to seller (Admin only)
export const assignProductToSeller = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { seller_id, product_id } = req.body;

    if (!seller_id || !product_id) {
      return res.status(400).json({ error: 'seller_id et product_id requis' });
    }

    const result = await query(
      `INSERT INTO seller_assignments (seller_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (seller_id, product_id) DO NOTHING
       RETURNING *`,
      [seller_id, product_id]
    );

    res.status(201).json(result.rows[0] || { message: 'Produit déjà assigné' });
  } catch (error) {
    console.error('Assign product error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get seller assignments (Admin only)
export const getSellerAssignments = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { seller_id } = req.query;

    let sql = `
      SELECT sa.id, sa.seller_id, sa.product_id, p.name as product_name
      FROM seller_assignments sa
      JOIN products p ON sa.product_id = p.id
    `;

    if (seller_id) {
      sql += ` WHERE sa.seller_id = $1`;
      const result = await query(sql, [seller_id]);
      return res.json(result.rows);
    }

    const result = await query(sql);
    res.json(result.rows);
  } catch (error) {
    console.error('Get seller assignments error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Remove seller assignment (Admin only)
export const removeSellerAssignment = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { id } = req.params;

    const result = await query('DELETE FROM seller_assignments WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Assignment non trouvé' });
    }

    res.json({ message: 'Assignment supprimé' });
  } catch (error) {
    console.error('Remove assignment error:', error);
    res.status(500).json({ error: error.message });
  }
};
