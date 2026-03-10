import { query } from '../db.js';

// Get inventory
export const getInventory = async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        i.id,
        i.product_id,
        p.name,
        p.price_selling,
        i.quantity_on_hand,
        i.quantity_reserved,
        (i.quantity_on_hand * p.price_selling) as stock_value
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      ORDER BY p.name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Update inventory (Admin only)
export const updateInventory = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { product_id, quantity_on_hand, quantity_reserved } = req.body;

    if (!product_id || quantity_on_hand === undefined) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const result = await query(
      `UPDATE inventory 
       SET quantity_on_hand = $1, 
           quantity_reserved = COALESCE($2, quantity_reserved),
           updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $3
       RETURNING *`,
      [quantity_on_hand, quantity_reserved || 0, product_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventaire non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get low stock products (Admin only)
export const getLowStock = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const threshold = req.query.threshold || 10;

    const result = await query(`
      SELECT 
        p.id,
        p.name,
        i.quantity_on_hand,
        p.price_selling,
        (i.quantity_on_hand * p.price_selling) as stock_value
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.quantity_on_hand < $1
      ORDER BY i.quantity_on_hand ASC
    `, [threshold]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Adjust inventory for sale
export const adjustInventoryForSale = async (req, res) => {
  try {
    const { product_id, quantity } = req.body;

    if (!product_id || !quantity) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const result = await query(
      `UPDATE inventory 
       SET quantity_on_hand = quantity_on_hand - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $2
       RETURNING *`,
      [quantity, product_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventaire non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Adjust inventory error:', error);
    res.status(500).json({ error: error.message });
  }
};
