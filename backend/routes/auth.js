const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');
const { registerRules, loginRules, handleValidationErrors } = require('../middleware/sanitize');
const { logSecurityEvent, getClientIp } = require('../utils/securityLog');

// Helper: issue JWT in httpOnly cookie
const IS_DEV = process.env.NODE_ENV !== 'production';

const sendToken = async (res, userId, req) => {
  const sid = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const token = jwt.sign({ id: userId, sid }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  });

  await Session.create({
    _id: sid,
    user: userId,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || '',
    expiresAt,
    lastSeenAt: new Date(),
  });

  res.cookie('token', token, {
    httpOnly: true,
    secure: !IS_DEV,           // false in dev (HTTP), true in production (HTTPS)
    sameSite: IS_DEV ? 'Lax' : 'Strict',
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
  });
  return token;
};

// ─── REGISTER ───────────────────────────────────────────────────────────────
// POST /api/auth/register
router.post(
  '/register',
  registerLimiter,
  registerRules,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      const existing = await User.findOne({ email });
      if (existing) {
        await logSecurityEvent(req, 'auth.register.failed', { email, metadata: { reason: 'email_exists' } });
        return res.status(409).json({ success: false, message: 'Email already registered.' });
      }

      const user = await User.create({ email, passwordHash: password });
      await sendToken(res, user._id, req);
      await logSecurityEvent(req, 'auth.register.succeeded', { user: user._id, email: user.email });

      res.status(201).json({
        success: true,
        message: 'Registration successful.',
        user: { id: user._id, email: user.email, mfaEnabled: user.mfaEnabled },
      });
    } catch (err) {
      console.error('Register error:', err);
      await logSecurityEvent(req, 'auth.register.failed', { email: req.body?.email, metadata: { reason: 'server_error' } });
      res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
  }
);

// ─── LOGIN ───────────────────────────────────────────────────────────────────
// POST /api/auth/login
router.post('/login', loginLimiter, loginRules, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, mfaToken } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      await logSecurityEvent(req, 'auth.login.failed', { email, metadata: { reason: 'invalid_credentials' } });
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // MFA check
    if (user.mfaEnabled) {
      if (!mfaToken) {
        await logSecurityEvent(req, 'auth.login.mfa_required', { user: user._id, email: user.email });
        return res.status(200).json({ success: false, mfaRequired: true, message: 'MFA token required.' });
      }
      const verified = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: mfaToken,
        window: 1,
      });
      if (!verified) {
        await logSecurityEvent(req, 'auth.login.failed', { user: user._id, email: user.email, metadata: { reason: 'invalid_mfa' } });
        return res.status(401).json({ success: false, message: 'Invalid MFA token.' });
      }
    }

    await sendToken(res, user._id, req);
    await logSecurityEvent(req, 'auth.login.succeeded', { user: user._id, email: user.email });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: { id: user._id, email: user.email, mfaEnabled: user.mfaEnabled },
    });
  } catch (err) {
    console.error('Login error:', err);
    await logSecurityEvent(req, 'auth.login.failed', { email: req.body?.email, metadata: { reason: 'server_error' } });
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.sid) {
        await Session.findByIdAndUpdate(decoded.sid, { revokedAt: new Date() });
      }
    }
  } catch (err) {
    // Ignore invalid cookie token; still clear cookie.
  }

  await logSecurityEvent(req, 'auth.logout', { user: req.user?._id, email: req.user?.email });
  res.cookie('token', '', { httpOnly: true, secure: !IS_DEV, sameSite: IS_DEV ? 'Lax' : 'Strict', maxAge: 0 });
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// ─── MFA SETUP ───────────────────────────────────────────────────────────────
// POST /api/auth/mfa/setup
router.post('/mfa/setup', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.mfaEnabled) {
      return res.status(400).json({ success: false, message: 'MFA is already setup.' });
    }
    const secret = speakeasy.generateSecret({ name: `ZKVault (${user.email})` });
    req.user.mfaSecret = secret.base32;
    await req.user.save();
    await logSecurityEvent(req, 'auth.mfa.setup', { user: req.user._id, email: req.user.email });

    const qrDataURL = await QRCode.toDataURL(secret.otpauth_url);
    res.status(200).json({ success: true, qrCode: qrDataURL, secret: secret.base32 });
  } catch (err) {
    console.error('MFA setup error:', err);
    res.status(500).json({ success: false, message: 'MFA setup failed.' });
  }
});

// POST /api/auth/mfa/verify  — enables MFA after user scans QR
router.post('/mfa/verify', protect, async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user._id);

    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ success: false, message: 'Invalid token. MFA not enabled.' });
    }

    user.mfaEnabled = true;
    await user.save();
    await logSecurityEvent(req, 'auth.mfa.enabled', { user: req.user._id, email: req.user.email });

    res.status(200).json({ success: true, message: 'MFA enabled successfully.' });
  } catch (err) {
    console.error('MFA verify error:', err);
    res.status(500).json({ success: false, message: 'MFA verification failed.' });
  }
});

// POST /api/auth/mfa/disable
router.post('/mfa/disable', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.mfaEnabled = false;
    user.mfaSecret = null;
    await user.save();
    await logSecurityEvent(req, 'auth.mfa.disabled', { user: req.user._id, email: req.user.email });
    res.status(200).json({ success: true, message: 'MFA disabled.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to disable MFA.' });
  }
});

// GET /api/auth/sessions
router.get('/sessions', protect, async (req, res) => {
  try {
    const sessions = await Session.find({ user: req.user._id, revokedAt: null }).sort({ lastSeenAt: -1 });
    res.status(200).json({
      success: true,
      currentSessionId: req.sessionId,
      sessions: sessions.map((s) => ({
        id: s._id,
        ip: s.ip,
        userAgent: s.userAgent,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch sessions.' });
  }
});

// GET /api/auth/audit-logs
router.get('/audit-logs', protect, async (req, res) => {
  try {
    const logs = await AuditLog.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.status(200).json({
      success: true,
      logs: logs.map((l) => ({
        id: l._id,
        event: l.event,
        ip: l.ip,
        userAgent: l.userAgent,
        metadata: l.metadata,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
});

// DELETE /api/auth/sessions/:id
router.delete('/sessions/:id', protect, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session || String(session.user) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }
    session.revokedAt = new Date();
    await session.save();
    await logSecurityEvent(req, 'auth.session.revoked', { user: req.user._id, email: req.user.email, metadata: { sessionId: session._id } });
    res.status(200).json({ success: true, message: 'Session revoked.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to revoke session.' });
  }
});

// DELETE /api/auth/sessions
router.delete('/sessions', protect, async (req, res) => {
  try {
    await Session.updateMany(
      { user: req.user._id, _id: { $ne: req.sessionId }, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    await logSecurityEvent(req, 'auth.sessions.revoke_others', { user: req.user._id, email: req.user.email });
    res.status(200).json({ success: true, message: 'Other sessions revoked.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to revoke sessions.' });
  }
});

// POST /api/auth/recovery/configure
router.post('/recovery/configure', protect, async (req, res) => {
  try {
    const { encryptedMaster, iv, salt, hint = '', recoveryPhrase = '' } = req.body;
    if (!encryptedMaster || !iv || !salt) {
      return res.status(400).json({ success: false, message: 'Missing recovery fields.' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      recoveryEncryptedMaster: encryptedMaster,
      recoveryIV: iv,
      recoverySalt: salt,
      recoveryHint: hint,
      recoveryPhrase: recoveryPhrase,
    });

    await logSecurityEvent(req, 'auth.recovery.configured', { user: req.user._id, email: req.user.email });
    res.status(200).json({ success: true, message: 'Recovery configured.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to configure recovery.' });
  }
});

// GET /api/auth/recovery/status
router.get('/recovery/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('recoveryEncryptedMaster recoveryHint');
    res.status(200).json({
      success: true,
      enabled: Boolean(user?.recoveryEncryptedMaster),
      hint: user?.recoveryHint || '',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch recovery status.' });
  }
});

// POST /api/auth/recovery/blob
router.post('/recovery/blob', loginLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      'recoveryEncryptedMaster recoveryIV recoverySalt recoveryHint'
    );

    if (!user || !user.recoveryEncryptedMaster) {
      await logSecurityEvent(req, 'auth.recovery.requested', { email, metadata: { configured: false } });
      return res.status(404).json({ success: false, message: 'Recovery is not configured for this account.' });
    }

    await logSecurityEvent(req, 'auth.recovery.requested', { email, metadata: { configured: true } });
    res.status(200).json({
      success: true,
      recovery: {
        encryptedMaster: user.recoveryEncryptedMaster,
        iv: user.recoveryIV,
        salt: user.recoverySalt,
        hint: user.recoveryHint || '',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch recovery blob.' });
  }
});

// POST /api/auth/recovery/reset — Reset master password using recovery phrase
router.post('/recovery/reset', loginLimiter, async (req, res) => {
  try {
    const { email, recoveryPhrase, newPassword } = req.body;
    if (!email || !recoveryPhrase || !newPassword) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      await logSecurityEvent(req, 'auth.recovery.reset_failed', { email, reason: 'user_not_found' });
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Check if recovery is configured
    if (!user.recoveryEncryptedMaster) {
      await logSecurityEvent(req, 'auth.recovery.reset_failed', { email, reason: 'recovery_not_configured' });
      return res.status(400).json({ success: false, message: 'Recovery is not configured for this account. Please contact support.' });
    }

    // Verify recovery phrase (simple string comparison - in production, use hashing)
    const storedPhrase = user.recoveryHint || '';
    if (recoveryPhrase !== storedPhrase && recoveryPhrase !== user.recoveryPhrase) {
      await logSecurityEvent(req, 'auth.recovery.reset_failed', { email, reason: 'invalid_phrase' });
      return res.status(401).json({ success: false, message: 'Invalid recovery phrase.' });
    }

    // Hash new password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    user.passwordHash = hashedPassword;
    await user.save();

    await logSecurityEvent(req, 'auth.recovery.reset_success', { email, userId: user._id });
    res.status(200).json({ success: true, message: 'Master password has been reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Recovery reset error:', err);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.status(200).json({ success: true, user: req.user, sessionId: req.sessionId });
});

module.exports = router;
