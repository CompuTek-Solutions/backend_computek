import { query } from '../db.js';

export const getClients = async (req, res) => {
  try {
    const { search } = req.query;
    const hasPagination =
      Object.prototype.hasOwnProperty.call(req.query, 'page') ||
      Object.prototype.hasOwnProperty.call(req.query, 'pageSize');

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 100);
    const offset = (page - 1) * pageSize;

    const whereClauses = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      const searchIndex = params.length;
      whereClauses.push(`(
        COALESCE(name, '') ILIKE $${searchIndex}
        OR COALESCE(email, '') ILIKE $${searchIndex}
        OR COALESCE(phone, '') ILIKE $${searchIndex}
        OR COALESCE(address, '') ILIKE $${searchIndex}
      )`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let dataQuery = `
      SELECT 
        id,
        name,
        email,
        phone,
        address,
        rccm,
        postal_box,
        nc,
        created_at,
        updated_at
      FROM clients
      ${whereSql}
      ORDER BY name ASC
    `;

    const dataParams = [...params];

    if (hasPagination) {
      const limitIndex = dataParams.length + 1;
      const offsetIndex = dataParams.length + 2;
      dataQuery += `
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
      `;
      dataParams.push(pageSize, offset);
    }

    const result = await query(dataQuery, dataParams);

    if (!hasPagination) {
      return res.json(result.rows);
    }

    const countResult = await query(`SELECT COUNT(*) AS total FROM clients ${whereSql}`, params);
    const total = parseInt(countResult.rows[0]?.total ?? 0, 10);

    res.json({
      data: result.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    });
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
