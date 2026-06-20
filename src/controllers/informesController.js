const pool = require('../config/db');
const path = require('path');

// ── Catálogo Yale (mismo que el frontend) ─────────────────────────────────────
// Se carga de la tabla productos en DB. Se usa en la vista nuevo/editar.

// ── GET /dashboard ────────────────────────────────────────────────────────────
exports.dashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    const [{ rows: informes }, { rows: stats }] = await Promise.all([
      pool.query(
        `SELECT i.*, c.empresa, c.ciudad,
                COUNT(h.id) AS total_hallazgos
         FROM informes i
         LEFT JOIN clientes c ON i.cliente_id = c.id
         LEFT JOIN hallazgos h ON h.informe_id = i.id
         WHERE i.usuario_id = $1
         GROUP BY i.id, c.empresa, c.ciudad
         ORDER BY i.actualizado_en DESC
         LIMIT 5`,
        [userId]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE estado = 'borrador')   AS borradores,
           COUNT(*) FILTER (WHERE estado = 'finalizado') AS finalizados,
           COUNT(*) FILTER (WHERE estado = 'enviado')    AS enviados,
           COUNT(*) AS total
         FROM informes WHERE usuario_id = $1`,
        [userId]
      ),
    ]);

    res.render('dashboard', {
      title: 'Inicio',
      informes,
      stats: stats[0],
    });
  } catch (err) {
    console.error(err);
    res.render('dashboard', { title: 'Inicio', informes: [], stats: {} });
  }
};

// ── GET /informes ─────────────────────────────────────────────────────────────
exports.index = async (req, res) => {
  const { estado, q, page = 1 } = req.query;
  const limit  = 12;
  const offset = (page - 1) * limit;
  const userId = req.user.id;

  const conditions = ['i.usuario_id = $1'];
  const params     = [userId];
  let p = 2;

  if (estado) { conditions.push(`i.estado = $${p++}`); params.push(estado); }
  if (q)      { conditions.push(`c.empresa ILIKE $${p++}`); params.push(`%${q}%`); }

  const where = conditions.join(' AND ');

  try {
    const [{ rows: informes }, { rows: countRow }] = await Promise.all([
      pool.query(
        `SELECT i.*, c.empresa, c.ciudad,
                COUNT(h.id) AS total_hallazgos
         FROM informes i
         LEFT JOIN clientes c ON i.cliente_id = c.id
         LEFT JOIN hallazgos h ON h.informe_id = i.id
         WHERE ${where}
         GROUP BY i.id, c.empresa, c.ciudad
         ORDER BY i.actualizado_en DESC
         LIMIT $${p} OFFSET $${p+1}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM informes i
         LEFT JOIN clientes c ON i.cliente_id = c.id
         WHERE ${where}`,
        params
      ),
    ]);

    const total   = parseInt(countRow[0].count);
    const paginas = Math.ceil(total / limit);

    res.render('informes/index', {
      title: 'Mis Informes',
      informes,
      total,
      paginas,
      paginaActual: parseInt(page),
      filtros: { estado, q },
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al cargar informes.');
    res.redirect('/dashboard');
  }
};

// ── GET /informes/nuevo ───────────────────────────────────────────────────────
exports.getNuevo = async (req, res) => {
  try {
    const [{ rows: clientes }, { rows: productos }] = await Promise.all([
      pool.query(
        'SELECT id, empresa, ciudad FROM clientes WHERE creado_por = $1 ORDER BY empresa',
        [req.user.id]
      ),
      pool.query('SELECT * FROM productos WHERE activo = TRUE ORDER BY categoria, nombre'),
    ]);

    res.render('informes/nuevo', {
      title: 'Nuevo Informe',
      clientes,
      productos,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al cargar formulario.');
    res.redirect('/informes');
  }
};

// ── POST /informes ────────────────────────────────────────────────────────────
exports.crear = async (req, res) => {
  const { cliente_id, fecha_informe, fecha_visita, notas_comerciales } = req.body;
  const userId = req.user.id;

  try {
    const { rows } = await pool.query(
      `INSERT INTO informes (usuario_id, cliente_id, fecha_informe, fecha_visita, notas_comerciales)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, cliente_id || null,
       fecha_informe || new Date().toISOString().split('T')[0],
       fecha_visita || null,
       notas_comerciales || null]
    );

    req.flash('success', 'Informe creado. Ahora agrega los puntos de bloqueo.');
    res.redirect(`/informes/${rows[0].id}/editar`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al crear informe.');
    res.redirect('/informes/nuevo');
  }
};

// ── GET /informes/:id/editar ──────────────────────────────────────────────────
exports.getEditar = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    // Verificar que el informe pertenece al usuario
    const { rows: inf } = await pool.query(
      `SELECT i.*, c.empresa, c.ciudad, c.contacto, c.cargo_contacto
       FROM informes i
       LEFT JOIN clientes c ON i.cliente_id = c.id
       WHERE i.id = $1 AND i.usuario_id = $2`,
      [id, userId]
    );
    if (!inf[0]) {
      req.flash('error', 'Informe no encontrado.');
      return res.redirect('/informes');
    }

    // Hallazgos con sus energías y productos
    const { rows: hallazgos } = await pool.query(
      `SELECT h.*,
              COALESCE(
                json_agg(DISTINCT he.tipo_energia) FILTER (WHERE he.id IS NOT NULL),
                '[]'
              ) AS energias,
              COALESCE(
                json_agg(
                  DISTINCT jsonb_build_object(
                    'id', p.id, 'sku', p.sku, 'nombre', p.nombre,
                    'descripcion', p.descripcion, 'categoria', p.categoria, 'foto_url', p.foto_url
                  )
                ) FILTER (WHERE p.id IS NOT NULL),
                '[]'
              ) AS productos
       FROM hallazgos h
       LEFT JOIN hallazgo_energias he ON he.hallazgo_id = h.id
       LEFT JOIN hallazgo_productos hp ON hp.hallazgo_id = h.id
       LEFT JOIN productos p ON p.id = hp.producto_id
       WHERE h.informe_id = $1
       GROUP BY h.id
       ORDER BY h.orden`,
      [id]
    );

    const [{ rows: clientes }, { rows: productos }] = await Promise.all([
      pool.query('SELECT id, empresa, ciudad FROM clientes WHERE creado_por = $1 ORDER BY empresa', [userId]),
      pool.query('SELECT * FROM productos WHERE activo = TRUE ORDER BY categoria, nombre'),
    ]);

    res.render('informes/editar', {
      title: 'Editar Informe',
      informe: inf[0],
      hallazgos,
      clientes,
      productos,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al cargar informe.');
    res.redirect('/informes');
  }
};

// ── PUT /informes/:id ─────────────────────────────────────────────────────────
exports.actualizar = async (req, res) => {
  const { id } = req.params;
  const { cliente_id, fecha_informe, fecha_visita, estado, notas_comerciales } = req.body;

  try {
    const result = await pool.query(
      `UPDATE informes
       SET cliente_id=$1, fecha_informe=$2, fecha_visita=$3,
           estado=$4, notas_comerciales=$5, actualizado_en=NOW()
       WHERE id=$6 AND usuario_id=$7`,
      [cliente_id || null, fecha_informe, fecha_visita || null,
       estado || 'borrador', notas_comerciales || null, id, req.user.id]
    );

    if (result.rowCount === 0) {
      req.flash('error', 'Informe no encontrado.');
      return res.redirect('/informes');
    }

    req.flash('success', 'Informe guardado.');
    res.redirect(`/informes/${id}/editar`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al guardar.');
    res.redirect(`/informes/${id}/editar`);
  }
};

// ── DELETE /informes/:id ──────────────────────────────────────────────────────
exports.eliminar = async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM informes WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.user.id]
    );
    req.flash('success', 'Informe eliminado correctamente.');
    res.redirect('/informes');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al eliminar.');
    res.redirect('/informes');
  }
};

// ── GET /informes/:id/preview ─────────────────────────────────────────────────
exports.preview = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const { rows: inf } = await pool.query(
      `SELECT i.*, c.empresa, c.ciudad, c.contacto, c.cargo_contacto,
              u.nombre AS ejecutivo, u.zona
       FROM informes i
       LEFT JOIN clientes c ON i.cliente_id = c.id
       LEFT JOIN usuarios u ON i.usuario_id = u.id
       WHERE i.id = $1 AND i.usuario_id = $2`,
      [id, userId]
    );
    if (!inf[0]) {
      req.flash('error', 'Informe no encontrado.');
      return res.redirect('/informes');
    }

    const { rows: hallazgos } = await pool.query(
      `SELECT h.*,
              COALESCE(json_agg(DISTINCT he.tipo_energia) FILTER (WHERE he.id IS NOT NULL), '[]') AS energias,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                  'sku', p.sku, 'nombre', p.nombre, 'descripcion', p.descripcion, 'foto_url', p.foto_url
                )) FILTER (WHERE p.id IS NOT NULL),
                '[]'
              ) AS productos
       FROM hallazgos h
       LEFT JOIN hallazgo_energias he ON he.hallazgo_id = h.id
       LEFT JOIN hallazgo_productos hp ON hp.hallazgo_id = h.id
       LEFT JOIN productos p ON p.id = hp.producto_id
       WHERE h.informe_id = $1
       GROUP BY h.id ORDER BY h.orden`,
      [id]
    );

    res.render('informes/preview', {
      title: `Informe — ${inf[0].empresa || 'Sin cliente'}`,
      informe: inf[0],
      hallazgos,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al cargar preview.');
    res.redirect('/informes');
  }
};

// ── PUT /informes/:id/finalizar ───────────────────────────────────────────────
exports.finalizar = async (req, res) => {
  try {
    await pool.query(
      `UPDATE informes SET estado='finalizado', actualizado_en=NOW()
       WHERE id=$1 AND usuario_id=$2`,
      [req.params.id, req.user.id]
    );
    req.flash('success', 'Informe marcado como finalizado.');
    res.redirect(`/informes/${req.params.id}/preview`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al finalizar.');
    res.redirect('/informes');
  }
};

// ── POST /informes/:id/enviar ─────────────────────────────────────────────────
exports.enviar = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { email_destino, email_cc, mensaje_personal } = req.body;

  if (!email_destino) {
    return res.status(400).json({ ok: false, error: 'El correo del destinatario es obligatorio.' });
  }

  try {
    // Verificar pertenencia
    const { rows: inf } = await pool.query(
      `SELECT i.*, c.empresa, c.ciudad, c.contacto, c.cargo_contacto,
              u.nombre AS ejecutivo, u.zona
       FROM informes i
       LEFT JOIN clientes c ON i.cliente_id = c.id
       LEFT JOIN usuarios u ON i.usuario_id = u.id
       WHERE i.id = $1 AND i.usuario_id = $2`,
      [id, userId]
    );
    if (!inf[0]) return res.status(404).json({ ok: false, error: 'Informe no encontrado.' });

    // Hallazgos completos
    const { rows: hallazgos } = await pool.query(
      `SELECT h.*,
              COALESCE(json_agg(DISTINCT he.tipo_energia) FILTER (WHERE he.id IS NOT NULL),'[]') AS energias,
              COALESCE(
                json_agg(DISTINCT jsonb_build_object(
                  'sku', p.sku, 'nombre', p.nombre,
                  'descripcion', p.descripcion, 'foto_url', p.foto_url
                )) FILTER (WHERE p.id IS NOT NULL),
                '[]'
              ) AS productos
       FROM hallazgos h
       LEFT JOIN hallazgo_energias he ON he.hallazgo_id = h.id
       LEFT JOIN hallazgo_productos hp ON hp.hallazgo_id = h.id
       LEFT JOIN productos p ON p.id = hp.producto_id
       WHERE h.informe_id = $1
       GROUP BY h.id ORDER BY h.orden`,
      [id]
    );

    const { enviarInforme } = require('../services/mailService');
    const nombrePdf = await enviarInforme({
      informe:          inf[0],
      hallazgos,
      emailDestino:     email_destino,
      emailCC:          email_cc || null,
      mensajePersonal:  mensaje_personal || null,
    });

    // Marcar como enviado
    await pool.query(
      `UPDATE informes
       SET estado='enviado', actualizado_en=NOW()
       WHERE id=$1`,
      [id]
    );

    // Guardar log del envío
    await pool.query(
      `UPDATE informes
       SET notas_comerciales = COALESCE(notas_comerciales,'') ||
           E'\n[Enviado a ${email_destino} el ' || NOW()::date || ']'
       WHERE id=$1`,
      [id]
    );

    res.json({ ok: true, mensaje: `Informe enviado correctamente a ${email_destino}`, pdf: nombrePdf });
  } catch (err) {
    console.error('Error al enviar informe:', err);
    res.status(500).json({ ok: false, error: 'Error al generar o enviar el PDF. Verifica la configuración de correo.' });
  }
};