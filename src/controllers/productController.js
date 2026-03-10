import { query } from '../db.js';

// Get all products
export const getProducts = async (req, res) => {
  try {
    const { search, category } = req.query;

    let sql = `
      SELECT p.*, i.quantity_on_hand, i.quantity_reserved 
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (p.name ILIKE $' + (params.length + 1) + ' OR p.barcode ILIKE $' + (params.length + 1) + ')';
      params.push(`%${search}%`);
    }

    if (category) {
      sql += ' AND p.category = $' + (params.length + 1);
      params.push(category);
    }

    sql += ' ORDER BY p.name ASC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Get product by barcode
export const getProductByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;

    const result = await query(
      `SELECT p.*, i.quantity_on_hand, i.quantity_reserved 
       FROM products p
       LEFT JOIN inventory i ON p.id = i.product_id
       WHERE p.barcode = $1`,
      [barcode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get product by barcode error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Create product (Admin only)
export const createProduct = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { name, description, category, barcode, price_selling } = req.body;

    if (!name || !price_selling) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const result = await query(
      `INSERT INTO products (name, description, category, barcode, price_selling)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description || null, category || null, barcode || null, price_selling]
    );

    // Créer une entrée inventaire
    const productId = result.rows[0].id;
    await query(
      `INSERT INTO inventory (product_id, quantity_on_hand)
       VALUES ($1, $2)`,
      [productId, 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update product (Admin only)
export const updateProduct = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { id } = req.params;
    const { name, description, category, barcode, price_selling } = req.body;

    const result = await query(
      `UPDATE products 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description),
           category = COALESCE($3, category),
           barcode = COALESCE($4, barcode),
           price_selling = COALESCE($5, price_selling),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, description, category, barcode, price_selling, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete product (Admin only)
export const deleteProduct = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { id } = req.params;

    const result = await query('DELETE FROM products WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    res.json({ message: 'Produit supprimé' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all categories
export const getCategories = async (req, res) => {
  try {
    const result = await query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category');
    res.json(result.rows.map((r) => r.category));
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
