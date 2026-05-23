/**
 * Fichier de test pour valider la recherche insensible aux accents
 * 
 * Exécuter avec: node src/tests/testAccentSearch.js
 * (Assurez-vous que le serveur est en cours d'exécution)
 */

const BASE_URL = 'http://localhost:5000/api';

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testProductSearch() {
  log('\n=== TEST 1: Recherche Produit ===', 'blue');
  
  const testCases = [
    { search: 'cle', description: 'Rechercher "cle" (sans accent)' },
    { search: 'clé', description: 'Rechercher "clé" (avec accent)' },
    { search: 'CLÉ', description: 'Rechercher "CLÉ" (majuscules)' },
  ];

  for (const testCase of testCases) {
    try {
      log(`\n${testCase.description}...`, 'yellow');
      const response = await fetch(`${BASE_URL}/products?search=${encodeURIComponent(testCase.search)}`);
      const data = await response.json();
      
      if (data.length === 0) {
        log(`  ⚠️  Aucun résultat trouvé`, 'yellow');
      } else {
        log(`  ✅ ${data.length} résultat(s) trouvé(s):`, 'green');
        data.forEach(product => {
          log(`     • ${product.name} (${product.barcode || 'N/A'})`);
        });
      }
    } catch (error) {
      log(`  ❌ Erreur: ${error.message}`, 'red');
    }
  }
}

async function testClientSearch() {
  log('\n=== TEST 2: Recherche Client ===', 'blue');
  
  const testCases = [
    { search: 'jose', description: 'Rechercher "jose" (sans accent)' },
    { search: 'José', description: 'Rechercher "José" (avec accent)' },
    { search: 'JOSÉ', description: 'Rechercher "JOSÉ" (majuscules)' },
  ];

  for (const testCase of testCases) {
    try {
      log(`\n${testCase.description}...`, 'yellow');
      const response = await fetch(`${BASE_URL}/clients?search=${encodeURIComponent(testCase.search)}`);
      const data = await response.json();
      const clients = data.data || data;
      
      if (clients.length === 0) {
        log(`  ⚠️  Aucun résultat trouvé`, 'yellow');
      } else {
        log(`  ✅ ${clients.length} résultat(s) trouvé(s):`, 'green');
        clients.forEach(client => {
          log(`     • ${client.name} (${client.email || 'N/A'})`);
        });
      }
    } catch (error) {
      log(`  ❌ Erreur: ${error.message}`, 'red');
    }
  }
}

async function testSalesSearch() {
  log('\n=== TEST 3: Recherche Vente ===', 'blue');
  
  const testCases = [
    { search: 'francois', description: 'Rechercher "francois" (vendeur ou client)' },
    { search: 'François', description: 'Rechercher "François" (avec accent)' },
    { search: 'FRANÇOIS', description: 'Rechercher "FRANÇOIS" (majuscules)' },
  ];

  for (const testCase of testCases) {
    try {
      log(`\n${testCase.description}...`, 'yellow');
      const response = await fetch(`${BASE_URL}/sales?search=${encodeURIComponent(testCase.search)}`);
      const data = await response.json();
      
      if (data.length === 0) {
        log(`  ⚠️  Aucun résultat trouvé`, 'yellow');
      } else {
        log(`  ✅ ${data.length} résultat(s) trouvé(s)`, 'green');
        data.slice(0, 3).forEach(sale => {
          log(`     • Vente ${sale.invoice_number} - ${sale.seller_name} - ${new Date(sale.created_at).toLocaleDateString()}`);
        });
        if (data.length > 3) {
          log(`     ... et ${data.length - 3} autre(s)`);
        }
      }
    } catch (error) {
      log(`  ❌ Erreur: ${error.message}`, 'red');
    }
  }
}

async function compareResults() {
  log('\n=== TEST 4: Comparaison des Résultats ===', 'blue');
  
  try {
    log('\nComparaison: "cle" vs "clé"', 'yellow');
    
    const response1 = await fetch(`${BASE_URL}/products?search=cle`);
    const data1 = await response1.json();
    
    const response2 = await fetch(`${BASE_URL}/products?search=clé`);
    const data2 = await response2.json();
    
    if (data1.length === data2.length && data1.length > 0) {
      log(`  ✅ SUCCÈS: Les deux recherches retournent ${data1.length} résultat(s)`, 'green');
      log('     Les résultats sont identiques (insensible aux accents)');
    } else if (data1.length === 0 && data2.length === 0) {
      log(`  ⚠️  Aucun résultat pour les deux recherches`, 'yellow');
    } else {
      log(`  ❌ ERREUR: Les résultats diffèrent!`, 'red');
      log(`     "cle" retourne: ${data1.length} résultat(s)`);
      log(`     "clé" retourne: ${data2.length} résultat(s)`);
    }
  } catch (error) {
    log(`  ❌ Erreur: ${error.message}`, 'red');
  }
}

async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'bright');
  log('║     Tests de Recherche Insensible aux Accents              ║', 'bright');
  log('╚════════════════════════════════════════════════════════════╝', 'bright');
  
  log('\n⏳ Exécution des tests...', 'yellow');
  
  await testProductSearch();
  await testClientSearch();
  await testSalesSearch();
  await compareResults();
  
  log('\n╔════════════════════════════════════════════════════════════╗', 'bright');
  log('║               Tests Terminés ✅                            ║', 'bright');
  log('╚════════════════════════════════════════════════════════════╝', 'bright');
}

// Exécuter les tests
runAllTests().catch(error => {
  log(`\n❌ Erreur fatale: ${error.message}`, 'red');
  process.exit(1);
});
