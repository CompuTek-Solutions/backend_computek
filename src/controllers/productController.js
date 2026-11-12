import { query, withTransaction } from '../db.js';

const PRODUCT_SELECT = `
  SELECT p.*,
         i.quantity_on_hand,
         i.quantity_reserved,
         COALESCE(
           (SELECT array_agg(pb.code ORDER BY pb.position, pb.created_at)
            FROM product_barcodes pb
            WHERE pb.product_id = p.id),
           ARRAY[]::varchar[]
         ) AS barcodes
  FROM products p
  LEFT JOIN inventory i ON p.id = i.product_id
`;

const normalizeBarcodes = (barcodes, barcode) => {
  const list = Array.isArray(barcodes) ? barcodes : barcode ? [barcode] : [];
  const seen = new Set();
  const result = [];
  for (const raw of list) {
    const code = String(raw ?? '').trim();
    if (!code) continue;
    const key = code.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(code);
  }
  return result;
};

const findBarcodeConflicts = async (client, codes, productId = null) => {
  if (codes.length === 0) return [];
  const result = await client.query(
    `SELECT pb.code, p.name
     FROM product_barcodes pb
     JOIN products p ON p.id = pb.product_id
     WHERE UPPER(pb.code) = ANY($1::text[])
       AND ($2::uuid IS NULL OR pb.product_id <> $2::uuid)`,
    [codes.map((c) => c.toUpperCase()), productId]
  );
  return result.rows;
};

const replaceBarcodes = async (client, productId, codes) => {
  await client.query('DELETE FROM product_barcodes WHERE product_id = $1', [productId]);
  if (codes.length > 0) {
    await client.query(
      `INSERT INTO product_barcodes (product_id, code, position)
       SELECT $1, t.code, t.ord FROM unnest($2::varchar[]) WITH ORDINALITY AS t(code, ord)`,
      [productId, codes]
    );
  }
};

const conflictResponse = (res, conflicts) =>
  res.status(409).json({
    error: `Code déjà utilisé : ${conflicts.map((c) => `${c.code} (${c.name})`).join(', ')}`,
  });

const fetchProduct = async (id) => {
  const result = await query(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
  return result.rows[0];
};

export const getProducts = async (req, res) => {
  try {
    const { search, category } = req.query;
    const clauses = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(
        unaccent(p.name) ILIKE unaccent($${params.length})
        OR EXISTS (
          SELECT 1 FROM product_barcodes pb
          WHERE pb.product_id = p.id AND pb.code ILIKE $${params.length}
        )
      )`);
    }

    if (category) {
      params.push(category);
      clauses.push(`p.category = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await query(`${PRODUCT_SELECT} ${where} ORDER BY p.name ASC`, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getProductById = async (req, res) => {
  try {
    const product = await fetchProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const getProductByBarcode = async (req, res) => {
  try {
    const code = String(req.params.barcode || '').trim();

    const result = await query(
      `${PRODUCT_SELECT}
       WHERE p.id = (
         SELECT product_id FROM product_barcodes WHERE UPPER(code) = UPPER($1) LIMIT 1
       )`,
      [code]
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

export const createProduct = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { name, description, category, price_selling, quantity_on_hand } = req.body;
    const price = Number(price_selling);

    if (!name || !String(name).trim() || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'Nom et prix de vente valides requis' });
    }

    const codes = normalizeBarcodes(req.body.barcodes, req.body.barcode);
    const quantity = Math.max(0, parseInt(quantity_on_hand, 10) || 0);

    const outcome = await withTransaction(async (client) => {
      const conflicts = await findBarcodeConflicts(client, codes);
      if (conflicts.length > 0) return { conflicts };

      const inserted = await client.query(
        `INSERT INTO products (name, description, category, barcode, price_selling)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [String(name).trim(), description || null, category || null, codes[0] || null, price]
      );
      const productId = inserted.rows[0].id;

      await client.query(
        'INSERT INTO inventory (product_id, quantity_on_hand) VALUES ($1, $2)',
        [productId, quantity]
      );
      await replaceBarcodes(client, productId, codes);
      return { productId };
    });

    if (outcome.conflicts) return conflictResponse(res, outcome.conflicts);

    res.status(201).json(await fetchProduct(outcome.productId));
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const { id } = req.params;
    const { name, description, category, price_selling } = req.body;
    const hasBarcodes = req.body.barcodes !== undefined || req.body.barcode !== undefined;
    const codes = hasBarcodes ? normalizeBarcodes(req.body.barcodes, req.body.barcode) : null;

    if (price_selling !== undefined && !(Number(price_selling) > 0)) {
      return res.status(400).json({ error: 'Le prix doit être supérieur à 0' });
    }

    const outcome = await withTransaction(async (client) => {
      if (codes) {
        const conflicts = await findBarcodeConflicts(client, codes, id);
        if (conflicts.length > 0) return { conflicts };
      }

      const result = await client.query(
        `UPDATE products
         SET name = COALESCE($1, name),
             description = CASE WHEN $2::boolean THEN $3 ELSE description END,
             category = CASE WHEN $4::boolean THEN $5 ELSE category END,
             price_selling = COALESCE($6, price_selling),
             barcode = CASE WHEN $7::boolean THEN $8 ELSE barcode END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $9
         RETURNING id`,
        [
          name ? String(name).trim() : null,
          description !== undefined,
          description || null,
          category !== undefined,
          category || null,
          price_selling !== undefined ? Number(price_selling) : null,
          codes !== null,
          codes?.[0] || null,
          id,
        ]
      );

      if (result.rows.length === 0) return { notFound: true };
      if (codes) await replaceBarcodes(client, id, codes);
      return {};
    });

    if (outcome.conflicts) return conflictResponse(res, outcome.conflicts);
    if (outcome.notFound) return res.status(404).json({ error: 'Produit non trouvé' });

    res.json(await fetchProduct(id));
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Non autorisé' });
    }

    const result = await query('DELETE FROM products WHERE id = $1', [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }

    res.json({ message: 'Produit supprimé' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        error: 'Ce produit figure dans des ventes existantes et ne peut pas être supprimé',
      });
    }
    console.error('Delete product error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCategories = async (req, res) => {
  try {
    const result = await query(
      'SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category'
    );
    res.json(result.rows.map((r) => r.category));
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
