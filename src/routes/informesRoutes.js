const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/informesController');
const hCtrl   = require('../controllers/hallazgosController');
const { requireAuth } = require('../middlewares/authMiddleware');

// Todas las rutas requieren auth
router.use(requireAuth);

// ── Informes ──────────────────────────────────────────────────────────────────
router.get('/',          ctrl.index);
router.get('/nuevo',     ctrl.getNuevo);
router.post('/',         ctrl.crear);
router.get('/:id/editar',  ctrl.getEditar);
router.post('/:id',        ctrl.actualizar);          // POST con _method=PUT
router.post('/:id/delete', ctrl.eliminar);            // POST con _method=DELETE
router.get('/:id/preview', ctrl.preview);
router.post('/:id/finalizar', ctrl.finalizar);
router.post('/:id/enviar',    ctrl.enviar);

// ── Hallazgos (anidados bajo informes) ───────────────────────────────────────
router.post('/:informeId/hallazgos',              hCtrl.crear);
router.get ('/:informeId/hallazgos/:id/editar',   hCtrl.getEditar);
router.post('/:informeId/hallazgos/:id',          hCtrl.actualizar);
router.post('/:informeId/hallazgos/:id/delete',   hCtrl.eliminar);
router.post('/:informeId/hallazgos/reordenar',    hCtrl.reordenar);

module.exports = router;