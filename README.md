# 🚀 Backend Computek Solutions

API REST pour l'application de gestion de stock Computek Solutions

## 📋 Prérequis

- Node.js 20+
- PostgreSQL 14+
- npm

## ⚙️ Configuration

### 1. Configuration PostgreSQL

```bash
# Créer la base de données
createdb computekSolutions

# Identifiants PostgreSQL (défault)
user: postgres
password: root
host: localhost
port: 5432
```

### 2. Variables d'environnement

Créez un fichier `.env`:

```env
PORT=5000
NODE_ENV=development

# PostgreSQL
DB_USER=postgres
DB_PASSWORD=root
DB_HOST=localhost
DB_PORT=5432
DB_NAME=computekSolutions

# JWT
JWT_SECRET=computek_solutions_secret_2026
JWT_EXPIRE=7d

# API
API_URL=http://localhost:5000
CORS_ORIGIN=http://localhost:5173
```

### 3. Installez les dépendances

```bash
npm install
```

## 🎯 Démarrage

### Mode développement (avec rechargement automatique)

```bash
npm run dev
```

### Mode production

```bash
npm start
```

Le serveur démarre sur **http://localhost:5000**

## 📚 API Endpoints

### Authentication
- `POST /api/auth/login` - Connexion
- `GET /api/auth/profile` - Profil utilisateur
- `PUT /api/auth/profile` - Mettre à jour profil

### Products
- `GET /api/products` - Lister tous les produits
- `GET /api/products/barcode/:barcode` - Obtenir produit par code-barres
- `POST /api/products` - Créer produit (Admin)
- `PUT /api/products/:id` - Mettre à jour produit (Admin)
- `DELETE /api/products/:id` - Supprimer produit (Admin)

### Inventory
- `GET /api/inventory` - Lister inventaire
- `GET /api/inventory/low-stock` - Produits en rupture
- `PUT /api/inventory/:id` - Mettre à jour stock
- `PUT /api/inventory/adjust` - Ajuster pour une vente

### Sales
- `POST /api/sales` - Créer une vente
- `GET /api/sales` - Lister ventes
- `GET /api/sales/:id` - Détails d'une vente
- `GET /api/sales/stats/overview` - Statistiques globales (Admin)
- `GET /api/sales/stats/seller` - Statistiques vendeur

### Users (Admin only)
- `GET /api/users` - Lister utilisateurs
- `POST /api/users` - Créer utilisateur
- `PUT /api/users/:id` - Modifier utilisateur
- `DELETE /api/users/:id` - Supprimer utilisateur
- `GET /api/users/assignments` - Assignations produits/vendeurs
- `POST /api/users/assignments` - Assigner produit à vendeur
- `DELETE /api/users/assignments/:id` - Retirer assignation

## 🔐 Authentification

Toutes les requêtes protégées nécessitent un JWT dans le header:

```
Authorization: Bearer <token>
```

### Comptes de démonstration

| Email | Password | Rôle |
|-------|----------|------|
| demo@computek.com | demo | Admin |
| jean@computek.com | demo | Seller |
| marie@computek.com | demo | Seller |

## 📊 Structure de la Base de Données

```sql
-- Users (Administrateurs et Vendeurs)
users: id, email, password, name, role, commission_rate

-- Products (Catalogue)
products: id, name, description, category, sku, barcode, price_cost, price_selling

-- Inventory (Stock)
inventory: id, product_id, quantity_on_hand, quantity_reserved

-- Sales (Ventes)
sales: id, seller_id, total_amount, discount_amount, payment_method, status

-- Sale Items (Articles des ventes)
sale_items: id, sale_id, product_id, quantity, unit_price, subtotal

-- Seller Assignments (Liaison vendeurs/produits)
seller_assignments: id, seller_id, product_id
```

## 🧪 Tests

```bash
# Test de connexion
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@computek.com","password":"demo"}'

# Récupérer tous les produits
curl http://localhost:5000/api/products

# Récupérer profil (avec token)
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/auth/profile
```

## 🐛 Dépannage

### Erreur de connexion PostgreSQL

```
error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:** Assurez-vous que PostgreSQL est en cours d'exécution
```bash
# Windows
net start PostgreSQL-x64-14

# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### Port 5000 déjà utilisé

Changez le port dans `.env`:
```env
PORT=5001
```

### Table déjà existe

Les tables sont créées automatiquement au démarrage. Si vous avez des erreurs, videz la base:

```bash
dropdb computekSolutions
createdb computekSolutions
npm run dev
```

## 📦 Dépendances Principales

- **express** - Framework HTTP
- **pg** - Driver PostgreSQL
- **bcryptjs** - Hash des mots de passe
- **jsonwebtoken** - Authentification JWT
- **cors** - Cross-Origin Resource Sharing
- **dotenv** - Variables d'environnement
- **uuid** - Génération d'ID uniques

## 🔄 Cycle de Vie d'une Vente

1. **Client crée une vente** → `POST /api/sales`
2. **Système crée la transaction** → Crée un enregistrement sales
3. **Articles ajoutés** → Ajoute dans sale_items
4. **Stock décrementé** → Met à jour inventory
5. **Vente finalisée** → Status = 'completed'

## 📈 Métriques

Le backend calcule automatiquement:
- Revenu total par vendeur
- Nombre de ventes par vendeur
- Commissions basées sur le taux
- Produits les plus vendus
- Statistiques par catégorie
- Alertes stock faible

## 🚀 Déploiement

### Heroku

```bash
heroku create computek-solutions
heroku config:set DATABASE_URL=postgresql://...
git push heroku main
```

### DigitalOcean/VPS

```bash
npm install pm2 -g
pm2 start src/index.js --name "computek-api"
pm2 save
pm2 startup
```

## 📞 Support

Pour toute question, consultez:
- [Documentation API](./API_REFERENCE.md)
- [Architecture](./ARCHITECTURE.md)

---

**Version:** 1.0.0  
**Date:** Mars 2026  
**Auteur:** Computek Solutions Team
