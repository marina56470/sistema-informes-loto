require('dotenv').config();
const express      = require('express');
const session      = require('express-session');
const pgSession    = require('connect-pg-simple')(session);
const passport     = require('./config/passport');
const fileUpload   = require('express-fileupload');
const path         = require('path');
const pool         = require('./config/db');

const { flashMiddleware } = require('./middlewares/authMiddleware');

// Rutas
const authRoutes     = require('./routes/authRoutes');
const informesRoutes = require('./routes/informesRoutes');
const clientesRoutes = require('./routes/clientesRoutes');
const hallazgosRoutes= require('./routes/hallazgosRoutes');
const productosRoutes = require('./routes/productosRoutes');

const app = express();

// ── MOTOR DE VISTAS EJS ───────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'frontend/views'));

// ── ARCHIVOS ESTÁTICOS ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'frontend/public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── PARSERS ───────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── UPLOAD DE ARCHIVOS ────────────────────────────────────────────────────────
app.use(fileUpload({
  limits:    { fileSize: 5 * 1024 * 1024 }, // 5 MB
  abortOnLimit: true,
  createParentPath: true,
}));

// ── SESIONES con PostgreSQL ───────────────────────────────────────────────────
app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false, // la tabla ya existe en Neon
  }),
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 días
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
  name: 'loto.sid',
}));

// ── PASSPORT ──────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── FLASH + LOCALS GLOBALES ───────────────────────────────────────────────────
app.use(flashMiddleware);

// Exponer año actual y nombre de la app en todas las vistas
app.use((req, res, next) => {
  res.locals.appName  = process.env.APP_NAME || 'LOTO PRO';
  res.locals.anioActual = new Date().getFullYear();
  next();
});

// ── RUTAS ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.redirect('/auth/login');
});

app.use('/auth',      authRoutes);
app.use('/informes',  informesRoutes);
app.use('/clientes',  clientesRoutes);
app.use('/hallazgos', hallazgosRoutes);
app.use('/productos', productosRoutes);

// Dashboard
const informesCtrl = require('./controllers/informesController');
const { requireAuth } = require('./middlewares/authMiddleware');
app.get('/dashboard', requireAuth, informesCtrl.dashboard);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('partials/404', { title: 'Página no encontrada' });
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error no controlado:', err);
  res.status(500).render('partials/error', {
    title: 'Error interno',
    mensaje: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal.',
  });
});

// ── ARRANCAR SERVIDOR ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
});