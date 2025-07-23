const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3Client } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configure multer with S3 storage using AWS SDK v3 and ACLs
const upload = multer({
  storage: multerS3({
    s3: s3Client, // Use the S3Client from AWS SDK v3
    bucket: process.env.AWS_S3_BUCKET_NAME,
    acl: 'public-read', // Make files publicly readable via ACL
    key: function (req, file, cb) {
      // Create unique filename with UUID and timestamp
      const uniqueId = uuidv4();
      const timestamp = Date.now();
      const filename = `approval-photos/${timestamp}-${uniqueId}${path.extname(file.originalname)}`;
      cb(null, filename);
    },
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        originalName: file.originalname,
        uploadedBy: req.user ? req.user._id.toString() : 'unknown',
        uploadedAt: new Date().toISOString()
      });
    },
    contentType: multerS3.AUTO_CONTENT_TYPE
  }),
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

module.exports = upload;