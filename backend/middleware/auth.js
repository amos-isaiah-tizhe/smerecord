/**
 * middleware/auth.js — JWT Authentication Middleware
 *
 * This middleware protects routes that require login.
 *
 * How JWT works (simple explanation):
 *   1. User logs in → server gives them a "token" (a long string)
 *   2. User sends that token with every future request
 *   3. Server checks the token to confirm who the user is
 *   4. If valid, the request continues. If not, return 401 Unauthorized.
 *
 * The token is sent in the request header like this:
 *   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;

    // Check if Authorization header exists and starts with "Bearer"
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // Extract just the token part after "Bearer "
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token was found, reject the request
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please log in first.'
      });
    }

    // Verify the token using our JWT secret
    // jwt.verify() decodes the token and returns the payload we stored in it
    // If the token is tampered with or expired, it throws an error
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user from the ID stored in the token
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists. Please log in again.'
      });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: 'This account has been suspended. Please contact support.'
      });
    }

    // Attach the user to the request object so route handlers can use it
    // e.g. req.user._id gives us the logged-in user's ID
    req.user = user;

    // Call next() to move on to the actual route handler
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Your session has expired. Please log in again.'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again.'
    });
  }
};

module.exports = { protect };
