const Booking = require('../models/Booking');
const Court = require('../models/Court');
const TimeSlot = require('../models/TimeSlot');
const Sport = require('../models/Sport');
const moment = require('moment');

const getCourtStatus = async (req, res) => {
  try {
    const { sport, date } = req.query;
    
    // Normalize the date to start of day
    const bookingDate = Booking.normalizeDate(date ? new Date(date) : new Date());

    console.log(`Fetching court status for sport: ${sport}, normalized date: ${bookingDate}`);

    // Get sport or default to first available
    let sportId = sport;
    if (!sportId) {
      const firstSport = await Sport.findOne();
      if (!firstSport) {
        return res.status(404).json({ error: 'No sports available' });
      }
      sportId = firstSport._id;
    }

    // Ensure time slots exist
    const timeSlotCount = await TimeSlot.countDocuments();
    if (timeSlotCount === 0) {
      console.log('No time slots found, please create time slots first');
      return res.status(400).json({ 
        error: 'No time slots available. Please create time slots first.' 
      });
    }

    // Get all required data
    const [sports, timeSlots, courts, bookings] = await Promise.all([
      Sport.find().sort({ name: 1 }),
      TimeSlot.find().sort({ hour: 1 }),
      Court.find({ sport: sportId }),
      Booking.find({
        date: bookingDate
      }).populate(['court', 'time_slot', 'user'])
    ]);

    console.log(`Found: ${sports.length} sports, ${timeSlots.length} time slots, ${courts.length} courts, ${bookings.length} bookings for date ${bookingDate}`);

    // Check if courts exist for this sport
    if (courts.length === 0) {
      return res.status(400).json({ 
        error: `No courts found for sport ${sportId}. Please create courts for this sport.` 
      });
    }

    // Filter bookings for selected sport
    const sportBookings = bookings.filter(booking => 
      booking.court && courts.some(court => court._id.toString() === booking.court._id.toString())
    );

    console.log(`Filtered to ${sportBookings.length} bookings for sport ${sportId}`);
    
    // Debug: Log each booking
    sportBookings.forEach(booking => {
      console.log(`Booking: Court ${booking.court._id}, Slot ${booking.time_slot._id}, Status: ${booking.status}, Booking By: ${booking.booking_by || 'N/A'}`);
    });

    // Build court data structure with ALL SLOTS DEFAULTING TO AVAILABLE
    const courtData = courts.map(court => {
      const courtInfo = {
        id: court._id.toString(),
        name: court.name,
        slots: {}
      };

      // Create slot structure for each time slot - DEFAULT TO AVAILABLE
      timeSlots.forEach((slot, index) => {
        const slotId = (index + 1).toString();
        courtInfo.slots[slotId] = {
          id: slotId,
          time: slot.formatted_slot,
          status: 'available', // DEFAULT STATUS
          booking_by: null
        };
      });

      // Update with actual booking statuses ONLY if booking exists
      sportBookings.forEach(booking => {
        if (booking.court._id.toString() === court._id.toString()) {
          const slotIndex = timeSlots.findIndex(slot => 
            slot._id.toString() === booking.time_slot._id.toString()
          );
          if (slotIndex !== -1) {
            const slotId = (slotIndex + 1).toString();
            if (courtInfo.slots[slotId]) {
              console.log(`Setting court ${court.name} slot ${slotId} to ${booking.status}`);
              courtInfo.slots[slotId].status = booking.status;
              courtInfo.slots[slotId].booking_by = booking.booking_by || null;
            }
          }
        }
      });

      return courtInfo;
    });

    // Build time slots data
    const timeSlotsData = timeSlots.map((slot, index) => ({
      id: index + 1,
      formatted_slot: slot.formatted_slot
    }));

    const responseData = {
      date: bookingDate.toISOString().split('T')[0],
      currentTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      sports: sports.map(s => ({ id: s._id, name: s.name })),
      selectedSport: sportId,
      timeSlots: timeSlotsData,
      courts: courtData
    };

    console.log(`Returning court status with ${courtData.length} courts`);
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching court status:', error);
    res.status(500).json({ error: error.message });
  }
};

const updateBooking = async (req, res) => {
  try {
    const { courtId, timeSlotId, status, date, booking_by } = req.body;
    
    // Normalize the date to start of day to ensure consistency
    const bookingDate = Booking.normalizeDate(date ? new Date(date) : new Date());

    console.log('=== UPDATE BOOKING DEBUG ===');
    console.log(`Request: court=${courtId}, slot=${timeSlotId}, status=${status}, booking_by=${booking_by}`);
    console.log(`Original date: ${date}, Normalized date: ${bookingDate}`);
    console.log(`User: ${req.user ? req.user.username : 'Not found'}`);

    // Validation
    if (!courtId || !timeSlotId || !status) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: courtId, timeSlotId, status'
      });
    }

    // Validate booking_by field when status is 'booked'
    if (status === 'booked' && (!booking_by || booking_by.trim() === '')) {
      console.log('❌ Missing booking_by field for booked status');
      return res.status(400).json({
        success: false,
        error: 'booking_by field is required when status is booked'
      });
    }

    if (!req.user || !req.user._id) {
      console.log('❌ User not authenticated');
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    // Updated valid statuses (changed from 'maintenance' to 'closed')
    const validStatuses = ['available', 'booked', 'closed'];
    if (!validStatuses.includes(status)) {
      console.log('❌ Invalid status:', status);
      return res.status(400).json({
        success: false,
        error: `Invalid status. Valid options: ${validStatuses.join(', ')}`
      });
    }

    // Convert frontend slot ID to actual time slot
    const timeSlots = await TimeSlot.find().sort({ hour: 1 });
    const frontendSlotId = parseInt(timeSlotId);
    
    if (frontendSlotId < 1 || frontendSlotId > timeSlots.length) {
      console.log('❌ Invalid slot ID:', frontendSlotId);
      return res.status(400).json({ 
        success: false,
        error: 'Invalid time slot ID' 
      });
    }
    
    const timeSlot = timeSlots[frontendSlotId - 1];
    console.log(`✅ Time slot found: ${timeSlot.formatted_slot} (ID: ${timeSlot._id})`);

    // Verify court exists
    const court = await Court.findById(courtId);
    if (!court) {
      console.log('❌ Court not found:', courtId);
      return res.status(400).json({ 
        success: false,
        error: 'Court not found' 
      });
    }
    console.log(`✅ Court found: ${court.name}`);

    // Find existing booking with exact date match
    const existingBooking = await Booking.findOne({
      court: courtId,
      time_slot: timeSlot._id,
      date: bookingDate
    });

    console.log(`Existing booking: ${existingBooking ? 'Found' : 'Not found'}`);
    if (existingBooking) {
      console.log(`Existing booking details: Status=${existingBooking.status}, Date=${existingBooking.date}`);
    }

    let result;
    let action;

    if (status === 'available') {
      if (existingBooking) {
        console.log('🗑️ Deleting existing booking to make available');
        result = await Booking.deleteOne({
          _id: existingBooking._id
        });
        console.log(`Delete result: ${result.deletedCount} document(s) deleted`);
        action = result.deletedCount > 0 ? 'deleted' : 'delete_failed';
      } else {
        console.log('ℹ️ Slot already available (no booking exists)');
        action = 'already_available';
      }
    } else {
      const bookingData = {
        court: courtId,
        time_slot: timeSlot._id,
        date: bookingDate,
        status: status,
        user: req.user._id
      };

      // Add booking_by field if status is 'booked'
      if (status === 'booked') {
        bookingData.booking_by = booking_by.trim();
      }

      if (existingBooking) {
        console.log('📝 Updating existing booking');
        Object.assign(existingBooking, bookingData);
        result = await existingBooking.save();
        console.log(`Update successful: ${result._id}, Status: ${result.status}`);
        action = 'updated';
      } else {
        console.log('➕ Creating new booking');
        result = await Booking.create(bookingData);
        console.log(`Create successful: ${result._id}, Status: ${result.status}`);
        action = 'created';
      }
    }

    // Verify the change was persisted
    const verificationBooking = await Booking.findOne({
      court: courtId,
      time_slot: timeSlot._id,
      date: bookingDate
    });

    console.log(`Verification: ${verificationBooking ? `Found with status ${verificationBooking.status}` : 'Not found (available)'}`);
    console.log('=== END DEBUG ===');

    const responseBooking = {
      court: court.name,
      time_slot: timeSlot.formatted_slot,
      date: bookingDate.toISOString().split('T')[0],
      status: status,
      user: req.user.username,
      booking_by: status === 'booked' ? booking_by : null,
      action: action
    };

    return res.json({ 
      success: true, 
      message: `Court ${court.name} slot ${timeSlot.formatted_slot} ${action} - status: ${status}`,
      booking: responseBooking 
    });

  } catch (error) {
    console.error('❌ Error updating booking:', error);
    console.error('Error stack:', error.stack);
    
    // Check if it's a duplicate key error
    if (error.code === 11000) {
      console.log('Duplicate key error - booking already exists');
      return res.status(400).json({ 
        success: false,
        error: 'Booking already exists for this court, time slot, and date' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: `Failed to update booking: ${error.message}` 
    });
  }
};

// Add a test endpoint to verify database operations
const testDatabaseOperations = async (req, res) => {
  try {
    console.log('=== DATABASE TEST ===');
    
    // Get a sample court and time slot
    const court = await Court.findOne();
    const timeSlot = await TimeSlot.findOne();
    
    if (!court || !timeSlot) {
      return res.status(400).json({ 
        success: false, 
        error: 'Need at least one court and one time slot for testing' 
      });
    }
    
    const testDate = Booking.normalizeDate(new Date());
    console.log(`Testing with Court: ${court.name}, TimeSlot: ${timeSlot.formatted_slot}, Date: ${testDate}`);
    
    // Test 1: Create a booking (using 'closed' instead of 'maintenance')
    console.log('Test 1: Creating booking...');
    const testBooking = await Booking.create({
      court: court._id,
      time_slot: timeSlot._id,
      date: testDate,
      status: 'closed',
      user: req.user._id
    });
    console.log(`✅ Booking created: ${testBooking._id}`);
    
    // Test 2: Find the booking
    console.log('Test 2: Finding booking...');
    const foundBooking = await Booking.findOne({
      court: court._id,
      time_slot: timeSlot._id,
      date: testDate
    });
    console.log(`✅ Booking found: ${foundBooking ? foundBooking._id : 'Not found'}`);
    
    // Test 3: Update the booking
    console.log('Test 3: Updating booking...');
    foundBooking.status = 'booked';
    foundBooking.booking_by = 'Test User';
    await foundBooking.save();
    console.log(`✅ Booking updated to: ${foundBooking.status}`);
    
    // Test 4: Delete the booking
    console.log('Test 4: Deleting booking...');
    const deleteResult = await Booking.deleteOne({ _id: foundBooking._id });
    console.log(`✅ Booking deleted: ${deleteResult.deletedCount} document(s)`);
    
    // Test 5: Verify deletion
    console.log('Test 5: Verifying deletion...');
    const deletedBooking = await Booking.findById(foundBooking._id);
    console.log(`✅ Verification: ${deletedBooking ? 'Still exists (ERROR)' : 'Successfully deleted'}`);
    
    console.log('=== TEST COMPLETE ===');
    
    res.json({ 
      success: true, 
      message: 'All database tests passed',
      testResults: {
        created: !!testBooking,
        found: !!foundBooking,
        updated: foundBooking.status === 'booked',
        deleted: deleteResult.deletedCount === 1,
        verified: !deletedBooking
      }
    });
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: `Database test failed: ${error.message}` 
    });
  }
};

module.exports = {
  getCourtStatus,
  updateBooking,
  testDatabaseOperations
};
