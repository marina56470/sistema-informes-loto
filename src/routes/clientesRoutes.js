const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/clientesController');
const { requireAuth } = require('../middlewares/authMiddleware');

router.use(requireAuth);

router.get('/',              ctrl.index);
router.get('/nuevo',         ctrl.getForm);
router.post('/',             ctrl.crear);
router.get('/buscar',        ctrl.buscar);           // API para select dinámico
router.get('/:id/editar',    ctrl.getEditar);
router.post('/:id',          ctrl.actualizar);
router.post('/:id/delete',   ctrl.eliminar);

module.exports = router;