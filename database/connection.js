const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Configuration du chemin de la base de données selon l'environnement
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/nice_downs.db'  // Railway utilise /tmp pour les fichiers temporaires
  : process.env.DB_PATH || './database/nice_downs.db';
const dbDir = path.dirname(dbPath);

// Créer le dossier database s'il n'existe pas
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Créer la connexion à la base de données
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erreur lors de la connexion à SQLite:', err);
    process.exit(1);
  } else {
    console.log('✅ Connexion à SQLite établie');
    console.log(`📁 Base de données: ${path.resolve(dbPath)}`);
    
    // Activer les clés étrangères
    db.run('PRAGMA foreign_keys = ON');
    
    // Optimisations SQLite
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA cache_size = 1000');
    db.run('PRAGMA temp_store = MEMORY');
  }
});

// Gestion propre de la fermeture
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('❌ Erreur lors de la fermeture de la DB:', err);
    } else {
      console.log('✅ Connexion SQLite fermée');
    }
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  db.close((err) => {
    if (err) {
      console.error('❌ Erreur lors de la fermeture de la DB:', err);
    } else {
      console.log('✅ Connexion SQLite fermée');
    }
    process.exit(0);
  });
});

module.exports = db;
