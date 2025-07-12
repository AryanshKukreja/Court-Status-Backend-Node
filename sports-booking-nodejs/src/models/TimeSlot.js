const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema({
  hour: {
    type: Number,
    required: true,
    min: 7,
    max: 22,
    unique: true
  }
}, {
  timestamps: true,
  collection: 'timeslots'
});

// Virtual for formatted slot
timeSlotSchema.virtual('formatted_slot').get(function() {
  const hour = this.hour;
  const nextHour = hour + 1;
  const formatHour = (h) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayHour}:00 ${period}`;
  };
  return `${formatHour(hour)} - ${formatHour(nextHour)}`;
});

// Static method to create default slots
timeSlotSchema.statics.createDefaultSlots = async function() {
  const slots = [];
  for (let hour = 7; hour <= 22; hour++) {
    slots.push({ hour });
  }
  
  try {
    await this.insertMany(slots, { ordered: false });
  } catch (error) {
    // Ignore duplicate key errors
    if (error.code !== 11000) {
      throw error;
    }
  }
};

module.exports = mongoose.model('TimeSlot', timeSlotSchema);
