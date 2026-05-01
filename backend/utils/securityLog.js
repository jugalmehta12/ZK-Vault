const AuditLog = require('../models/AuditLog');

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    ''
  );
}

async function logSecurityEvent(req, event, options = {}) {
  try {
    const { user = null, email = '', metadata = {} } = options;
    await AuditLog.create({
      user,
      email,
      event,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      metadata,
    });
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logSecurityEvent, getClientIp };
