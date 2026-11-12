import { query, withTransaction } from '../db.js';

const generateInvoiceNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${year}${month}-${random}`;
};

export const createSale = async (req, res) => {
  try {
    const { items, discount_amount, payment_method, notes, client_id } = req.body;
    const sellerId = req.user.id;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Aucun article dans la vente' });
    }

    if (!payment_method) {
      return res.status(400).json({ error: 'Mode de paiement requis' });
    }

    const quantities = new Map();
    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      if (!item.product_id || !Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Article invalide dans la vente' });
      }
      quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + qty);
    }

    const productIds = [...quantities.keys()];

    const outcome = await withTransaction(async (client) => {
      const stockResult = await client.query(
        `SELECT p.id, p.name, p.price_selling, COALESCE(i.quantity_on_hand, 0) AS quantity_on_hand
         FROM products p
         LEFT JOIN inventory i ON i.product_id = p.id
         WHERE p.id = ANY($1::uuid[])
         FOR UPDATE OF p`,
        [productIds]
      );
      const productsById = new Map(stockResult.rows.map((r) => [r.id, r]));

      for (const [productId, qty] of quantities) {
        const product = productsById.get(productId);
        if (!product) return { error: 'Produit introuvable dans la vente', status: 400 };
        if (product.quantity_on_hand < qty) {
          return {
            error: `Stock insuffisant pour "${product.name}". Disponible : ${product.quantity_on_hand}`,
            status: 400,
          };
        }
      }

      const lines = productIds.map((productId) => {
        const product = productsById.get(productId);
        const qty = quantities.get(productId);
        const unitPrice = Number(product.price_selling);
        return { productId, qty, unitPrice, subtotal: unitPrice * qty };
      });

      const gross = lines.reduce((sum, l) => sum + l.subtotal, 0);
      const discount = Math.min(Math.max(Number(discount_amount) || 0, 0), gross);

      const saleResult = await client.query(
        `INSERT INTO sales (seller_id, client_id, total_amount, discount_amount, payment_method, status, notes, invoice_number)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7)
         RETURNING *`,
        [sellerId, client_id || null, gross - discount, discount, payment_method, notes || null, generateInvoiceNumber()]
      );
      const sale = saleResult.rows[0];

      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
         SELECT $1, unnest($2::uuid[]), unnest($3::int[]), unnest($4::numeric[]), unnest($5::numeric[])`,
        [
          sale.id,
          lines.map((l) => l.productId),
          lines.map((l) => l.qty),
          lines.map((l) => l.unitPrice),
          lines.map((l) => l.subtotal),
        ]
      );

      await client.query(
        `UPDATE inventory
         SET quantity_on_hand = inventory.quantity_on_hand - data.qty,
             updated_at = NOW()
         FROM (SELECT unnest($1::uuid[]) AS pid, unnest($2::int[]) AS qty) AS data
         WHERE inventory.product_id = data.pid`,
        [lines.map((l) => l.productId), lines.map((l) => l.qty)]
      );

      return { sale };
    });

    if (outcome.error) {
      return res.status(outcome.status).json({ error: outcome.error });
    }

    res.status(201).json(outcome.sale);
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getSales = async (req, res) => {
  try {
    const { seller_id, search, payment_method, date_from, date_to } = req.query;
    const hasPagination =
      Object.prototype.hasOwnProperty.call(req.query, 'page') ||
      Object.prototype.hasOwnProperty.call(req.query, 'pageSize');

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 100);
    const offset = (page - 1) * pageSize;

    const whereClauses = [];
    const params = [];

    const addClause = (clause) => {
      whereClauses.push(clause);
    };

    if (req.user.role === 'seller') {
      params.push(req.user.id);
      addClause(`s.seller_id = $${params.length}`);
    } else if (seller_id) {
      params.push(seller_id);
      addClause(`s.seller_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      addClause(`(
        s.id::text ILIKE $${params.length}
        OR unaccent(COALESCE(s.invoice_number, '')) ILIKE unaccent($${params.length})
        OR unaccent(COALESCE(c.name, '')) ILIKE unaccent($${params.length})
        OR unaccent(COALESCE(u.name, '')) ILIKE unaccent($${params.length})
      )`);
    }

    if (payment_method && payment_method !== 'all') {
      params.push(payment_method);
      addClause(`s.payment_method = $${params.length}`);
    }

    if (date_from) {
      params.push(date_from);
      addClause(`s.created_at >= $${params.length}`);
    }

    if (date_to) {
      params.push(`${date_to} 23:59:59`);
      addClause(`s.created_at <= $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const baseFrom = `
      FROM sales s
      JOIN users u ON s.seller_id = u.id
      LEFT JOIN clients c ON s.client_id = c.id
    `;

    let dataQuery = `
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
      ${baseFrom}
      LEFT JOIN sale_items si ON s.id = si.sale_id
      ${whereSql}
      GROUP BY s.id, u.name, c.name
      ORDER BY s.created_at DESC
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

    const statsQuery = `
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(s.total_amount), 0) AS total_amount_sum
      ${baseFrom}
      ${whereSql}
    `;
    const statsResult = await query(statsQuery, params);
    const total = parseInt(statsResult.rows[0]?.total ?? 0, 10);
    const totalAmount = parseFloat(statsResult.rows[0]?.total_amount_sum ?? 0);

    res.json({
      data: result.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
        totalAmount,
      },
    });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

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

    if (req.user.role === 'seller' && saleResult.rows[0].seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès non autorisé' });
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

export const getStatistics = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const revenueResult = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as total_revenue
       FROM sales`
    );

    const itemsResult = await query(
      `SELECT COALESCE(SUM(quantity), 0) as total_items
       FROM sale_items`
    );

    const ordersResult = await query('SELECT COUNT(*) as total_orders FROM sales');

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

    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);
    const totalOrders = parseInt(ordersResult.rows[0].total_orders, 10);

    res.json({
      summary: {
        total_revenue: totalRevenue,
        total_items: parseInt(itemsResult.rows[0].total_items),
        total_orders: totalOrders,
        avg_order: totalOrders > 0 ? totalRevenue / totalOrders : 0,
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

    const topProductsResult = await query(
      `SELECT 
        p.id,
        p.name,
        SUM(si.quantity) as quantity_sold,
        SUM(si.subtotal) as total_revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.seller_id = $1
       GROUP BY p.id, p.name
       ORDER BY quantity_sold DESC
       LIMIT 10`,
      [sellerId]
    );

    const categoryResult = await query(
      `SELECT 
        p.category,
        COUNT(DISTINCT si.sale_id) as sales_count,
        SUM(si.subtotal) as total_revenue
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.seller_id = $1 AND p.category IS NOT NULL
       GROUP BY p.category
       ORDER BY total_revenue DESC`,
      [sellerId]
    );

    const monthlyResult = await query(
      `SELECT 
        DATE_TRUNC('month', s.created_at)::date as month,
        COALESCE(SUM(s.total_amount), 0) as total_revenue,
        COUNT(*) as sales_count
       FROM sales s
       WHERE s.seller_id = $1
       GROUP BY DATE_TRUNC('month', s.created_at)
       ORDER BY month DESC
       LIMIT 12`,
      [sellerId]
    );

    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue);
    const totalOrders = parseInt(ordersResult.rows[0].total_orders, 10);
    const totalItems = parseInt(itemsResult.rows[0].total_items, 10);

    res.json({
      summary: {
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        total_items: totalItems,
        avg_order: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      },
      top_products: topProductsResult.rows,
      categories: categoryResult.rows,
      monthly_sales: monthlyResult.rows,
    });
  } catch (error) {
    console.error('Get seller statistics error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const deleteSale = async (req, res) => {
  const { id } = req.params;

  try {
    const outcome = await withTransaction(async (client) => {
      const saleResult = await client.query(
        'SELECT id, seller_id FROM sales WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (saleResult.rows.length === 0) return { status: 404, error: 'Facture introuvable' };

      if (req.user.role === 'seller' && saleResult.rows[0].seller_id !== req.user.id) {
        return { status: 403, error: 'Action non autorisée' };
      }

      await client.query(
        `UPDATE inventory
         SET quantity_on_hand = inventory.quantity_on_hand + data.qty,
             updated_at = NOW()
         FROM (
           SELECT product_id AS pid, SUM(quantity)::int AS qty
           FROM sale_items WHERE sale_id = $1
           GROUP BY product_id
         ) AS data
         WHERE inventory.product_id = data.pid`,
        [id]
      );

      await client.query('DELETE FROM sales WHERE id = $1', [id]);
      return {};
    });

    if (outcome.error) {
      return res.status(outcome.status).json({ error: outcome.error });
    }

    res.json({ message: 'Facture supprimée avec succès' });
  } catch (error) {
    console.error('Delete sale error:', error);
    res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
  }
};
