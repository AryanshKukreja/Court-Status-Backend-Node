const mongoose = require('mongoose');

const bookingStatusEnum = ['available', 'booked', 'closed'];

const bookingSchema = new mongoose.Schema({
  court: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Court',
    required: true
  },
  time_slot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimeSlot',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: bookingStatusEnum,
    default: 'available'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  booking_by: {
    type: String,
    required: function() {
      return this.status === 'booked';
    },
    trim: true
  },
  // S3 key for the approval photo
  approval_photo_key: {
    type: String,
    required: function() {
      return this.status === 'booked';
    }
  },
  // S3 URL for the approval photo
  approval_photo_url: {
    type: String,
    required: function() {
      return this.status === 'booked';
    }
  },
  // Store original filename for reference
  approval_photo_filename: {
    type: String,
    required: function() {
      return this.status === 'booked';
    }
  }
}, {
  timestamps: true,
  collection: 'bookings'
});

// Compound unique index
bookingSchema.index({ court: 1, time_slot: 1, date: 1 }, { unique: true });

// Add a method to normalize dates
bookingSchema.statics.normalizeDate = function(date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

module.exports = mongoose.model('Booking', bookingSchema);
