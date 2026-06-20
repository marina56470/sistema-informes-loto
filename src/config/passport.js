const passport        = require('passport');
const LocalStrategy   = require('passport-local').Strategy;
const GoogleStrategy  = require('passport-google-oauth20').Strategy;
const bcrypt          = require('bcryptjs');
const pool            = require('./db');
require('dotenv').config();

// ── SERIALIZE / DESERIALIZE ──────────────────────────────────────────────────
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, email, avatar_url, cargo, zona, email_verificado, activo FROM usuarios WHERE id = $1',
      [id]
    );
    if (!rows[0]) return done(null, false);
    done(null, rows[0]);
  } catch (err) {
    done(err);
  }
});

// ── LOCAL STRATEGY (email + password) ────────────────────────────────────────
passport.use(new LocalStrategy(
  { usernameField: 'email', passwordField: 'password' },
  async (email, password, done) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE',
        [email.toLowerCase().trim()]
      );
      const user = rows[0];

      if (!user) {
        return done(null, false, { message: 'Correo o contraseña incorrectos.' });
      }
      if (!user.password_hash) {
        return done(null, false, { message: 'Esta cuenta usa inicio con Google. Usa ese método.' });
      }
      if (!user.email_verificado) {
        return done(null, false, { message: 'Debes verificar tu correo antes de ingresar.' });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return done(null, false, { message: 'Correo o contraseña incorrectos.' });
      }

      // Actualizar last_login (opcional)
      await pool.query('UPDATE usuarios SET creado_en = creado_en WHERE id = $1', [user.id]);

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// ── GOOGLE STRATEGY ──────────────────────────────────────────────────────────
passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email     = profile.emails[0].value.toLowerCase();
      const googleId  = profile.id;
      const nombre    = profile.displayName;
      const avatarUrl = profile.photos?.[0]?.value || null;

      // ¿Ya existe con este google_id?
      let { rows } = await pool.query(
        'SELECT * FROM usuarios WHERE google_id = $1',
        [googleId]
      );

      if (rows[0]) {
        // Actualizar avatar si cambió
        await pool.query(
          'UPDATE usuarios SET avatar_url = $1 WHERE id = $2',
          [avatarUrl, rows[0].id]
        );
        return done(null, rows[0]);
      }

      // ¿Existe con el mismo email (registro local previo)?
      ({ rows } = await pool.query(
        'SELECT * FROM usuarios WHERE email = $1',
        [email]
      ));

      if (rows[0]) {
        // Vincular cuenta de Google al usuario existente
        await pool.query(
          'UPDATE usuarios SET google_id = $1, avatar_url = $2, email_verificado = TRUE WHERE id = $3',
          [googleId, avatarUrl, rows[0].id]
        );
        return done(null, rows[0]);
      }

      // Crear nuevo usuario con Google
      const insert = await pool.query(
        `INSERT INTO usuarios (nombre, email, google_id, avatar_url, email_verificado, activo)
         VALUES ($1, $2, $3, $4, TRUE, TRUE)
         RETURNING *`,
        [nombre, email, googleId, avatarUrl]
      );

      return done(null, insert.rows[0]);
    } catch (err) {
      return done(err);
    }
  }
));

module.exports = passport;