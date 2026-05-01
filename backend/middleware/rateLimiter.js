const rateLimit = require('express-rate-limit');

const IS_DEV = process.env.NODE_ENV !== 'production';

// Common options for rate limiters
const commonOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => IS_DEV, // Skip rate limiting entirely in development mode
};

const loginLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
});

const registerLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    success: false,
    message: 'Too many registration attempts. Please try again after 1 hour.',
  },
});

const generalLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, registerLimiter, generalLimiter };
