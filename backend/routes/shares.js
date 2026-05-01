const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Share = require('../models/Share');

// ─── GET PUBLIC KEY ────────────────────────────────────────────────────────
// GET /api/shares/public-key/:email
router.get('/public-key/:email', protect, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.publicKey) return res.status(404).json({ success: false, message: 'User has not initialized RSA sharing yet' });
    
    res.json({ success: true, publicKey: user.publicKey });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── UPLOAD PUBLIC KEY ─────────────────────────────────────────────────────
// POST /api/shares/public-key
router.post('/public-key', protect, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ success: false, message: 'Public key required' });
    
    await User.findByIdAndUpdate(req.user._id, { publicKey });
    res.json({ success: true, message: 'Public key updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── CREATE SHARE ──────────────────────────────────────────────────────────
// POST /api/shares
router.post('/', protect, async (req, res) => {
  try {
    const { receiverEmail, encryptedPayload } = req.body;
    if (!receiverEmail || !encryptedPayload) return res.status(400).json({ success: false, message: 'Missing fields' });
    
    const receiver = await User.findOne({ email: receiverEmail.toLowerCase() });
    if (!receiver) return res.status(404).json({ success: false, message: 'Receiver not found' });
    
    await Share.create({
      sender: req.user._id,
      receiverEmail: receiver.email,
      encryptedPayload
    });
    
    res.status(201).json({ success: true, message: 'Shared securely' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET INCOMING SHARES ───────────────────────────────────────────────────
// GET /api/shares
router.get('/', protect, async (req, res) => {
  try {
    const shares = await Share.find({ receiverEmail: req.user.email }).populate('sender', 'email');
    res.json({ success: true, shares: shares.map(s => ({
      id: s._id,
      sender: s.sender.email,
      encryptedPayload: s.encryptedPayload,
      createdAt: s.createdAt
    }))});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE SHARE ──────────────────────────────────────────────────────────
// DELETE /api/shares/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    await Share.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
