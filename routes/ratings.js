const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/connection');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * Créer une nouvelle notation (PUBLIC)
 */
router.post('/', (req, res) => {
  try {
    const {
      rating,
      comment,
      category,
      platform,
      url,
      downloadTime,
      fileSize,
      userAgent,
      browserInfo
    } = req.body;

    // Validation des données requises
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: 'Note requise (1-5)'
      });
    }

    if (!platform || !url) {
      return res.status(400).json({
        error: 'Plateforme et URL sont requis'
      });
    }

    const ratingUuid = uuidv4();
    const now = new Date().toISOString();

    // Insérer la notation dans la base de données
    db.run(`
      INSERT INTO user_ratings (
        uuid, rating, comment, category, platform, url, 
        download_time, file_size, user_agent, browser_info, 
        ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ratingUuid,
      rating,
      comment || null,
      category || 'general',
      platform,
      url,
      downloadTime || null,
      fileSize || null,
      userAgent || null,
      JSON.stringify(browserInfo || {}),
      req.ip,
      now
    ], function(err) {
      if (err) {
        console.error('Erreur lors de la création de la notation:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      console.log(`⭐ Nouvelle notation: ${rating}/5 - ${platform}`);
      
      res.status(201).json({
        success: true,
        message: 'Notation envoyée avec succès',
        ratingId: ratingUuid
      });
    });
  } catch (error) {
    console.error('Erreur lors de la création de la notation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Récupérer toutes les notations (ADMIN SEULEMENT)
 */
router.get('/', authenticateAdmin, (req, res) => {
  try {
    const {
      rating,
      category,
      platform,
      limit = 50,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM user_ratings';
    let countQuery = 'SELECT COUNT(*) as total FROM user_ratings';
    let avgQuery = 'SELECT AVG(rating) as average FROM user_ratings';
    let distQuery = 'SELECT rating, COUNT(*) as count FROM user_ratings GROUP BY rating';
    
    const params = [];
    const conditions = [];

    // Filtres
    if (rating) {
      conditions.push('rating = ?');
      params.push(parseInt(rating));
    }

    if (category && category !== 'all') {
      conditions.push('category = ?');
      params.push(category);
    }

    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
      avgQuery += whereClause;
      distQuery += whereClause;
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    // Exécuter toutes les requêtes
    const queries = [
      // Total
      new Promise((resolve, reject) => {
        db.get(countQuery, params.slice(0, -2), (err, result) => {
          if (err) reject(err);
          else resolve(result.total);
        });
      }),
      
      // Moyenne
      new Promise((resolve, reject) => {
        db.get(avgQuery, params.slice(0, -2), (err, result) => {
          if (err) reject(err);
          else resolve(result.average || 0);
        });
      }),
      
      // Distribution
      new Promise((resolve, reject) => {
        db.all(distQuery, params.slice(0, -2), (err, results) => {
          if (err) reject(err);
          else {
            const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            results.forEach(row => {
              distribution[row.rating] = row.count;
            });
            resolve(distribution);
          }
        });
      }),
      
      // Notations
      new Promise((resolve, reject) => {
        db.all(query, params, (err, ratings) => {
          if (err) reject(err);
          else {
            const processedRatings = ratings.map(rating => ({
              ...rating,
              browser_info: rating.browser_info ? JSON.parse(rating.browser_info) : {}
            }));
            resolve(processedRatings);
          }
        });
      })
    ];

    Promise.all(queries)
      .then(([total, average, distribution, ratings]) => {
        res.json({
          success: true,
          ratings,
          total,
          average: Math.round(average * 10) / 10,
          distribution,
          limit: parseInt(limit),
          offset: parseInt(offset)
        });
      })
      .catch(error => {
        console.error('Erreur lors de la récupération des notations:', error);
        res.status(500).json({ error: 'Erreur serveur' });
      });

  } catch (error) {
    console.error('Erreur lors de la récupération des notations:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Supprimer une notation (ADMIN SEULEMENT)
 */
router.delete('/:uuid', authenticateAdmin, (req, res) => {
  try {
    const { uuid } = req.params;

    db.run('DELETE FROM user_ratings WHERE uuid = ?', [uuid], function(err) {
      if (err) {
        console.error('Erreur lors de la suppression de la notation:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Notation non trouvée' });
      }

      console.log(`🗑️ Notation supprimée: ${uuid} par ${req.admin.email}`);
      
      res.json({
        success: true,
        message: 'Notation supprimée avec succès'
      });
    });
  } catch (error) {
    console.error('Erreur lors de la suppression de la notation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Statistiques des notations (ADMIN SEULEMENT)
 */
router.get('/stats', authenticateAdmin, (req, res) => {
  try {
    const statsQueries = [
      // Notations par catégorie
      new Promise((resolve, reject) => {
        db.all(`
          SELECT category, COUNT(*) as count, AVG(rating) as avg_rating
          FROM user_ratings 
          GROUP BY category
        `, (err, results) => {
          if (err) reject(err);
          else {
            const categories = {};
            results.forEach(row => {
              categories[row.category] = {
                count: row.count,
                average: Math.round(row.avg_rating * 10) / 10
              };
            });
            resolve(categories);
          }
        });
      }),
      
      // Notations par plateforme
      new Promise((resolve, reject) => {
        db.all(`
          SELECT platform, COUNT(*) as count, AVG(rating) as avg_rating
          FROM user_ratings 
          GROUP BY platform
          ORDER BY count DESC
        `, (err, results) => {
          if (err) reject(err);
          else {
            const platforms = {};
            results.forEach(row => {
              platforms[row.platform] = {
                count: row.count,
                average: Math.round(row.avg_rating * 10) / 10
              };
            });
            resolve(platforms);
          }
        });
      }),
      
      // Évolution des notations (7 derniers jours)
      new Promise((resolve, reject) => {
        db.all(`
          SELECT 
            DATE(created_at) as date,
            COUNT(*) as count,
            AVG(rating) as avg_rating
          FROM user_ratings 
          WHERE created_at >= DATE('now', '-7 days')
          GROUP BY DATE(created_at)
          ORDER BY date ASC
        `, (err, results) => {
          if (err) reject(err);
          else {
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
              const date = new Date();
              date.setDate(date.getDate() - i);
              const dateStr = date.toISOString().split('T')[0];
              
              const dayData = results.find(r => r.date === dateStr);
              last7Days.push({
                date: dateStr,
                count: dayData ? dayData.count : 0,
                average: dayData ? Math.round(dayData.avg_rating * 10) / 10 : 0
              });
            }
            resolve(last7Days);
          }
        });
      })
    ];

    Promise.all(statsQueries)
      .then(([categories, platforms, weeklyStats]) => {
        res.json({
          success: true,
          stats: {
            categories,
            platforms,
            weeklyEvolution: weeklyStats
          }
        });
      })
      .catch(error => {
        console.error('Erreur lors de la récupération des stats de notations:', error);
        res.status(500).json({ error: 'Erreur serveur' });
      });
  } catch (error) {
    console.error('Erreur lors de la récupération des stats de notations:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;