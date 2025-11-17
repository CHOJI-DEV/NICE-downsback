const jwt = require('jsonwebtoken');
const db = require('../database/connection');

/**
 * Middleware d'authentification pour les admins
 */
const authenticateAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Token d\'authentification requis',
        code: 'NO_TOKEN'
      });
    }

    // Vérifier le token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Vérifier que l'admin existe et est actif
    db.get(
      'SELECT id, email, name, is_active FROM admins WHERE id = ?',
      [decoded.adminId],
      (err, admin) => {
        if (err) {
          console.error('Erreur DB lors de l\'authentification:', err);
          return res.status(500).json({ error: 'Erreur serveur' });
        }

        if (!admin) {
          return res.status(401).json({
            error: 'Admin non trouvé',
            code: 'ADMIN_NOT_FOUND'
          });
        }

        if (!admin.is_active) {
          return res.status(401).json({
            error: 'Compte admin désactivé',
            code: 'ADMIN_DISABLED'
          });
        }

        // Ajouter les infos admin à la requête
        req.admin = {
          adminId: admin.id,
          email: admin.email,
          name: admin.name
        };

        next();
      }
    );
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expiré',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Token invalide',
        code: 'INVALID_TOKEN'
      });
    }

    console.error('Erreur lors de l\'authentification:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Middleware optionnel pour identifier l'admin sans bloquer
 */
const identifyAdmin = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    db.get(
      'SELECT id, email, name FROM admins WHERE id = ? AND is_active = 1',
      [decoded.adminId],
      (err, admin) => {
        if (!err && admin) {
          req.admin = {
            adminId: admin.id,
            email: admin.email,
            name: admin.name
          };
        }
        next();
      }
    );
  } catch (error) {
    // Ignorer les erreurs de token pour ce middleware
    next();
  }
};

module.exports = {
  authenticateAdmin,
  identifyAdmin
};