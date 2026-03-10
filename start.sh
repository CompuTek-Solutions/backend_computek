#!/bin/bash
# Script de démarrage pour le backend

echo "🚀 Démarrage du serveur backend PostgreSQL..."
echo ""
echo "Port: 5000"
echo "Base de données: computekSolutions"
echo "Base de données: postgresql://postgres:root@localhost:5432/computekSolutions"
echo ""
echo "💡 Conseil: Assurez-vous que PostgreSQL est en cours d'exécution"
echo ""

cd "$(dirname "$0")"
npm run dev
