const mongoose = require('mongoose');

const courtSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  sport: {
    type: String,
    ref: 'Sport',
    required: true
  }
}, {
  timestamps: true,
  collection: 'courts'
});

// Compound index for sport and name
courtSchema.index({ sport: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Court', courtSchema);
