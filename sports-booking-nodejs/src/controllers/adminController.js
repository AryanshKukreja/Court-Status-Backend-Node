const TimeSlot = require('../models/TimeSlot');
const Booking = require('../models/Booking');

// Get all time slots
const getAllTimeSlots = async (req, res) => {
  try {
    const timeSlots = await TimeSlot.find().sort({ hour: 1 });
    console.log(`Retrieved ${timeSlots.length} time slots`);
    
    res.json({
      success: true,
      count: timeSlots.length,
      data: timeSlots
    });
  } catch (error) {
    console.error('Error fetching time slots:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create a new time slot
const createTimeSlot = async (req, res) => {
  try {
    const { hour } = req.body;

    // Validate hour range
    if (hour === undefined || hour === null || hour < 0 || hour > 23) {
      return res.status(400).json({
        error: 'Hour must be between 0 and 23'
      });
    }

    // Check if time slot already exists
    const existingSlot = await TimeSlot.findOne({ hour });
    if (existingSlot) {
      return res.status(400).json({
        error: `Time slot already exists for hour ${hour}`
      });
    }

    const timeSlot = await TimeSlot.create({ hour });
    console.log(`Created time slot for hour ${hour}:`, timeSlot);
    
    res.status(201).json({
      success: true,
      message: 'Time slot created successfully',
      data: timeSlot
    });
  } catch (error) {
    console.error('Error creating time slot:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update an existing time slot
const updateTimeSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const { hour } = req.body;

    // Validate hour range
    if (hour === undefined || hour === null || hour < 0 || hour > 23) {
      return res.status(400).json({
        error: 'Hour must be between 0 and 23'
      });
    }

    // Check if another time slot already exists with this hour
    const existingSlot = await TimeSlot.findOne({ hour, _id: { $ne: id } });
    if (existingSlot) {
      return res.status(400).json({
        error: `Another time slot already exists for hour ${hour}`
      });
    }

    const timeSlot = await TimeSlot.findByIdAndUpdate(
      id,
      { hour },
      { new: true, runValidators: true }
    );

    if (!timeSlot) {
      return res.status(404).json({
        error: 'Time slot not found'
      });
    }

    console.log(`Updated time slot ${id} to hour ${hour}:`, timeSlot);

    res.json({
      success: true,
      message: 'Time slot updated successfully',
      data: timeSlot
    });
  } catch (error) {
    console.error('Error updating time slot:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        error: 'Time slot already exists for this hour'
      });
    }
    res.status(500).json({ error: error.message });
  }
};

// Delete a time slot
const deleteTimeSlot = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if there are any bookings for this time slot
    const bookingCount = await Booking.countDocuments({ time_slot: id });
    if (bookingCount > 0) {
      return res.status(400).json({
        error: `Cannot delete time slot. ${bookingCount} booking(s) exist for this slot.`
      });
    }

    const timeSlot = await TimeSlot.findByIdAndDelete(id);
    
    if (!timeSlot) {
      return res.status(404).json({
        error: 'Time slot not found'
      });
    }

    console.log(`Deleted time slot ${id}:`, timeSlot);

    res.json({
      success: true,
      message: 'Time slot deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting time slot:', error);
    res.status(500).json({ error: error.message });
  }
};

// Bulk create time slots
const bulkCreateTimeSlots = async (req, res) => {
  try {
    const { startHour, endHour } = req.body;

    if (startHour === undefined || endHour === undefined || startHour >= endHour) {
      return res.status(400).json({
        error: 'Please provide valid startHour and endHour (startHour < endHour)'
      });
    }

    if (startHour < 0 || endHour > 23) {
      return res.status(400).json({
        error: 'Hours must be between 0 and 23'
      });
    }

    const slots = [];
    for (let hour = startHour; hour <= endHour; hour++) {
      slots.push({ hour });
    }

    console.log(`Attempting to create ${slots.length} time slots from ${startHour} to ${endHour}`);

    try {
      const createdSlots = await TimeSlot.insertMany(slots, { ordered: false });
      console.log(`Successfully created ${createdSlots.length} time slots`);
      
      res.status(201).json({
        success: true,
        message: `${createdSlots.length} time slots created successfully`,
        data: createdSlots
      });
    } catch (bulkError) {
      if (bulkError.code === 11000) {
        // Handle duplicate key errors gracefully
        const insertedDocs = bulkError.insertedDocs || [];
        const duplicateCount = slots.length - insertedDocs.length;
        
        console.log(`Bulk insert completed: ${insertedDocs.length} created, ${duplicateCount} duplicates skipped`);
        
        return res.status(207).json({
          success: true,
          message: `${insertedDocs.length} time slots created, ${duplicateCount} duplicates skipped`,
          data: insertedDocs
        });
      }
      throw bulkError;
    }
  } catch (error) {
    console.error('Error in bulk create time slots:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllTimeSlots,
  createTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  bulkCreateTimeSlots
};
