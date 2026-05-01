const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const VaultVersion = require('../models/VaultVersion');
const { logSecurityEvent } = require('../utils/securityLog');

// ─── GET VAULT ────────────────────────────────────────────────────────────────
// GET /api/vault
// Returns the encrypted vault blob for the authenticated user.
// The server has NO knowledge of the plaintext contents.
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('encryptedVault vaultIV vaultSalt');
    await logSecurityEvent(req, 'vault.read', { user: req.user._id, email: req.user.email });
    res.status(200).json({
      success: true,
      vault: {
        encryptedVault: user.encryptedVault,
        vaultIV: user.vaultIV,
        vaultSalt: user.vaultSalt,
      },
    });
  } catch (err) {
    console.error('Get vault error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vault.' });
  }
});

// ─── SAVE VAULT ───────────────────────────────────────────────────────────────
// PUT /api/vault
// Accepts encrypted vault blob from the client. Stored as-is; server cannot decrypt.
router.put('/', protect, async (req, res) => {
  try {
    const { encryptedVault, vaultIV, vaultSalt } = req.body;

    if (!encryptedVault || !vaultIV || !vaultSalt) {
      return res.status(400).json({ success: false, message: 'Missing encrypted vault fields.' });
    }

    const user = await User.findById(req.user._id).select('encryptedVault vaultIV vaultSalt');
    if (user?.encryptedVault && user?.vaultIV && user?.vaultSalt) {
      const latest = await VaultVersion.findOne({ user: req.user._id }).sort({ version: -1 });
      const nextVersion = latest ? latest.version + 1 : 1;
      await VaultVersion.create({
        user: req.user._id,
        version: nextVersion,
        encryptedVault: user.encryptedVault,
        vaultIV: user.vaultIV,
        vaultSalt: user.vaultSalt,
        reason: 'before_update',
      });
    }

    await User.findByIdAndUpdate(req.user._id, { encryptedVault, vaultIV, vaultSalt });
    await logSecurityEvent(req, 'vault.updated', { user: req.user._id, email: req.user.email });

    res.status(200).json({ success: true, message: 'Vault saved securely.' });
  } catch (err) {
    console.error('Save vault error:', err);
    res.status(500).json({ success: false, message: 'Failed to save vault.' });
  }
});

// GET /api/vault/versions
router.get('/versions', protect, async (req, res) => {
  try {
    const versions = await VaultVersion.find({ user: req.user._id }).sort({ version: -1 }).limit(20);
    res.status(200).json({
      success: true,
      versions: versions.map((v) => ({
        id: v._id,
        version: v.version,
        reason: v.reason,
        createdAt: v.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load vault history.' });
  }
});

// POST /api/vault/rollback
router.post('/rollback', protect, async (req, res) => {
  try {
    const { versionId } = req.body;
    if (!versionId) {
      return res.status(400).json({ success: false, message: 'versionId is required.' });
    }

    const target = await VaultVersion.findOne({ _id: versionId, user: req.user._id });
    if (!target) {
      return res.status(404).json({ success: false, message: 'Version not found.' });
    }

    const current = await User.findById(req.user._id).select('encryptedVault vaultIV vaultSalt');
    if (current?.encryptedVault && current?.vaultIV && current?.vaultSalt) {
      const latest = await VaultVersion.findOne({ user: req.user._id }).sort({ version: -1 });
      const nextVersion = latest ? latest.version + 1 : 1;
      await VaultVersion.create({
        user: req.user._id,
        version: nextVersion,
        encryptedVault: current.encryptedVault,
        vaultIV: current.vaultIV,
        vaultSalt: current.vaultSalt,
        reason: 'before_rollback',
      });
    }

    await User.findByIdAndUpdate(req.user._id, {
      encryptedVault: target.encryptedVault,
      vaultIV: target.vaultIV,
      vaultSalt: target.vaultSalt,
    });

    await logSecurityEvent(req, 'vault.rollback', {
      user: req.user._id,
      email: req.user.email,
      metadata: { version: target.version, versionId: String(target._id) },
    });

    res.status(200).json({ success: true, message: `Rolled back to version ${target.version}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to rollback vault.' });
  }
});

module.exports = router;
