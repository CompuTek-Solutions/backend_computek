import { query } from '../db.js';

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

export const updateInventory = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { product_id, quantity_on_hand, quantity_reserved } = req.body;

    const quantity = parseInt(quantity_on_hand, 10);
    if (!product_id || !Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({ error: 'Produit et quantité positive requis' });
    }

    const result = await query(
      `INSERT INTO inventory (product_id, quantity_on_hand, quantity_reserved)
       SELECT id, $1, COALESCE($2, 0) FROM products WHERE id = $3
       ON CONFLICT (product_id) DO UPDATE
       SET quantity_on_hand = EXCLUDED.quantity_on_hand,
           quantity_reserved = COALESCE($2, inventory.quantity_reserved),
           updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [quantity, quantity_reserved ?? null, product_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update inventory error:', error);
    res.status(500).json({ error: error.message });
  }
};

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
