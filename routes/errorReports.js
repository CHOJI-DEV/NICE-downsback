const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/connection');
const { authenticateAdmin, identifyAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Créer un nouveau rapport d'erreur (PUBLIC)
 */
router.post('/', (req, res) => {
  try {
    const {
      url,
      platform,
      error,
      description,
      userAgent,
      browserInfo
    } = req.body;

    // Validation des données requises
    if (!url || !platform || !error) {
      return res.status(400).json({
        error: 'URL, plateforme et message d\'erreur sont requis'
      });
    }

    const reportUuid = uuidv4();
    const now = new Date().toISOString();

    // Insérer le rapport dans la base de données
    db.run(`
      INSERT INTO error_reports (
        uuid, url, platform, error_message, user_description,
        user_agent, browser_info, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      reportUuid,
      url,
      platform,
      error,
      description || null,
      userAgent || null,
      JSON.stringify(browserInfo || {}),
      'nouveau',
      now,
      now
    ], function(err) {
      if (err) {
        console.error('Erreur lors de la création du rapport:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      console.log(`✅ Nouveau rapport créé: ${reportUuid} - ${platform}`);
      
      res.status(201).json({
        success: true,
        message: 'Rapport d\'erreur envoyé avec succès',
        reportId: reportUuid
      });
    });
  } catch (error) {
    console.error('Erreur lors de la création du rapport:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Récupérer tous les rapports d'erreurs (ADMIN SEULEMENT)
 */
router.get('/', authenticateAdmin, (req, res) => {
  try {
    const {
      status,
      platform,
      limit = 50,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM error_reports';
    let countQuery = 'SELECT COUNT(*) as total FROM error_reports';
    const params = [];
    const conditions = [];

    // Filtres
    if (status && status !== 'tous') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    // Récupérer le total
    db.get(countQuery, params.slice(0, -2), (err, countResult) => {
      if (err) {
        console.error('Erreur lors du comptage des rapports:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      // Récupérer les rapports
      db.all(query, params, (err, reports) => {
        if (err) {
          console.error('Erreur lors de la récupération des rapports:', err);
          return res.status(500).json({ error: 'Erreur serveur' });
        }

        // Parser les browser_info JSON
        const processedReports = reports.map(report => ({
          ...report,
          browser_info: report.browser_info ? JSON.parse(report.browser_info) : {}
        }));

        res.json({
          success: true,
          reports: processedReports,
          total: countResult.total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        });
      });
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des rapports:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Mettre à jour le statut d'un rapport (ADMIN SEULEMENT)
 */
router.put('/:uuid/status', authenticateAdmin, (req, res) => {
  try {
    const { uuid } = req.params;
    const { status } = req.body;

    // Validation du statut
    const validStatuses = ['nouveau', 'en_cours', 'resolu'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Statut invalide. Valeurs acceptées: ' + validStatuses.join(', ')
      });
    }

    const now = new Date().toISOString();

    db.run(
      'UPDATE error_reports SET status = ?, updated_at = ? WHERE uuid = ?',
      [status, now, uuid],
      function(err) {
        if (err) {
          console.error('Erreur lors de la mise à jour du statut:', err);
          return res.status(500).json({ error: 'Erreur serveur' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Rapport non trouvé' });
        }

        console.log(`📝 Statut mis à jour: ${uuid} -> ${status} par ${req.admin.email}`);
        
        res.json({
          success: true,
          message: `Statut mis à jour vers "${status}"`
        });
      }
    );
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Supprimer un rapport (ADMIN SEULEMENT)
 */
router.delete('/:uuid', authenticateAdmin, (req, res) => {
  try {
    const { uuid } = req.params;

    db.run('DELETE FROM error_reports WHERE uuid = ?', [uuid], function(err) {
      if (err) {
        console.error('Erreur lors de la suppression du rapport:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Rapport non trouvé' });
      }

      console.log(`🗑️ Rapport supprimé: ${uuid} par ${req.admin.email}`);
      
      res.json({
        success: true,
        message: 'Rapport supprimé avec succès'
      });
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du rapport:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Récupérer un rapport spécifique (ADMIN SEULEMENT)
 */
router.get('/:uuid', authenticateAdmin, (req, res) => {
  try {
    const { uuid } = req.params;

    db.get('SELECT * FROM error_reports WHERE uuid = ?', [uuid], (err, report) => {
      if (err) {
        console.error('Erreur lors de la récupération du rapport:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      if (!report) {
        return res.status(404).json({ error: 'Rapport non trouvé' });
      }

      // Parser browser_info
      report.browser_info = report.browser_info ? JSON.parse(report.browser_info) : {};

      res.json({
        success: true,
        report
      });
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du rapport:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;