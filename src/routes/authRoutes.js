const express  = require('express');
const router   = express.Router();
const passport = require('passport');
const ctrl     = require('../controllers/authController');
const { requireGuest } = require('../middlewares/authMiddleware');

// Registro
router.get('/register', requireGuest, ctrl.getRegister);
router.post('/register', requireGuest, ctrl.postRegister);

// Verificación de email
router.get('/verificar/:token', ctrl.verificarEmail);

// Login local
router.get('/login', requireGuest, ctrl.getLogin);
router.post('/login', requireGuest, ctrl.postLogin);

// Recuperación de contraseña
router.get('/olvide-contrasena',  requireGuest, ctrl.getOlvideContrasena);
router.post('/olvide-contrasena', requireGuest, ctrl.postOlvideContrasena);
router.get('/restablecer/:token',  requireGuest, ctrl.getRestablecer);
router.post('/restablecer/:token', requireGuest, ctrl.postRestablecer);

// Logout
router.get('/logout', ctrl.logout);

// Google OAuth
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/login',
    failureMessage:  true,
  }),
  (req, res) => {
    const destino = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(destino);
  }
);

module.exports = router;