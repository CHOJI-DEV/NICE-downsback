const express = require('express');
const db = require('../database/connection');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Récupérer les statistiques générales (ADMIN SEULEMENT)
 */
router.get('/', authenticateAdmin, (req, res) => {
  try {
    // Statistiques générales
    const statsQueries = [
      // Total des rapports
      new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as total FROM error_reports', (err, result) => {
          if (err) reject(err);
          else resolve({ total: result.total });
        });
      }),
      
      // Rapports par statut
      new Promise((resolve, reject) => {
        db.all(`
          SELECT status, COUNT(*) as count 
          FROM error_reports 
          GROUP BY status
        `, (err, results) => {
          if (err) reject(err);
          else {
            const statusCounts = {
              nouveau: 0,
              en_cours: 0,
              resolu: 0
            };
            results.forEach(row => {
              statusCounts[row.status] = row.count;
            });
            resolve(statusCounts);
          }
        });
      }),
      
      // Rapports par plateforme
      new Promise((resolve, reject) => {
        db.all(`
          SELECT platform, COUNT(*) as count 
          FROM error_reports 
          GROUP BY platform 
          ORDER BY count DESC
        `, (err, results) => {
          if (err) reject(err);
          else {
            const platforms = {};
            results.forEach(row => {
              platforms[row.platform] = row.count;
            });
            resolve(platforms);
          }
        });
      }),
      
      // Évolution des erreurs (7 derniers jours)
      new Promise((resolve, reject) => {
        db.all(`
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as count
          FROM error_reports 
          WHERE created_at >= DATE('now', '-7 days')
          GROUP BY DATE(created_at)
          ORDER BY date ASC
        `, (err, results) => {
          if (err) reject(err);
          else {
            // Remplir les jours manquants avec 0
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
              const date = new Date();
              date.setDate(date.getDate() - i);
              const dateStr = date.toISOString().split('T')[0];
              
              const dayData = results.find(r => r.date === dateStr);
              last7Days.push({
                date: dateStr,
                erreurs: dayData ? dayData.count : 0
              });
            }
            resolve(last7Days);
          }
        });
      })
    ];

    Promise.all(statsQueries)
      .then(([totalStats, statusStats, platformStats, weeklyStats]) => {
        res.json({
          success: true,
          stats: {
            total: totalStats.total,
            nouveaux: statusStats.nouveau,
            enCours: statusStats.en_cours,
            resolus: statusStats.resolu,
            plateformes: platformStats,
            derniereSemaine: weeklyStats
          }
        });
      })
      .catch(error => {
        console.error('Erreur lors de la récupération des stats:', error);
        res.status(500).json({ error: 'Erreur serveur' });
      });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Statistiques détaillées par période
 */
router.get('/detailed', authenticateAdmin, (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let dateFilter = "DATE('now', '-7 days')";
    let groupBy = "DATE(created_at)";
    
    switch (period) {
      case '30d':
        dateFilter = "DATE('now', '-30 days')";
        break;
      case '90d':
        dateFilter = "DATE('now', '-90 days')";
        groupBy = "strftime('%Y-%W', created_at)";
        break;
      case '1y':
        dateFilter = "DATE('now', '-1 year')";
        groupBy = "strftime('%Y-%m', created_at)";
        break;
    }

    db.all(`
      SELECT 
        ${groupBy} as period,
        platform,
        COUNT(*) as count
      FROM error_reports 
      WHERE created_at >= ${dateFilter}
      GROUP BY ${groupBy}, platform
      ORDER BY period ASC
    `, (err, results) => {
      if (err) {
        console.error('Erreur lors de la récupération des stats détaillées:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      res.json({
        success: true,
        period,
        data: results
      });
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des stats détaillées:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Top des erreurs les plus fréquentes
 */
router.get('/top-errors', authenticateAdmin, (req, res) => {
  try {
    const { limit = 10 } = req.query;

    db.all(`
      SELECT 
        error_message,
        platform,
        COUNT(*) as count,
        MAX(created_at) as last_occurrence
      FROM error_reports 
      GROUP BY error_message, platform
      ORDER BY count DESC
      LIMIT ?
    `, [parseInt(limit)], (err, results) => {
      if (err) {
        console.error('Erreur lors de la récupération du top des erreurs:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      res.json({
        success: true,
        topErrors: results
      });
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du top des erreurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;