const Booking = require('../models/Booking');
const Court = require('../models/Court');
const TimeSlot = require('../models/TimeSlot');
const Sport = require('../models/Sport');
const s3Service = require('../services/s3Service');
const moment = require('moment');


// Get all time slots
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
          booking_by: null,
          approval_photo_key: null,
          approval_photo_url: null
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
              courtInfo.slots[slotId].approval_photo_key = booking.approval_photo_key || null;
              courtInfo.slots[slotId].approval_photo_url = booking.approval_photo_url || null;
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


// Single booking update with S3
const updateBooking = async (req, res) => {
  try {
    const { courtId, timeSlotId, status, date, booking_by } = req.body;
    
    // Normalize the date to start of day to ensure consistency
    const bookingDate = Booking.normalizeDate(date ? new Date(date) : new Date());


    console.log('=== UPDATE BOOKING DEBUG ===');
    console.log(`Request: court=${courtId}, slot=${timeSlotId}, status=${status}, booking_by=${booking_by}`);
    console.log(`Original date: ${date}, Normalized date: ${bookingDate}`);
    console.log(`User: ${req.user ? req.user.username : 'Not found'}`);
    console.log(`Uploaded file: ${req.file ? req.file.key : 'None'}`);


    // Validation
    if (!courtId || !timeSlotId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: courtId, timeSlotId, status'
      });
    }


    // Validate booking_by field and approval photo when status is 'booked'
    if (status === 'booked') {
      if (!booking_by || booking_by.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'booking_by field is required when status is booked'
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Approval photo is required when booking a slot'
        });
      }
    }


    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }


    // Valid statuses
    const validStatuses = ['available', 'booked', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Valid options: ${validStatuses.join(', ')}`
      });
    }


    // Convert frontend slot ID to actual time slot
    const timeSlots = await TimeSlot.find().sort({ hour: 1 });
    const frontendSlotId = parseInt(timeSlotId);
    
    if (frontendSlotId < 1 || frontendSlotId > timeSlots.length) {
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


    let result;
    let action;


    if (status === 'available') {
      if (existingBooking) {
        // Delete the approval photo from S3 if it exists
        if (existingBooking.approval_photo_key) {
          try {
            await s3Service.deleteFile(existingBooking.approval_photo_key);
            console.log(`🗑️ Deleted approval photo from S3: ${existingBooking.approval_photo_key}`);
          } catch (s3Error) {
            console.error('Error deleting file from S3:', s3Error);
          }
        }
        
        result = await Booking.deleteOne({ _id: existingBooking._id });
        action = result.deletedCount > 0 ? 'deleted' : 'delete_failed';
      } else {
        action = 'already_available';
      }
      
      // Delete uploaded file from S3 if status is available (cleanup)
      if (req.file) {
        try {
          await s3Service.deleteFile(req.file.key);
          console.log('🗑️ Cleaned up uploaded file from S3 as status is available');
        } catch (s3Error) {
          console.error('Error cleaning up uploaded file from S3:', s3Error);
        }
      }
    } else {
      const bookingData = {
        court: courtId,
        time_slot: timeSlot._id,
        date: bookingDate,
        status: status,
        user: req.user._id
      };


      // Add booking_by field and S3 photo info if status is 'booked'
      if (status === 'booked') {
        bookingData.booking_by = booking_by.trim();
        bookingData.approval_photo_key = req.file.key;
        bookingData.approval_photo_url = req.file.location;
        bookingData.approval_photo_filename = req.file.originalname;
      }


      if (existingBooking) {
        // Delete old approval photo from S3 if updating
        if (existingBooking.approval_photo_key && req.file) {
          try {
            await s3Service.deleteFile(existingBooking.approval_photo_key);
            console.log(`🗑️ Deleted old approval photo from S3: ${existingBooking.approval_photo_key}`);
          } catch (s3Error) {
            console.error('Error deleting old file from S3:', s3Error);
          }
        }
        
        Object.assign(existingBooking, bookingData);
        result = await existingBooking.save();
        action = 'updated';
      } else {
        result = await Booking.create(bookingData);
        action = 'created';
      }
    }


    const responseBooking = {
      court: court.name,
      time_slot: timeSlot.formatted_slot,
      date: bookingDate.toISOString().split('T')[0],
      status: status,
      user: req.user.username,
      booking_by: status === 'booked' ? booking_by : null,
      approval_photo_url: status === 'booked' && req.file ? req.file.location : null,
      approval_photo_key: status === 'booked' && req.file ? req.file.key : null,
      action: action
    };


    return res.json({ 
      success: true, 
      message: `Court ${court.name} slot ${timeSlot.formatted_slot} ${action} - status: ${status}`,
      booking: responseBooking 
    });


  } catch (error) {
    console.error('❌ Error updating booking:', error);
    
    // Clean up uploaded file from S3 on error
    if (req.file) {
      try {
        await s3Service.deleteFile(req.file.key);
        console.log('🗑️ Cleaned up uploaded file from S3 due to error');
      } catch (s3Error) {
        console.error('Error cleaning up uploaded file from S3:', s3Error);
      }
    }
    
    if (error.code === 11000) {
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


// Bulk booking multiple slots with S3
const bulkUpdateBookings = async (req, res) => {
  try {
    const { courtId, timeSlotIds, status, date, booking_by } = req.body;
    
    // Parse timeSlotIds if it's a string
    let parsedTimeSlotIds;
    try {
      parsedTimeSlotIds = typeof timeSlotIds === 'string' ? JSON.parse(timeSlotIds) : timeSlotIds;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timeSlotIds format'
      });
    }


    // Normalize the date
    const bookingDate = Booking.normalizeDate(date ? new Date(date) : new Date());


    // Validation
    if (!courtId || !parsedTimeSlotIds || !Array.isArray(parsedTimeSlotIds) || parsedTimeSlotIds.length === 0 || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: courtId, timeSlotIds (array), status'
      });
    }


    // Validate booking_by field and approval photo when status is 'booked'
    if (status === 'booked') {
      if (!booking_by || booking_by.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'booking_by field is required when status is booked'
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Approval photo is required when booking slots'
        });
      }
    }


    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }


    // Validate status
    const validStatuses = ['available', 'booked', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Valid options: ${validStatuses.join(', ')}`
      });
    }


    // Get all time slots and verify court
    const [timeSlots, court] = await Promise.all([
      TimeSlot.find().sort({ hour: 1 }),
      Court.findById(courtId)
    ]);


    if (!court) {
      return res.status(400).json({ 
        success: false,
        error: 'Court not found' 
      });
    }


    // Convert frontend slot IDs to actual time slots
    const validTimeSlots = [];
    for (const frontendSlotId of parsedTimeSlotIds) {
      const slotIndex = parseInt(frontendSlotId) - 1;
      if (slotIndex >= 0 && slotIndex < timeSlots.length) {
        validTimeSlots.push({
          frontendId: frontendSlotId,
          timeSlot: timeSlots[slotIndex]
        });
      }
    }


    if (validTimeSlots.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid time slots found'
      });
    }


    const results = [];
    const errors = [];
    let shouldDeleteUploadedFile = false;


    // Process each time slot
    for (const { frontendId, timeSlot } of validTimeSlots) {
      try {
        // Find existing booking
        const existingBooking = await Booking.findOne({
          court: courtId,
          time_slot: timeSlot._id,
          date: bookingDate
        });


        let result;
        let action;


        if (status === 'available') {
          if (existingBooking) {
            // Delete the approval photo from S3 if it exists
            if (existingBooking.approval_photo_key) {
              try {
                await s3Service.deleteFile(existingBooking.approval_photo_key);
              } catch (s3Error) {
                console.error(`Error deleting S3 file for slot ${frontendId}:`, s3Error);
              }
            }
            
            result = await Booking.deleteOne({ _id: existingBooking._id });
            action = result.deletedCount > 0 ? 'deleted' : 'delete_failed';
          } else {
            action = 'already_available';
          }
          shouldDeleteUploadedFile = true;
        } else {
          const bookingData = {
            court: courtId,
            time_slot: timeSlot._id,
            date: bookingDate,
            status: status,
            user: req.user._id
          };


          // Add booking_by field and S3 photo info if status is 'booked'
          if (status === 'booked') {
            bookingData.booking_by = booking_by.trim();
            // For bulk bookings, we'll use the same photo for all slots
            bookingData.approval_photo_key = req.file.key;
            bookingData.approval_photo_url = req.file.location;
            bookingData.approval_photo_filename = req.file.originalname;
          }


          if (existingBooking) {
            // Delete old approval photo from S3 if updating (only for the first slot to avoid multiple deletions of same file)
            if (existingBooking.approval_photo_key && req.file && results.length === 0) {
              try {
                await s3Service.deleteFile(existingBooking.approval_photo_key);
              } catch (s3Error) {
                console.error('Error deleting old file from S3:', s3Error);
              }
            }
            
            Object.assign(existingBooking, bookingData);
            result = await existingBooking.save();
            action = 'updated';
          } else {
            result = await Booking.create(bookingData);
            action = 'created';
          }
        }


        results.push({
          slotId: frontendId,
          timeSlot: timeSlot.formatted_slot,
          action: action,
          success: true
        });


      } catch (slotError) {
        errors.push({
          slotId: frontendId,
          timeSlot: timeSlot.formatted_slot,
          error: slotError.message
        });
      }
    }


    // Clean up uploaded file from S3 if needed
    if (shouldDeleteUploadedFile && req.file) {
      try {
        await s3Service.deleteFile(req.file.key);
      } catch (s3Error) {
        console.error('Error cleaning up uploaded file from S3:', s3Error);
      }
    } else if (results.length === 0 && req.file) {
      try {
        await s3Service.deleteFile(req.file.key);
      } catch (s3Error) {
        console.error('Error cleaning up uploaded file from S3:', s3Error);
      }
    }


    const response = {
      success: results.length > 0,
      message: `Bulk update completed: ${results.length} successful, ${errors.length} failed`,
      results: results,
      errors: errors,
      totalSlots: parsedTimeSlotIds.length,
      successfulSlots: results.length,
      failedSlots: errors.length
    };


    // Return appropriate status code
    if (results.length === 0) {
      return res.status(400).json(response);
    } else if (errors.length > 0) {
      return res.status(207).json(response); // 207 Multi-Status
    } else {
      return res.json(response);
    }


  } catch (error) {
    console.error('❌ Error in bulk update bookings:', error);
    
    // Clean up uploaded file from S3 on error
    if (req.file) {
      try {
        await s3Service.deleteFile(req.file.key);
      } catch (s3Error) {
        console.error('Error cleaning up uploaded file from S3:', s3Error);
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: `Failed to bulk update bookings: ${error.message}` 
    });
  }
};


// Get approval photo directly (redirect to S3)
const getApprovalPhotoRedirect = async (req, res) => {
  try {
    const filename = req.params.filename;
    
    console.log(`Redirecting to approval photo for filename: ${filename}`);
    
    // Validate that filename exists
    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Missing filename parameter'
      });
    }

    // Construct direct S3 URL (since bucket is public)
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    const key = `approval-photos/${filename}`;
    
    const directUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
    
    console.log(`Redirecting to: ${directUrl}`);
    res.redirect(directUrl);
    
  } catch (error) {
    console.error('Error redirecting to approval photo:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to access photo'
    });
  }
};

// Get approval photo with direct URL (no presigned URL needed for public buckets)
const getApprovalPhoto = async (req, res) => {
  try {
    const filename = req.params.filename;
    const key = `approval-photos/${filename}`;
    
    console.log(`Getting approval photo for key: ${key}`);
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Missing filename parameter'
      });
    }

    // Check if file exists
    console.log('Checking if file exists...');
    const exists = await s3Service.fileExists(key);
    console.log('File exists result:', exists);
    
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Photo not found in S3'
      });
    }

    // Return direct S3 URL (since bucket is public)
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    const directUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
    
    res.json({
      success: true,
      url: directUrl,
      key: key,
      isPublic: true
    });
  } catch (error) {
    console.error('Error getting approval photo:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get photo URL',
      details: error.message
    });
  }
};

// Admin endpoint to list all approval photos
const listApprovalPhotos = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    // List files from S3
    const files = await s3Service.listFiles('approval-photos/', parseInt(limit) * parseInt(page));
    
    // Get bookings that have approval photos
    const bookings = await Booking.find({
      approval_photo_key: { $exists: true, $ne: null }
    })
    .populate(['court', 'time_slot', 'user'])
    .sort({ createdAt: -1 });

    // Combine S3 file info with booking info
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    
    const photosWithBookings = files.map(file => {
      const booking = bookings.find(b => b.approval_photo_key === file.Key);
      const directUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${file.Key}`;
      
      return {
        key: file.Key,
        url: directUrl,
        size: file.Size,
        lastModified: file.LastModified,
        booking: booking ? {
          id: booking._id,
          court: booking.court?.name,
          timeSlot: booking.time_slot?.formatted_slot,
          date: booking.date,
          bookingBy: booking.booking_by,
          user: booking.user?.username,
          status: booking.status
        } : null
      };
    });

    res.json({
      success: true,
      photos: photosWithBookings,
      totalFiles: files.length,
      totalBookings: bookings.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error listing approval photos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list photos'
    });
  }
};


module.exports = {
  getCourtStatus,
  updateBooking,
  bulkUpdateBookings,
  getApprovalPhoto,
  getApprovalPhotoRedirect,
  listApprovalPhotos
};
