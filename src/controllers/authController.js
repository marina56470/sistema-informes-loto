const bcrypt      = require('bcryptjs');
const crypto      = require('crypto');
const nodemailer  = require('nodemailer');
const passport    = require('passport');
const pool        = require('../config/db');
require('dotenv').config();

// ── Mailer ────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
});

async function enviarVerificacion(email, nombre, token) {
  const url = `${process.env.APP_URL}/auth/verificar/${token}`;
  await transporter.sendMail({
    from: `"${process.env.APP_NAME}" <${process.env.MAIL_USER}>`,
    to: email,
    subject: '✅ Verifica tu cuenta en LOTO PRO',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1a1a1a;padding:24px 32px;text-align:center;">
          <span style="font-size:2rem;font-weight:900;color:#F5C800;letter-spacing:4px;">LOTO PRO</span>
        </div>
        <div style="padding:32px;background:#fff;border:1px solid #e5e5e5;">
          <h2 style="color:#1a1a1a;">Hola, ${nombre} 👋</h2>
          <p style="color:#555;line-height:1.7;">
            Gracias por registrarte. Haz clic en el botón para activar tu cuenta:
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${url}" style="background:#F5C800;color:#1a1a1a;padding:13px 32px;
               text-decoration:none;font-weight:800;font-size:1rem;border-radius:4px;
               letter-spacing:1px;">VERIFICAR CUENTA</a>
          </div>
          <p style="color:#999;font-size:0.8rem;">
            Este enlace expira en 24 horas. Si no creaste esta cuenta, ignora este correo.
          </p>
          <p style="color:#bbb;font-size:0.75rem;margin-top:8px;">
            O copia este enlace: <a href="${url}" style="color:#D4A900;">${url}</a>
          </p>
        </div>
      </div>`,
  });
}

// ── GET /auth/register ────────────────────────────────────────────────────────
exports.getRegister = (req, res) => {
  res.render('auth/register', { title: 'Registro' });
};

// ── POST /auth/register ───────────────────────────────────────────────────────
exports.postRegister = async (req, res) => {
  const { nombre, email, password, password2, cargo, zona } = req.body;

  if (password !== password2) {
    req.flash('error', 'Las contraseñas no coinciden.');
    return res.redirect('/auth/register');
  }
  if (password.length < 8) {
    req.flash('error', 'La contraseña debe tener mínimo 8 caracteres.');
    return res.redirect('/auth/register');
  }

  try {
    // ¿Email ya existe?
    const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase()]);
    if (existe.rows[0]) {
      req.flash('error', 'Ese correo ya está registrado.');
      return res.redirect('/auth/register');
    }

    const hash  = await bcrypt.hash(password, 12);
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, cargo, zona, token_verificacion, token_expira, tipo_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'verificacion')`,
      [nombre.trim(), email.toLowerCase(), hash, cargo || null, zona || null, token, expira]
    );

    await enviarVerificacion(email.toLowerCase(), nombre.trim(), token);

    req.flash('success', 'Registro exitoso. Revisa tu correo para verificar tu cuenta.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error('Error en registro:', err);
    req.flash('error', 'Error interno. Intenta de nuevo.');
    res.redirect('/auth/register');
  }
};

// ── GET /auth/verificar/:token ────────────────────────────────────────────────
exports.verificarEmail = async (req, res) => {
  const { token } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, token_expira FROM usuarios
       WHERE token_verificacion = $1
         AND email_verificado = FALSE
         AND (tipo_token IS NULL OR tipo_token = 'verificacion')`,
      [token]
    );

    const usuario = rows[0];
    const expirado = !usuario || new Date(usuario.token_expira).getTime() < Date.now();

    if (expirado) {
      return res.render('auth/verificar', {
        title: 'Verificación',
        exito: false,
        mensaje: 'El enlace no es válido o ya expiró.',
      });
    }

    await pool.query(
      `UPDATE usuarios
       SET email_verificado = TRUE, token_verificacion = NULL, token_expira = NULL, tipo_token = NULL
       WHERE id = $1`,
      [rows[0].id]
    );

    res.render('auth/verificar', {
      title: 'Verificación',
      exito: true,
      mensaje: '¡Cuenta verificada! Ya puedes iniciar sesión.',
    });
  } catch (err) {
    console.error('Error verificando email:', err);
    res.render('auth/verificar', { title: 'Verificación', exito: false, mensaje: 'Error interno.' });
  }
};

// ── GET /auth/login ───────────────────────────────────────────────────────────
exports.getLogin = (req, res) => {
  res.render('auth/login', { title: 'Iniciar Sesión' });
};

// ── POST /auth/login (usa Passport Local) ─────────────────────────────────────
exports.postLogin = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      req.flash('error', info?.message || 'Credenciales incorrectas.');
      return res.redirect('/auth/login');
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      const destino = req.session.returnTo || '/dashboard';
      delete req.session.returnTo;
      res.redirect(destino);
    });
  })(req, res, next);
};

// ── GET /auth/logout ──────────────────────────────────────────────────────────
exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect('/auth/login');
    });
  });
};

// ── Google OAuth callbacks (rutas manejadas directamente en authRoutes.js) ────
// getGoogleAuth  → passport.authenticate('google', {...})
// getGoogleCallback → passport.authenticate + redirect

// ── Email de recuperación de contraseña ───────────────────────────────────────
async function enviarRecuperacion(email, nombre, token) {
  const url = `${process.env.APP_URL}/auth/restablecer/${token}`;
  await transporter.sendMail({
    from: `"${process.env.APP_NAME}" <${process.env.MAIL_USER}>`,
    to: email,
    subject: '🔐 Recupera tu contraseña — LOTO PRO',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
        <div style="background:#1a1a1a;padding:24px 32px;text-align:center;border-bottom:4px solid #F5C800;">
          <span style="font-size:2rem;font-weight:900;color:#F5C800;letter-spacing:4px;">LOTO PRO</span>
        </div>
        <div style="padding:32px;background:#fff;border:1px solid #e5e5e5;border-top:none;">
          <h2 style="color:#1a1a1a;">Hola, ${nombre} 👋</h2>
          <p style="color:#555;line-height:1.7;">
            Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva:
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${url}" style="background:#F5C800;color:#1a1a1a;padding:13px 32px;
               text-decoration:none;font-weight:800;font-size:1rem;border-radius:4px;
               letter-spacing:1px;">RESTABLECER CONTRASEÑA</a>
          </div>
          <p style="color:#999;font-size:0.8rem;">
            Este enlace expira en <strong>1 hora</strong> por seguridad.
            Si no solicitaste este cambio, ignora este correo — tu contraseña actual seguirá funcionando.
          </p>
          <p style="color:#999;font-size:0.75rem;background:#FFFBE6;border-left:3px solid #F5C800;padding:8px 12px;border-radius:3px;">
            ⚠️ Si solicitaste varios correos de recuperación, <strong>solo el último que recibiste es válido</strong>.
            Los enlaces anteriores dejan de funcionar automáticamente.
          </p>
          <p style="color:#bbb;font-size:0.75rem;margin-top:8px;">
            O copia este enlace: <a href="${url}" style="color:#D4A900;">${url}</a>
          </p>
        </div>
        <div style="background:#1a1a1a;padding:12px 32px;text-align:center;">
          <span style="color:rgba(255,255,255,.5);font-size:.65rem;">ASSA ABLOY Colombia S.A.S. — Yale LOTO Solutions</span>
        </div>
      </div>`,
  });
}

// ── GET /auth/olvide-contrasena ───────────────────────────────────────────────
exports.getOlvideContrasena = (req, res) => {
  res.render('auth/olvide-contrasena', { title: 'Recuperar Contraseña' });
};

// ── POST /auth/olvide-contrasena ──────────────────────────────────────────────
exports.postOlvideContrasena = async (req, res) => {
  const { email } = req.body;

  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, google_id FROM usuarios WHERE email = $1 AND activo = TRUE',
      [email.toLowerCase().trim()]
    );

    // Por seguridad, siempre mostramos el mismo mensaje exista o no la cuenta
    // (así nadie puede usar este form para descubrir qué correos están registrados)
    const mensajeGenerico = 'Si el correo existe en nuestro sistema, recibirás un enlace de recuperación en unos minutos.';

    if (!rows[0]) {
      req.flash('success', mensajeGenerico);
      return res.redirect('/auth/login');
    }

    if (rows[0].google_id && !rows[0].password_hash) {
      // Cuenta solo-Google, no tiene contraseña que recuperar
      req.flash('error', 'Esta cuenta inicia sesión con Google. No tiene contraseña que recuperar — usa el botón "Continuar con Google".');
      return res.redirect('/auth/login');
    }

    const token  = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.query(
      `UPDATE usuarios
       SET token_verificacion = $1, token_expira = $2, tipo_token = 'reset'
       WHERE id = $3`,
      [token, expira, rows[0].id]
    );

    await enviarRecuperacion(email.toLowerCase().trim(), rows[0].nombre, token);

    req.flash('success', mensajeGenerico);
    res.redirect('/auth/login');
  } catch (err) {
    console.error('Error en recuperación de contraseña:', err);
    req.flash('error', 'Error interno. Intenta de nuevo en unos minutos.');
    res.redirect('/auth/olvide-contrasena');
  }
};

// ── GET /auth/restablecer/:token ──────────────────────────────────────────────
exports.getRestablecer = async (req, res) => {
  const { token } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT id, token_expira FROM usuarios
       WHERE token_verificacion = $1
         AND tipo_token = 'reset'`,
      [token]
    );

    // Comparamos la expiración en JS (no en SQL) para evitar problemas
    // de huso horario entre el reloj de Node y el de Postgres/Neon.
    const usuario = rows[0];
    const expirado = !usuario || new Date(usuario.token_expira).getTime() < Date.now();

    if (expirado) {
      return res.render('auth/restablecer', {
        title: 'Restablecer Contraseña',
        tokenValido: false,
        token: null,
      });
    }

    res.render('auth/restablecer', {
      title: 'Restablecer Contraseña',
      tokenValido: true,
      token,
    });
  } catch (err) {
    console.error('Error al validar token:', err);
    res.render('auth/restablecer', { title: 'Restablecer Contraseña', tokenValido: false, token: null });
  }
};

// ── POST /auth/restablecer/:token ─────────────────────────────────────────────
exports.postRestablecer = async (req, res) => {
  const { token } = req.params;
  const { password, password2 } = req.body;

  if (password !== password2) {
    req.flash('error', 'Las contraseñas no coinciden.');
    return res.redirect(`/auth/restablecer/${token}`);
  }
  if (password.length < 8) {
    req.flash('error', 'La contraseña debe tener mínimo 8 caracteres.');
    return res.redirect(`/auth/restablecer/${token}`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, token_expira FROM usuarios
       WHERE token_verificacion = $1
         AND tipo_token = 'reset'`,
      [token]
    );

    const usuario = rows[0];
    const expirado = !usuario || new Date(usuario.token_expira).getTime() < Date.now();

    if (expirado) {
      req.flash('error', 'El enlace expiró o no es válido. Solicita uno nuevo.');
      return res.redirect('/auth/olvide-contrasena');
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      `UPDATE usuarios
       SET password_hash = $1,
           token_verificacion = NULL,
           token_expira = NULL,
           tipo_token = NULL
       WHERE id = $2`,
      [hash, rows[0].id]
    );

    req.flash('success', '¡Contraseña actualizada! Ya puedes iniciar sesión.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error('Error al restablecer contraseña:', err);
    req.flash('error', 'Error interno. Intenta de nuevo.');
    res.redirect(`/auth/restablecer/${token}`);
  }
};