const mongoose = require('mongoose');

const sportSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: true,
  collection: 'sports'
});

// Virtual for courts
sportSchema.virtual('courts', {
  ref: 'Court',
  localField: '_id',
  foreignField: 'sport'
});

module.exports = mongoose.model('Sport', sportSchema);
