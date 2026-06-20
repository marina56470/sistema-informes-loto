const pool = require('../config/db');

// ── GET /clientes ─────────────────────────────────────────────────────────────
exports.index = async (req, res) => {
  try {
    const { rows: clientes } = await pool.query(
      `SELECT c.*, u.nombre AS creado_por_nombre,
              COUNT(i.id) AS total_informes
       FROM clientes c
       LEFT JOIN usuarios u ON c.creado_por = u.id
       LEFT JOIN informes i ON i.cliente_id = c.id
       WHERE c.creado_por = $1
       GROUP BY c.id, u.nombre
       ORDER BY c.empresa ASC`,
      [req.user.id]
    );

    res.render('clientes/index', {
      title: 'Clientes',
      clientes,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al cargar clientes.');
    res.redirect('/dashboard');
  }
};

// ── GET /clientes/nuevo ───────────────────────────────────────────────────────
exports.getForm = (req, res) => {
  res.render('clientes/form', {
    title: 'Nuevo Cliente',
    cliente: null,
    accion: '/clientes',
  });
};

// ── POST /clientes ────────────────────────────────────────────────────────────
exports.crear = async (req, res) => {
  const { empresa, contacto, cargo_contacto, ciudad, nit, telefono, email } = req.body;

  if (!empresa?.trim()) {
    req.flash('error', 'El nombre de la empresa es obligatorio.');
    return res.redirect('/clientes/nuevo');
  }

  try {
    await pool.query(
      `INSERT INTO clientes (empresa, contacto, cargo_contacto, ciudad, nit, telefono, email, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [empresa.trim(), contacto || null, cargo_contacto || null,
       ciudad || null, nit || null, telefono || null,
       email?.toLowerCase() || null, req.user.id]
    );
    req.flash('success', `Cliente "${empresa}" creado correctamente.`);
    res.redirect('/clientes');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al crear cliente.');
    res.redirect('/clientes/nuevo');
  }
};

// ── GET /clientes/:id/editar ──────────────────────────────────────────────────
exports.getEditar = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM clientes WHERE id = $1 AND creado_por = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) {
      req.flash('error', 'Cliente no encontrado.');
      return res.redirect('/clientes');
    }
    res.render('clientes/form', {
      title: 'Editar Cliente',
      cliente: rows[0],
      accion: `/clientes/${rows[0].id}?_method=PUT`,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al cargar cliente.');
    res.redirect('/clientes');
  }
};

// ── PUT /clientes/:id ─────────────────────────────────────────────────────────
exports.actualizar = async (req, res) => {
  const { empresa, contacto, cargo_contacto, ciudad, nit, telefono, email } = req.body;
  try {
    const result = await pool.query(
      `UPDATE clientes
       SET empresa=$1, contacto=$2, cargo_contacto=$3, ciudad=$4,
           nit=$5, telefono=$6, email=$7
       WHERE id=$8 AND creado_por=$9`,
      [empresa.trim(), contacto || null, cargo_contacto || null,
       ciudad || null, nit || null, telefono || null,
       email?.toLowerCase() || null, req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      req.flash('error', 'Cliente no encontrado.');
      return res.redirect('/clientes');
    }
    req.flash('success', 'Cliente actualizado.');
    res.redirect('/clientes');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al actualizar.');
    res.redirect(`/clientes/${req.params.id}/editar`);
  }
};

// ── DELETE /clientes/:id ──────────────────────────────────────────────────────
exports.eliminar = async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM clientes WHERE id = $1 AND creado_por = $2',
      [req.params.id, req.user.id]
    );
    req.flash('success', 'Cliente eliminado.');
    res.redirect('/clientes');
  } catch (err) {
    console.error(err);
    req.flash('error', 'No se pudo eliminar (puede tener informes asociados).');
    res.redirect('/clientes');
  }
};

// ── GET /clientes/buscar?q= (para select dinámico en informes) ────────────────
exports.buscar = async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  try {
    const { rows } = await pool.query(
      `SELECT id, empresa, ciudad, contacto FROM clientes
       WHERE creado_por = $1 AND empresa ILIKE $2
       ORDER BY empresa LIMIT 10`,
      [req.user.id, q]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en búsqueda' });
  }
};