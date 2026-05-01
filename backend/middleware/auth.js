const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.sid) {
      return res.status(401).json({ success: false, message: 'Session token is invalid.' });
    }

    const session = await Session.findById(decoded.sid);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }

    const user = await User.findById(decoded.id).select('-passwordHash -mfaSecret');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }

    session.lastSeenAt = new Date();
    await session.save();

    req.user = user;
    req.sessionId = decoded.sid;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

module.exports = { protect };
