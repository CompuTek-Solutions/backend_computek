import { query } from '../db.js';

export const getClients = async (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT * FROM clients WHERE 1=1';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`;
    }
    sql += ' ORDER BY name ASC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getClientById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM clients WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const createClient = async (req, res) => {
  try {
    const { name, email, phone, address, rccm, postal_box, nc } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Le nom du client est requis' });
    }
    const result = await query(
      `INSERT INTO clients (name, email, phone, address, rccm, postal_box, nc)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name.trim(),
        email?.trim() || null,
        phone?.trim() || null,
        address?.trim() || null,
        rccm?.trim() || null,
        postal_box?.trim() || null,
        nc?.trim() || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, rccm, postal_box, nc } = req.body;
    const result = await query(
      `UPDATE clients
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           address = COALESCE($4, address),
           rccm = COALESCE($5, rccm),
           postal_box = COALESCE($6, postal_box),
           nc = COALESCE($7, nc),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        name?.trim(),
        email?.trim(),
        phone?.trim(),
        address?.trim(),
        rccm?.trim(),
        postal_box?.trim(),
        nc?.trim(),
        id,
      ]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: error.message });
  }
};
