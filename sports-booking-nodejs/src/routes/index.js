const express = require('express');
const authRoutes = require('./authRoutes');
const sportRoutes = require('./sportRoutes');
const bookingRoutes = require('./bookingRoutes');
const adminRoutes = require('./adminRoutes'); // Add this line

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/sports', sportRoutes);
router.use('/bookings', bookingRoutes);
router.use('/admin', adminRoutes); // Add this line

module.exports = router;
