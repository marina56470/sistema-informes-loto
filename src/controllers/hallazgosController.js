const pool = require('../config/db');
const path = require('path');
const fs   = require('fs');

// ── POST /informes/:informeId/hallazgos ────────────────────────────────────────
exports.crear = async (req, res) => {
  const { informeId } = req.params;
  const userId = req.user.id;
  const { proceso, area, descripcion, recomendaciones, energias, productos } = req.body;

  // Validar que el informe pertenece al usuario
  try {
    const { rows: inf } = await pool.query(
      'SELECT id FROM informes WHERE id=$1 AND usuario_id=$2',
      [informeId, userId]
    );
    if (!inf[0]) {
      req.flash('error', 'No tienes permiso sobre este informe.');
      return res.redirect('/informes');
    }

    // Máximo orden actual
    const { rows: ordenRow } = await pool.query(
      'SELECT COALESCE(MAX(orden),0)+1 AS siguiente FROM hallazgos WHERE informe_id=$1',
      [informeId]
    );
    const orden = ordenRow[0].siguiente;

    // Manejo de foto
    let fotoPath = null;
    if (req.files?.foto) {
      const foto = req.files.foto;
      const ext  = path.extname(foto.name).toLowerCase();
      const nombreArchivo = `h_${Date.now()}${ext}`;
      const destino = path.join(__dirname, '../uploads', nombreArchivo);
      await foto.mv(destino);
      fotoPath = `/uploads/${nombreArchivo}`;
    }

    // Insertar hallazgo
    const { rows: hall } = await pool.query(
      `INSERT INTO hallazgos (informe_id, orden, proceso, area, descripcion, recomendaciones, foto_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [informeId, orden, proceso || null, area, descripcion,
       recomendaciones || null, fotoPath]
    );
    const hallazgoId = hall[0].id;

    // Insertar energías (puede venir como string o array)
    const energiasArr = Array.isArray(energias)
      ? energias
      : energias ? [energias] : [];

    for (const tipo of energiasArr) {
      await pool.query(
        'INSERT INTO hallazgo_energias (hallazgo_id, tipo_energia) VALUES ($1,$2)',
        [hallazgoId, tipo]
      );
    }

    // Insertar productos (SKU → buscar ID)
    const productosArr = Array.isArray(productos)
      ? productos
      : productos ? [productos] : [];

    for (const productoId of productosArr) {
      await pool.query(
        'INSERT INTO hallazgo_productos (hallazgo_id, producto_id) VALUES ($1,$2)',
        [hallazgoId, parseInt(productoId)]
      );
    }

    // Actualizar timestamp del informe
    await pool.query('UPDATE informes SET actualizado_en=NOW() WHERE id=$1', [informeId]);

    req.flash('success', 'Punto de bloqueo agregado.');
    res.redirect(`/informes/${informeId}/editar`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al agregar el punto de bloqueo.');
    res.redirect(`/informes/${informeId}/editar`);
  }
};

// ── GET /informes/:informeId/hallazgos/:id/editar ─────────────────────────────
exports.getEditar = async (req, res) => {
  const { informeId, id } = req.params;
  const userId = req.user.id;

  try {
    // Verificar pertenencia
    const { rows: inf } = await pool.query(
      'SELECT id FROM informes WHERE id=$1 AND usuario_id=$2',
      [informeId, userId]
    );
    if (!inf[0]) return res.redirect('/informes');

    const { rows: hall } = await pool.query(
      `SELECT h.*,
              COALESCE(json_agg(DISTINCT he.tipo_energia) FILTER (WHERE he.id IS NOT NULL),'[]') AS energias,
              COALESCE(json_agg(DISTINCT hp.producto_id)  FILTER (WHERE hp.id IS NOT NULL),'[]') AS producto_ids
       FROM hallazgos h
       LEFT JOIN hallazgo_energias he ON he.hallazgo_id=h.id
       LEFT JOIN hallazgo_productos hp ON hp.hallazgo_id=h.id
       WHERE h.id=$1 AND h.informe_id=$2
       GROUP BY h.id`,
      [id, informeId]
    );
    if (!hall[0]) {
      req.flash('error', 'Hallazgo no encontrado.');
      return res.redirect(`/informes/${informeId}/editar`);
    }

    const { rows: productos } = await pool.query(
      'SELECT * FROM productos WHERE activo=TRUE ORDER BY categoria, nombre'
    );

    res.render('informes/editar', {
      title: 'Editar Punto de Bloqueo',
      hallazgo: hall[0],
      productos,
      informeId,
      modoHallazgo: true,
    });
  } catch (err) {
    console.error(err);
    res.redirect(`/informes/${informeId}/editar`);
  }
};

// ── PUT /informes/:informeId/hallazgos/:id ─────────────────────────────────────
exports.actualizar = async (req, res) => {
  const { informeId, id } = req.params;
  const userId = req.user.id;
  const { proceso, area, descripcion, recomendaciones, energias, productos } = req.body;

  try {
    // Verificar pertenencia
    const { rows: inf } = await pool.query(
      'SELECT id FROM informes WHERE id=$1 AND usuario_id=$2',
      [informeId, userId]
    );
    if (!inf[0]) return res.redirect('/informes');

    // ¿Hay nueva foto?
    let fotoPath = null;
    if (req.files?.foto) {
      // Borrar foto anterior
      const { rows: old } = await pool.query('SELECT foto_path FROM hallazgos WHERE id=$1',[id]);
      if (old[0]?.foto_path) {
        const rutaVieja = path.join(__dirname, '../uploads', path.basename(old[0].foto_path));
        if (fs.existsSync(rutaVieja)) fs.unlinkSync(rutaVieja);
      }
      const foto = req.files.foto;
      const ext  = path.extname(foto.name).toLowerCase();
      const nombreArchivo = `h_${Date.now()}${ext}`;
      await foto.mv(path.join(__dirname, '../uploads', nombreArchivo));
      fotoPath = `/uploads/${nombreArchivo}`;
    }

    const updateFoto = fotoPath
      ? ', foto_path=$6'
      : '';
    const params = [proceso || null, area, descripcion, recomendaciones || null, id];
    if (fotoPath) params.push(fotoPath);

    await pool.query(
      `UPDATE hallazgos SET proceso=$1, area=$2, descripcion=$3, recomendaciones=$4${updateFoto}
       WHERE id=$5`,
      params
    );

    // Re-insertar energías
    await pool.query('DELETE FROM hallazgo_energias WHERE hallazgo_id=$1',[id]);
    const energiasArr = Array.isArray(energias) ? energias : energias ? [energias] : [];
    for (const tipo of energiasArr) {
      await pool.query(
        'INSERT INTO hallazgo_energias (hallazgo_id, tipo_energia) VALUES ($1,$2)',
        [id, tipo]
      );
    }

    // Re-insertar productos
    await pool.query('DELETE FROM hallazgo_productos WHERE hallazgo_id=$1',[id]);
    const productosArr = Array.isArray(productos) ? productos : productos ? [productos] : [];
    for (const pId of productosArr) {
      await pool.query(
        'INSERT INTO hallazgo_productos (hallazgo_id, producto_id) VALUES ($1,$2)',
        [id, parseInt(pId)]
      );
    }

    await pool.query('UPDATE informes SET actualizado_en=NOW() WHERE id=$1',[informeId]);

    req.flash('success', 'Punto de bloqueo actualizado.');
    res.redirect(`/informes/${informeId}/editar`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al actualizar.');
    res.redirect(`/informes/${informeId}/editar`);
  }
};

// ── DELETE /informes/:informeId/hallazgos/:id ──────────────────────────────────
exports.eliminar = async (req, res) => {
  const { informeId, id } = req.params;
  const userId = req.user.id;

  try {
    const { rows: inf } = await pool.query(
      'SELECT id FROM informes WHERE id=$1 AND usuario_id=$2',
      [informeId, userId]
    );
    if (!inf[0]) return res.redirect('/informes');

    // Borrar foto del disco
    const { rows: hall } = await pool.query('SELECT foto_path FROM hallazgos WHERE id=$1',[id]);
    if (hall[0]?.foto_path) {
      const ruta = path.join(__dirname, '../uploads', path.basename(hall[0].foto_path));
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }

    await pool.query('DELETE FROM hallazgos WHERE id=$1 AND informe_id=$2',[id, informeId]);
    await pool.query('UPDATE informes SET actualizado_en=NOW() WHERE id=$1',[informeId]);

    req.flash('success', 'Punto eliminado.');
    res.redirect(`/informes/${informeId}/editar`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al eliminar.');
    res.redirect(`/informes/${informeId}/editar`);
  }
};

// ── POST /informes/:informeId/hallazgos/reordenar ─────────────────────────────
// Body: { orden: [id1, id2, id3, ...] }
exports.reordenar = async (req, res) => {
  const { informeId } = req.params;
  const { orden } = req.body; // array de IDs en el nuevo orden

  try {
    const { rows: inf } = await pool.query(
      'SELECT id FROM informes WHERE id=$1 AND usuario_id=$2',
      [informeId, req.user.id]
    );
    if (!inf[0]) return res.status(403).json({ error: 'Sin permiso' });

    for (let i = 0; i < orden.length; i++) {
      await pool.query(
        'UPDATE hallazgos SET orden=$1 WHERE id=$2 AND informe_id=$3',
        [i + 1, orden[i], informeId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al reordenar' });
  }
};