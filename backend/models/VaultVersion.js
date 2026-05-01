  const mongoose = require('mongoose');

const VaultVersionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
    },
    encryptedVault: {
      type: String,
      required: true,
    },
    vaultIV: {
      type: String,
      required: true,
    },
    vaultSalt: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      default: 'snapshot',
    },
  },
  { timestamps: true }
);

VaultVersionSchema.index({ user: 1, version: -1 });

module.exports = mongoose.model('VaultVersion', VaultVersionSchema);
