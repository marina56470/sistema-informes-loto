// ── Verifica que el usuario esté autenticado ─────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
}

// ── Verifica que el usuario NO esté autenticado (para login/register) ────────
function requireGuest(req, res, next) {
  if (!req.isAuthenticated()) return next();
  res.redirect('/dashboard');
}

// ── Adjunta mensajes flash manuales (sin connect-flash) ──────────────────────
// Los guardamos en session.flash y los limpiamos tras leerlos
function flashMiddleware(req, res, next) {
  // Método para guardar un flash
  req.flash = (type, msg) => {
    if (!req.session.flash) req.session.flash = {};
    req.session.flash[type] = msg;
  };

  // Exponerlos en res.locals y limpiarlos
  res.locals.flash = req.session.flash || {};
  res.locals.user  = req.user || null;
  delete req.session.flash;

  next();
}

module.exports = { requireAuth, requireGuest, flashMiddleware };