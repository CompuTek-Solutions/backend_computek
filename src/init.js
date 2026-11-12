import { query } from './db.js';

export const initializeDatabase = async () => {
  try {
    // Create unaccent extension for accent-insensitive search
    await query(`CREATE EXTENSION IF NOT EXISTS unaccent`).catch(() => {});

    // Table Users
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'seller')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table Products
    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        barcode VARCHAR(100) UNIQUE,
        price_selling DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table Inventory
    await query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity_on_hand INT DEFAULT 0,
        quantity_reserved INT DEFAULT 0,
        last_stock_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id)
      )
    `);

    // Table Clients (informations clients pour les ventes)
    await query(`
      CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        rccm VARCHAR(120),
        postal_box VARCHAR(120),
        nc VARCHAR(120),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS rccm VARCHAR(120)').catch(() => {});
    await query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS postal_box VARCHAR(120)').catch(() => {});
    await query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS nc VARCHAR(120)').catch(() => {});

    // Table Sales
    await query(`
      CREATE TABLE IF NOT EXISTS sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        payment_method VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'completed',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL
    `).catch(() => {});

    await query(`
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50)
    `).catch(() => {});

    // Table Sale Items
    await query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id),
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table Seller Assignments (liaison vendeurs/produits)
    await query(`
      CREATE TABLE IF NOT EXISTS seller_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(seller_id, product_id)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS product_barcodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        code VARCHAR(100) NOT NULL UNIQUE,
        position INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query('ALTER TABLE product_barcodes ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0');
    await query('CREATE INDEX IF NOT EXISTS idx_product_barcodes_product ON product_barcodes(product_id)');

    await query(`
      INSERT INTO product_barcodes (product_id, code)
      SELECT id, barcode FROM products
      WHERE barcode IS NOT NULL AND barcode <> ''
      ON CONFLICT (code) DO NOTHING
    `);

    console.log('✅ Tables created successfully');

  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};
