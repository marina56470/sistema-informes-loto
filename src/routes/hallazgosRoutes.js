// Este archivo existe para posibles extensiones futuras.
// Los hallazgos ya están montados en informesRoutes como rutas anidadas:
//   POST   /informes/:informeId/hallazgos
//   PUT    /informes/:informeId/hallazgos/:id
//   DELETE /informes/:informeId/hallazgos/:id/delete
//
// Si necesitas un endpoint independiente (ej: API JSON), agrégalo aquí.

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');

router.use(requireAuth);

// Placeholder — extensible para API REST pura
router.get('/', (req, res) => {
  res.json({ mensaje: 'Usa /informes/:id/hallazgos para gestionar hallazgos.' });
});

module.exports = router;