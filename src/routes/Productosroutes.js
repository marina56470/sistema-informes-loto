const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const pool     = require('../config/db');
const { requireAuth } = require('../middlewares/authMiddleware');

router.use(requireAuth);

const CATEGORIAS = [
  'Candados LOTO',
  'Bloqueo Eléctrico',
  'Bloqueo Mecánico',
  'Bloqueo Múltiple',
  'Organizadores',
  'Tarjetas',
  'Kits',
  'Servicios',
];
const ENERGIAS = ['Eléctrica','Mecánica','Neumática','Hidráulica','Térmica','Química','Múltiple'];

// ── GET /productos ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { q, cat, mostrar = 'activos' } = req.query;

  const conditions = [];
  const params = [];
  let p = 1;

  if (mostrar === 'inactivos') conditions.push('activo = FALSE');
  else if (mostrar === 'todos') {}
  else conditions.push('activo = TRUE');

  if (q) {
    conditions.push(`(nombre ILIKE $${p} OR sku ILIKE $${p} OR descripcion ILIKE $${p})`);
    params.push(`%${q}%`); p++;
  }
  if (cat) { conditions.push(`categoria = $${p}`); params.push(cat); p++; }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const { rows: productos } = await pool.query(
      `SELECT * FROM productos ${where} ORDER BY categoria, nombre`, params
    );
    const { rows: cats } = await pool.query(
      'SELECT DISTINCT categoria FROM productos ORDER BY categoria'
    );
    const { rows: counts } = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE activo=TRUE)  AS activos,
        COUNT(*) FILTER (WHERE activo=FALSE) AS inactivos,
        COUNT(*) AS total
       FROM productos`
    );

    res.render('productos/index', {
      title: 'Catálogo Yale',
      productos,
      categorias:  cats.map(c => c.categoria),
      CATEGORIAS,
      ENERGIAS,
      filtros: { q, cat, mostrar },
      counts: counts[0],
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al cargar catálogo.');
    res.redirect('/dashboard');
  }
});

// ── GET /productos/nuevo ──────────────────────────────────────────────────────
router.get('/nuevo', (req, res) => {
  res.render('productos/form', {
    title: 'Nuevo Producto',
    producto: null,
    CATEGORIAS,
    ENERGIAS,
    accion: '/productos',
  });
});

// ── POST /productos ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { sku, nombre, descripcion, categoria, energia } = req.body;

  if (!sku?.trim() || !nombre?.trim()) {
    req.flash('error', 'El SKU y el nombre son obligatorios.');
    return res.redirect('/productos/nuevo');
  }

  try {
    // Verificar SKU único
    const existe = await pool.query('SELECT id FROM productos WHERE sku = $1', [sku.trim()]);
    if (existe.rows[0]) {
      req.flash('error', `Ya existe un producto con el SKU ${sku.trim()}.`);
      return res.redirect('/productos/nuevo');
    }

    const { rows } = await pool.query(
      `INSERT INTO productos (sku, nombre, descripcion, categoria, energia, activo)
       VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id`,
      [sku.trim(), nombre.trim(), descripcion || null, categoria || null, energia || null]
    );

    // Subir foto si se adjuntó
    if (req.files?.foto) {
      const foto = req.files.foto;
      const ext  = path.extname(foto.name).toLowerCase();
      const archivo = `prod_${rows[0].id}_${Date.now()}${ext}`;
      await foto.mv(path.join(__dirname, '../uploads', archivo));
      await pool.query('UPDATE productos SET foto_url=$1 WHERE id=$2',
        [`/uploads/${archivo}`, rows[0].id]);
    }

    req.flash('success', `Producto "${nombre.trim()}" creado correctamente.`);
    res.redirect('/productos');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al crear el producto.');
    res.redirect('/productos/nuevo');
  }
});

// ── GET /productos/:id/editar ─────────────────────────────────────────────────
router.get('/:id/editar', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM productos WHERE id=$1', [req.params.id]);
    if (!rows[0]) {
      req.flash('error', 'Producto no encontrado.');
      return res.redirect('/productos');
    }
    res.render('productos/form', {
      title: 'Editar Producto',
      producto: rows[0],
      CATEGORIAS,
      ENERGIAS,
      accion: `/productos/${rows[0].id}`,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al cargar producto.');
    res.redirect('/productos');
  }
});

// ── POST /productos/:id ───────────────────────────────────────────────────────
router.post('/:id', async (req, res) => {
  const { sku, nombre, descripcion, categoria, energia, activo } = req.body;

  if (!sku?.trim() || !nombre?.trim()) {
    req.flash('error', 'El SKU y el nombre son obligatorios.');
    return res.redirect(`/productos/${req.params.id}/editar`);
  }

  try {
    // Verificar SKU único (excluyendo el actual)
    const existe = await pool.query(
      'SELECT id FROM productos WHERE sku=$1 AND id!=$2',
      [sku.trim(), req.params.id]
    );
    if (existe.rows[0]) {
      req.flash('error', `El SKU ${sku.trim()} ya lo usa otro producto.`);
      return res.redirect(`/productos/${req.params.id}/editar`);
    }

    await pool.query(
      `UPDATE productos
       SET sku=$1, nombre=$2, descripcion=$3, categoria=$4, energia=$5, activo=$6
       WHERE id=$7`,
      [sku.trim(), nombre.trim(), descripcion || null,
       categoria || null, energia || null,
       activo === 'on' || activo === 'true' || activo === '1',
       req.params.id]
    );

    // Nueva foto
    if (req.files?.foto) {
      // Borrar foto anterior
      const { rows: old } = await pool.query('SELECT foto_url FROM productos WHERE id=$1',[req.params.id]);
      if (old[0]?.foto_url) {
        const ruta = path.join(__dirname, '../uploads', path.basename(old[0].foto_url));
        if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
      }
      const foto = req.files.foto;
      const ext  = path.extname(foto.name).toLowerCase();
      const archivo = `prod_${req.params.id}_${Date.now()}${ext}`;
      await foto.mv(path.join(__dirname, '../uploads', archivo));
      await pool.query('UPDATE productos SET foto_url=$1 WHERE id=$2',
        [`/uploads/${archivo}`, req.params.id]);
    }

    req.flash('success', 'Producto actualizado correctamente.');
    res.redirect('/productos');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al actualizar producto.');
    res.redirect(`/productos/${req.params.id}/editar`);
  }
});

// ── POST /productos/:id/foto ──────────────────────────────────────────────────
router.post('/:id/foto', async (req, res) => {
  if (!req.files?.foto) {
    req.flash('error', 'No se envió ninguna imagen.');
    return res.redirect('/productos');
  }
  try {
    const { rows: old } = await pool.query('SELECT foto_url FROM productos WHERE id=$1',[req.params.id]);
    if (old[0]?.foto_url) {
      const ruta = path.join(__dirname, '../uploads', path.basename(old[0].foto_url));
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }
    const foto = req.files.foto;
    const ext  = path.extname(foto.name).toLowerCase();
    const archivo = `prod_${req.params.id}_${Date.now()}${ext}`;
    await foto.mv(path.join(__dirname, '../uploads', archivo));
    await pool.query('UPDATE productos SET foto_url=$1 WHERE id=$2',
      [`/uploads/${archivo}`, req.params.id]);
    req.flash('success', 'Foto actualizada.');
    res.redirect('/productos');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al subir foto.');
    res.redirect('/productos');
  }
});

// ── POST /productos/:id/foto/delete ──────────────────────────────────────────
router.post('/:id/foto/delete', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT foto_url FROM productos WHERE id=$1',[req.params.id]);
    if (rows[0]?.foto_url) {
      const ruta = path.join(__dirname, '../uploads', path.basename(rows[0].foto_url));
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }
    await pool.query('UPDATE productos SET foto_url=NULL WHERE id=$1',[req.params.id]);
    req.flash('success', 'Foto eliminada.');
    res.redirect('/productos');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al eliminar foto.');
    res.redirect('/productos');
  }
});

// ── POST /productos/:id/toggle ─────────────────────────────────────────────── 
// Activar / desactivar sin eliminar
router.post('/:id/toggle', async (req, res) => {
  try {
    await pool.query(
      'UPDATE productos SET activo = NOT activo WHERE id=$1', [req.params.id]
    );
    req.flash('success', 'Estado del producto actualizado.');
    res.redirect('/productos');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al cambiar estado.');
    res.redirect('/productos');
  }
});

// ── POST /productos/:id/delete ────────────────────────────────────────────────
router.post('/:id/delete', async (req, res) => {
  try {
    // Verificar que no esté en uso en ningún hallazgo
    const { rows: enUso } = await pool.query(
      'SELECT COUNT(*) FROM hallazgo_productos WHERE producto_id=$1', [req.params.id]
    );
    if (parseInt(enUso[0].count) > 0) {
      req.flash('error', 'No se puede eliminar: el producto está en uso en uno o más informes. Puedes desactivarlo en su lugar.');
      return res.redirect('/productos');
    }

    // Borrar foto del disco
    const { rows } = await pool.query('SELECT foto_url FROM productos WHERE id=$1',[req.params.id]);
    if (rows[0]?.foto_url) {
      const ruta = path.join(__dirname, '../uploads', path.basename(rows[0].foto_url));
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }

    await pool.query('DELETE FROM productos WHERE id=$1',[req.params.id]);
    req.flash('success', 'Producto eliminado.');
    res.redirect('/productos');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al eliminar producto.');
    res.redirect('/productos');
  }
});

module.exports = router;