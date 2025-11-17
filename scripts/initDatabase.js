const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DB_PATH || './database/nice_downs.db';
const dbDir = path.dirname(dbPath);

// Créer le dossier database s'il n'existe pas
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

console.log('🚀 Initialisation de la base de données SQLite...');

const initDatabase = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Table des administrateurs
      db.run(`
        CREATE TABLE IF NOT EXISTS admins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME,
          is_active BOOLEAN DEFAULT 1
        )
      `);

      // Table des rapports d'erreurs
      db.run(`
        CREATE TABLE IF NOT EXISTS error_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT UNIQUE NOT NULL,
          url TEXT NOT NULL,
          platform TEXT NOT NULL,
          error_message TEXT NOT NULL,
          user_description TEXT,
          user_agent TEXT,
          browser_info TEXT,
          ip_address TEXT,
          status TEXT DEFAULT 'nouveau',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_at DATETIME,
          resolved_by INTEGER,
          FOREIGN KEY (resolved_by) REFERENCES admins (id)
        )
      `);

      // Table des statistiques
      db.run(`
        CREATE TABLE IF NOT EXISTS stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          platform TEXT NOT NULL,
          error_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(date, platform)
        )
      `);

      // Table des sessions admin
      db.run(`
        CREATE TABLE IF NOT EXISTS admin_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_id INTEGER NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ip_address TEXT,
          user_agent TEXT,
          FOREIGN KEY (admin_id) REFERENCES admins (id)
        )
      `);

      // Table des notations utilisateurs
      db.run(`
        CREATE TABLE IF NOT EXISTS user_ratings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT UNIQUE NOT NULL,
          rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
          comment TEXT,
          category TEXT DEFAULT 'general',
          platform TEXT NOT NULL,
          url TEXT NOT NULL,
          download_time REAL,
          file_size TEXT,
          user_agent TEXT,
          browser_info TEXT,
          ip_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, async (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Créer l'admin par défaut
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@nice-downs.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'NiceDowns2024!';
        
        try {
          const hashedPassword = await bcrypt.hash(adminPassword, 12);
          
          db.run(`
            INSERT OR IGNORE INTO admins (email, password_hash, name)
            VALUES (?, ?, ?)
          `, [adminEmail, hashedPassword, 'NICE-DEV Admin'], function(err) {
            if (err) {
              console.error('❌ Erreur lors de la création de l\'admin:', err);
            } else if (this.changes > 0) {
              console.log('✅ Admin créé avec succès');
              console.log(`📧 Email: ${adminEmail}`);
              console.log(`🔑 Mot de passe: ${adminPassword}`);
              console.log('⚠️  CHANGEZ LE MOT DE PASSE EN PRODUCTION !');
            } else {
              console.log('ℹ️  Admin existe déjà');
            }
          });

          // Insérer quelques données de test
          const testReports = [
            {
              uuid: 'test-001',
              url: 'https://x.com/example/status/123456',
              platform: 'X (Twitter)',
              error_message: 'API temporairement indisponible',
              user_description: 'La vidéo ne se télécharge pas',
              status: 'nouveau'
            },
            {
              uuid: 'test-002',
              url: 'https://www.facebook.com/video/123456',
              platform: 'Facebook',
              error_message: 'Impossible de télécharger depuis Facebook',
              user_description: 'Erreur 400 lors du téléchargement',
              status: 'en_cours'
            },
            {
              uuid: 'test-003',
              url: 'https://www.instagram.com/reel/ABC123/',
              platform: 'Instagram',
              error_message: 'Contenu privé ou supprimé',
              status: 'resolu'
            }
          ];

          let completed = 0;
          testReports.forEach(report => {
            db.run(`
              INSERT OR IGNORE INTO error_reports 
              (uuid, url, platform, error_message, user_description, status, user_agent, browser_info)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              report.uuid,
              report.url,
              report.platform,
              report.error_message,
              report.user_description || null,
              report.status,
              'Mozilla/5.0 (Test Browser)',
              '{"language":"fr-FR","platform":"Win32"}'
            ], () => {
              completed++;
              if (completed === testReports.length) {
                console.log('✅ Données de test ajoutées');
                resolve();
              }
            });
          });

        } catch (error) {
          console.error('❌ Erreur lors de l\'initialisation:', error);
          reject(error);
        }
      });
    });
  });
};

initDatabase().then(() => {

  db.close((err) => {
    if (err) {
      console.error('❌ Erreur lors de la fermeture de la DB:', err);
    } else {
      console.log('✅ Base de données initialisée avec succès !');
      console.log(`📁 Fichier DB: ${path.resolve(dbPath)}`);
    }
  });
}).catch((error) => {
  console.error('❌ Erreur lors de l\'initialisation:', error);
  db.close();
});