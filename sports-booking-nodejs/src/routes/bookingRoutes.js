const express = require('express');

// Debug controller imports
console.log('=== DEBUGGING CONTROLLER IMPORTS ===');
try {
  const controllerModule = require('../controllers/bookingController');
  console.log('Controller module loaded successfully');
  console.log('Available exports:', Object.keys(controllerModule));
  
  const { 
    getCourtStatus, 
    updateBooking, 
    bulkUpdateBookings,
    getApprovalPhoto,
    getApprovalPhotoRedirect,
    listApprovalPhotos
  } = controllerModule;

  console.log('getCourtStatus:', typeof getCourtStatus);
  console.log('updateBooking:', typeof updateBooking);
  console.log('bulkUpdateBookings:', typeof bulkUpdateBookings);
  console.log('getApprovalPhoto:', typeof getApprovalPhoto);
  console.log('getApprovalPhotoRedirect:', typeof getApprovalPhotoRedirect);
  console.log('listApprovalPhotos:', typeof listApprovalPhotos);
} catch (error) {
  console.error('Error importing controller:', error);
}

// Debug middleware imports
console.log('=== DEBUGGING MIDDLEWARE IMPORTS ===');
try {
  const authModule = require('../middleware/auth');
  console.log('Auth module loaded successfully');
  console.log('Available auth exports:', Object.keys(authModule));
  
  const { protect, admin } = authModule;
  console.log('protect:', typeof protect);
  console.log('admin:', typeof admin);
} catch (error) {
  console.error('Error importing auth middleware:', error);
}

try {
  const upload = require('../middleware/upload');
  console.log('Upload middleware:', typeof upload);
  console.log('Upload.single:', typeof upload?.single);
} catch (error) {
  console.error('Error importing upload middleware:', error);
}
console.log('=====================================');

// Only proceed if all imports are successful
const { 
  getCourtStatus, 
  updateBooking, 
  bulkUpdateBookings,
  getApprovalPhoto,
  getApprovalPhotoRedirect,
  listApprovalPhotos
} = require('../controllers/bookingController');
const { protect, admin } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Court status route (no authentication required for viewing)
router.get('/court-status', getCourtStatus);

// Single booking route with S3 file upload
router.post('/update', protect, upload.single('approval_photo'), updateBooking);

// Bulk booking route with S3 file upload
router.post('/bulk-update', protect, upload.single('approval_photo'), bulkUpdateBookings);

// Routes to get approval photos - Use simple parameter approach
router.get('/approval-photo/:filename', getApprovalPhoto);
router.get('/approval-photo-direct/:filename', getApprovalPhotoRedirect);

// Admin route to list all approval photos
router.get('/admin/approval-photos', protect, admin, listApprovalPhotos);

module.exports = router;