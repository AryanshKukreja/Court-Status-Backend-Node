const express = require('express');
const { protect, admin } = require('../middleware/auth');
const {
  getAllTimeSlots,
  createTimeSlot,
  updateTimeSlot, // Add this import
  deleteTimeSlot,
  bulkCreateTimeSlots
} = require('../controllers/adminController');

const router = express.Router();

// All admin routes require authentication and admin privileges
router.use(protect, admin);

// Time slot management routes
router.get('/timeslots', getAllTimeSlots);
router.post('/timeslots', createTimeSlot);
router.put('/timeslots/:id', updateTimeSlot); // Add this route
router.delete('/timeslots/:id', deleteTimeSlot);
router.post('/timeslots/bulk', bulkCreateTimeSlots);

module.exports = router;
