const express = require('express');
const { getCourtStatus, updateBooking } = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/court-status', getCourtStatus);
router.post('/update', protect, updateBooking);

module.exports = router;
