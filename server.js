const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const errorReportsRoutes = require('./routes/errorReports');
const statsRoutes = require('./routes/stats');
const ratingsRoutes = require('./routes/ratings');

const app = express();
const PORT = process.env.PORT || 3001;

console.log(`📌 PORT configuré: ${PORT}`);

// Middleware de sécurité
app.use(helmet());

// Configuration CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Trop de requêtes, veuillez réessayer plus tard.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Middleware pour parser JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware pour logger les requêtes
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/error-reports', errorReportsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/ratings', ratingsRoutes);

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Route par défaut
app.get('/', (req, res) => {
  res.json({
    message: 'NICE-Downs Backend API',
    version: '1.0.0',
    developer: 'NICE-DEV',
    country: 'Burkina Faso 🇧🇫',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      errorReports: '/api/error-reports',
      stats: '/api/stats',
      ratings: '/api/ratings'
    }
  });
});

// Middleware de gestion d'erreurs
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Erreur interne du serveur' 
      : err.message,
    timestamp: new Date().toISOString()
  });
});

// Gestion des routes non trouvées
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Initialisation de la base de données
const initializeDatabase = async () => {
  try {
    const initModule = require('./scripts/initDatabase');
    if (typeof initModule.initDatabase === 'function') {
      await initModule.initDatabase();
      console.log('✅ Base de données initialisée');
    } else {
      console.log('ℹ️  Base de données déjà initialisée');
    }
  } catch (error) {
    console.error('⚠️  Erreur initialisation DB (non bloquant):', error.message);
  }
};

// Démarrage du serveur
const startServer = async () => {
  // Initialiser la base de données en production
  await initializeDatabase();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 NICE-Downs Backend démarré !');
    console.log(`📡 Serveur: http://0.0.0.0:${PORT}`);
    console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🇧🇫 Développé par NICE-DEV au Burkina Faso`);
    console.log('');
    console.log('📋 Endpoints disponibles:');
    console.log(`   GET  /api/health - Statut du serveur`);
    console.log(`   POST /api/auth/login - Connexion admin`);
    console.log(`   GET  /api/error-reports - Liste des rapports`);
    console.log(`   POST /api/error-reports - Nouveau rapport`);
    console.log(`   GET  /api/stats - Statistiques`);
    console.log(`   POST /api/ratings - Nouvelle notation`);
    console.log(`   GET  /api/ratings - Liste des notations`);
    console.log('');
  });
};

startServer().catch(console.error);

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du serveur...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Arrêt du serveur...');
  process.exit(0);
});
