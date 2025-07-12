const express = require('express');
const { register, login, createAdmin } = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/create-admin', createAdmin); // Add this line

module.exports = router;
