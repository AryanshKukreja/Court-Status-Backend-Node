const express = require('express');
const { 
  getAllSports, 
  getAllSportsWithCourts,
  getSportWithCourts,
  createSport, 
  updateCourtCount,
  deleteSport
} = require('../controllers/sportController');
const { protect, admin } = require('../middleware/auth');

const router = express.Router();

router.get('/', getAllSports);
router.get('/with-courts', getAllSportsWithCourts);
router.get('/:id/courts', protect, admin, getSportWithCourts);
router.post('/create', protect, admin, createSport);
router.put('/:id/courts', protect, admin, updateCourtCount);
router.delete('/:id', protect, admin, deleteSport);

module.exports = router;
