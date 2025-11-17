const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/connection');

const router = express.Router();

/**
 * Connexion admin
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email et mot de passe requis'
      });
    }

    // Vérifier l'admin dans la base de données
    db.get(
      'SELECT * FROM admins WHERE email = ? AND is_active = 1',
      [email],
      async (err, admin) => {
        if (err) {
          console.error('Erreur DB:', err);
          return res.status(500).json({ error: 'Erreur serveur' });
        }

        if (!admin) {
          return res.status(401).json({
            error: 'Identifiants invalides'
          });
        }

        // Vérifier le mot de passe
        const isValidPassword = await bcrypt.compare(password, admin.password_hash);
        
        if (!isValidPassword) {
          return res.status(401).json({
            error: 'Identifiants invalides'
          });
        }

        // Créer le token JWT
        const token = jwt.sign(
          { 
            adminId: admin.id, 
            email: admin.email,
            name: admin.name
          },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );

        // Enregistrer la session
        const sessionId = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
        
        db.run(`
          INSERT INTO admin_sessions (admin_id, token_hash, expires_at, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?)
        `, [
          admin.id,
          sessionId,
          expiresAt.toISOString(),
          req.ip,
          req.get('User-Agent')
        ]);

        // Mettre à jour la dernière connexion
        db.run(
          'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
          [admin.id]
        );

        res.json({
          success: true,
          token,
          admin: {
            id: admin.id,
            email: admin.email,
            name: admin.name
          }
        });
      }
    );
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Vérification du token
 */
router.get('/verify', (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Vérifier que l'admin existe toujours
    db.get(
      'SELECT id, email, name FROM admins WHERE id = ? AND is_active = 1',
      [decoded.adminId],
      (err, admin) => {
        if (err || !admin) {
          return res.status(401).json({ error: 'Token invalide' });
        }

        res.json({
          success: true,
          admin: {
            id: admin.id,
            email: admin.email,
            name: admin.name
          }
        });
      }
    );
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

/**
 * Déconnexion
 */
router.post('/logout', (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      // Supprimer la session de la base de données
      db.run(
        'DELETE FROM admin_sessions WHERE token_hash = ?',
        [token]
      );
    }

    res.json({ success: true, message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;