const mongoose = require('mongoose');

const bookingStatusEnum = ['available', 'booked', 'maintenance'];

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
