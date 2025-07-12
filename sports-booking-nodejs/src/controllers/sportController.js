const Sport = require('../models/Sport');
const Court = require('../models/Court');
const Booking = require('../models/Booking');

// Get all sports
const getAllSports = async (req, res) => {
  try {
    const sports = await Sport.find().sort({ name: 1 });
    res.json(sports);
  } catch (error) {
    console.error('Error fetching sports:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all sports with court counts
const getAllSportsWithCourts = async (req, res) => {
  try {
    const sports = await Sport.find().sort({ name: 1 });
    
    const sportsWithCourts = await Promise.all(
      sports.map(async (sport) => {
        const courtCount = await Court.countDocuments({ sport: sport._id });
        return {
          ...sport.toObject(),
          courtCount
        };
      })
    );
    
    res.json({
      success: true,
      data: sportsWithCourts
    });
  } catch (error) {
    console.error('Error fetching sports with courts:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get sport with court details
const getSportWithCourts = async (req, res) => {
  try {
    const { id } = req.params;
    
    const sport = await Sport.findById(id);
    if (!sport) {
      return res.status(404).json({ error: 'Sport not found' });
    }
    
    const courtCount = await Court.countDocuments({ sport: id });
    const courts = await Court.find({ sport: id }).sort({ name: 1 });
    
    res.json({
      success: true,
      data: {
        sport,
        courtCount,
        courts
      }
    });
  } catch (error) {
    console.error('Error fetching sport with courts:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create new sport with courts
const createSport = async (req, res) => {
  try {
    const { id, name } = req.body;
    
    // Validate input
    if (!id || !name) {
      return res.status(400).json({ 
        error: 'Sport ID and name are required' 
      });
    }
    
    // Validate ID format
    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ 
        error: 'Sport ID must be lowercase letters, numbers, and hyphens only' 
      });
    }
    
    // Check if sport already exists
    const existingSport = await Sport.findOne({ _id: id });
    if (existingSport) {
      return res.status(400).json({ 
        error: 'Sport with this ID already exists' 
      });
    }
    
    // Create new sport
    const sport = await Sport.create({
      _id: id,
      name: name
    });
    
    console.log('Sport created:', sport);
    
    // Automatically create 4 courts for the new sport
    const courtNames = sport.name === 'Cricket' 
      ? ['Pitch-1', 'Pitch-2', 'Pitch-3', 'Pitch-4']
      : [`${sport.name} Court 1`, `${sport.name} Court 2`, `${sport.name} Court 3`, `${sport.name} Court 4`];
    
    const createdCourts = [];
    for (const courtName of courtNames) {
      const court = await Court.create({
        sport: sport._id,
        name: courtName
      });
      createdCourts.push(court);
      console.log('Court created:', court);
    }
    
    res.status(201).json({
      success: true,
      message: `Sport "${sport.name}" and ${createdCourts.length} courts created successfully`,
      data: {
        sport: sport,
        courts: createdCourts
      }
    });
  } catch (error) {
    console.error('Error creating sport:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update court count for a sport
const updateCourtCount = async (req, res) => {
  try {
    const { id } = req.params;
    const { courtCount } = req.body;
    
    if (!courtCount || courtCount < 1 || courtCount > 20) {
      return res.status(400).json({
        error: 'Court count must be between 1 and 20'
      });
    }
    
    const sport = await Sport.findById(id);
    if (!sport) {
      return res.status(404).json({ error: 'Sport not found' });
    }
    
    // Get current courts
    const currentCourts = await Court.find({ sport: id }).sort({ name: 1 });
    const currentCount = currentCourts.length;
    
    console.log(`Updating ${sport.name} from ${currentCount} to ${courtCount} courts`);
    
    if (courtCount > currentCount) {
      // Add new courts
      const courtsToAdd = courtCount - currentCount;
      const newCourts = [];
      
      for (let i = currentCount + 1; i <= courtCount; i++) {
        const courtName = sport.name === 'Cricket' 
          ? `Pitch-${i}` 
          : `${sport.name} Court ${i}`;
        
        const court = await Court.create({
          sport: sport._id,
          name: courtName
        });
        newCourts.push(court);
      }
      
      console.log(`Added ${newCourts.length} new courts`);
      
      res.json({
        success: true,
        message: `Added ${courtsToAdd} courts to ${sport.name}`,
        data: {
          sport,
          courtCount,
          addedCourts: newCourts
        }
      });
      
    } else if (courtCount < currentCount) {
      // Remove excess courts (remove from the end)
      const courtsToRemove = currentCount - courtCount;
      const courtsToDelete = currentCourts.slice(-courtsToRemove);
      
      // Check if any of these courts have bookings
      const courtIds = courtsToDelete.map(court => court._id);
      const bookingCount = await Booking.countDocuments({ 
        court: { $in: courtIds } 
      });
      
      if (bookingCount > 0) {
        return res.status(400).json({
          error: `Cannot remove courts. ${bookingCount} booking(s) exist for the courts to be removed. Please clear bookings first.`
        });
      }
      
      // Delete the courts
      await Court.deleteMany({ _id: { $in: courtIds } });
      
      console.log(`Removed ${courtsToRemove} courts`);
      
      res.json({
        success: true,
        message: `Removed ${courtsToRemove} courts from ${sport.name}`,
        data: {
          sport,
          courtCount,
          removedCourts: courtsToDelete.length
        }
      });
      
    } else {
      // No change needed
      res.json({
        success: true,
        message: `${sport.name} already has ${courtCount} courts`,
        data: {
          sport,
          courtCount
        }
      });
    }
    
  } catch (error) {
    console.error('Error updating court count:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete sport
const deleteSport = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if sport exists
    const sport = await Sport.findById(id);
    if (!sport) {
      return res.status(404).json({ 
        error: 'Sport not found' 
      });
    }
    
    // Check if there are any courts for this sport
    const courtCount = await Court.countDocuments({ sport: id });
    if (courtCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete sport. ${courtCount} court(s) exist for this sport. Delete courts first.` 
      });
    }
    
    // Delete the sport
    await Sport.findByIdAndDelete(id);
    
    res.json({
      success: true,
      message: `Sport "${sport.name}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting sport:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllSports,
  getAllSportsWithCourts,
  getSportWithCourts,
  createSport,
  updateCourtCount,
  deleteSport
};
