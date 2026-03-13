import { query } from '../db.js';

const generateInvoiceNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
};

// Create sale
export const createSale = async (req, res) => {
  try {
    const { items, discount_amount, payment_method, notes, client_id } = req.body;
    const sellerId = req.user.id;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Aucun article dans la vente' });
    }

    if (!payment_method) {
      return res.status(400).json({ error: 'Mode de paiement requis' });
    }

    await query('BEGIN');

    try {
      const productIds = items.map((item) => item.product_id);

      // Verrouiller les lignes d'inventaire et valider le stock pour tous les articles en une seule requête
      const stockResult = await query(
        `SELECT product_id, quantity_on_hand FROM inventory WHERE product_id = ANY($1::uuid[]) FOR UPDATE`,
        [productIds]
      );

      const stockMap = Object.fromEntries(
        stockResult.rows.map((r) => [r.product_id, r.quantity_on_hand])
      );

      for (const item of items) {
        const available = stockMap[item.product_id] ?? 0;
        if (available < item.quantity) {
          await query('ROLLBACK');
          return res.status(400).json({
            error: `Stock insuffisant pour le produit ID ${item.product_id}. Disponible: ${available}`,
          });
        }
      }

      const totalAmount =
        items.reduce((sum, item) => sum + item.subtotal, 0) - (discount_amount || 0);

      const invoiceNumber = generateInvoiceNumber();

      // Créer la vente
      const saleResult = await query(
        `INSERT INTO sales (seller_id, client_id, total_amount, discount_amount, payment_method, status, notes, invoice_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [sellerId, client_id || null, totalAmount, discount_amount || 0, payment_method, 'completed', notes || null, invoiceNumber]
      );

      const saleId = saleResult.rows[0].id;

      // Bulk INSERT des articles en une seule requête
      const itemPlaceholders = items
        .map((_, i) => {
          const b = i * 4 + 2;
          return `($1, $${b}, $${b + 1}, $${b + 2}, $${b + 3})`;
        })
        .join(', ');
      const itemValues = [saleId];
      items.forEach((item) =>
        itemValues.push(item.product_id, item.quantity, item.unit_price, item.subtotal)
      );
      await query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES ${itemPlaceholders}`,
        itemValues
      );

      // Bulk UPDATE de l'inventaire en une seule requête via unnest
      await query(
        `UPDATE inventory
         SET quantity_on_hand = inventory.quantity_on_hand - data.qty,
             updated_at = NOW()
         FROM (SELECT unnest($1::uuid[]) AS pid, unnest($2::int[]) AS qty) AS data
         WHERE inventory.product_id = data.pid`,
        [productIds, items.map((item) => item.quantity)]
      );

      await query('COMMIT');

      res.status(201).json(saleResult.rows[0]);
    } catch (innerError) {
      await query('ROLLBACK');
      throw innerError;
    }
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get sales
export const getSales = async (req, res) => {
  try {
    const { seller_id, search } = req.query;
    let sql = `
      SELECT 
        s.id,
        s.seller_id,
        u.name as seller_name,
        s.client_id,
        c.name as client_name,
        s.invoice_number,
        s.total_amount,
        s.discount_amount,
        s.payment_method,
        s.status,
        s.created_at,
        COUNT(si.id) as items_count
      FROM sales s
      JOIN users u ON s.seller_id = u.id
      LEFT JOIN clients c ON s.client_id = c.id
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE 1=1
    `;
    const params = [];

    // Si c'est un vendeur, ne voir que ses ventes
    if (req.user.role === 'seller') {
      sql += ' AND s.seller_id = $' + (params.length + 1);
      params.push(req.user.id);
    } else if (seller_id) {
      // Admin filtre par vendeur
      sql += ' AND s.seller_id = $' + (params.length + 1);
      params.push(seller_id);
    }

    if (search) {
      sql += ' AND s.id::text ILIKE $' + (params.length + 1);
      params.push(`%${search}%`);
    }

    sql += ' GROUP BY s.id, u.name, c.name ORDER BY s.created_at DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Get sale details
export const getSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const saleResult = await query(
      `SELECT s.*,
              u.name AS seller_name,
              c.name AS client_name,
              c.email AS client_email,
              c.phone AS client_phone,
              c.address AS client_address,
              c.rccm AS client_rccm,
              c.postal_box AS client_postal_box,
              c.nc AS client_nc
       FROM sales s
       JOIN users u ON s.seller_id = u.id
       LEFT JOIN clients c ON s.client_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vente non trouvée' });
    }

    const itemsResult = await query(
      `SELECT si.*, p.name as product_name
       FROM sale_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1`,
      [id]
    );

    res.json({
      sale: saleResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    console.error('Get sale details error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Get statistics (Admin only)
export const getStatistics = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    // Total revenue
    const revenueResult = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as total_revenue
       FROM sales`
    );

    // Items sold
    const itemsResult = await query(
      `SELECT COALESCE(SUM(quantity), 0) as total_items
       FROM sale_items`
    );

    // Orders count
    const ordersResult = await query('SELECT COUNT(*) as total_orders FROM sales');

    // Top selling products
    const topProductsResult = await query(`
      SELECT 
        p.id,
        p.name,
        SUM(si.quantity) as quantity_sold,
        SUM(si.subtotal) as total_revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      GROUP BY p.id, p.name
      ORDER BY quantity_sold DESC
      LIMIT 10
    `);

    // Sales by category
    const categoryResult = await query(`
      SELECT 
        p.category,
        COUNT(DISTINCT si.sale_id) as sales_count,
        SUM(si.subtotal) as total_revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      WHERE p.category IS NOT NULL
      GROUP BY p.category
      ORDER BY total_revenue DESC
    `);

    // Monthly sales
    const monthlyResult = await query(`
      SELECT 
        DATE_TRUNC('month', s.created_at)::date as month,
        COALESCE(SUM(s.total_amount), 0) as total_revenue,
        COUNT(*) as sales_count
      FROM sales s
      GROUP BY DATE_TRUNC('month', s.created_at)
      ORDER BY month DESC
      LIMIT 12
    `);

    res.json({
      summary: {
        total_revenue: parseFloat(revenueResult.rows[0].total_revenue),
        total_items: parseInt(itemsResult.rows[0].total_items),
        total_orders: parseInt(ordersResult.rows[0].count),
        avg_order: parseFloat(revenueResult.rows[0].total_revenue) / parseInt(ordersResult.rows[0].count) || 0,
      },
      top_products: topProductsResult.rows,
      categories: categoryResult.rows,
      monthly_sales: monthlyResult.rows,
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Get seller statistics
export const getSellerStatistics = async (req, res) => {
  try {
    const sellerId = req.user.role === 'seller' ? req.user.id : req.query.seller_id;

    if (!sellerId) {
      return res.status(400).json({ error: 'seller_id requis' });
    }

    const revenueResult = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as total_revenue
       FROM sales WHERE seller_id = $1`,
      [sellerId]
    );

    const ordersResult = await query(
      'SELECT COUNT(*) as total_orders FROM sales WHERE seller_id = $1',
      [sellerId]
    );

    const itemsResult = await query(
      `SELECT COALESCE(SUM(si.quantity), 0) as total_items
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE s.seller_id = $1`,
      [sellerId]
    );

    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);
    const commissionRate = 0; // Commission removed
    const commission = 0;

    res.json({
      total_revenue: totalRevenue,
      total_orders: parseInt(ordersResult.rows[0].count),
      total_items: parseInt(itemsResult.rows[0].total_items),
      commission_rate: commissionRate,
      commission: commission,
      avg_order: totalRevenue / parseInt(ordersResult.rows[0].count) || 0,
    });
  } catch (error) {
    console.error('Get seller statistics error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
