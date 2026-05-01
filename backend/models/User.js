const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    passwordHash: {
      type: String,
      required: true,
    },
    // Zero-Knowledge vault storage — server stores only ciphertext
    encryptedVault: {
      type: String,
      default: '',
    },
    vaultIV: {
      type: String,
      default: '',
    },
    vaultSalt: {
      type: String,
      default: '',
    },
    // MFA
    mfaSecret: {
      type: String,
      default: null,
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    publicKey: {
      type: String,
      default: '',
    },
    recoveryEncryptedMaster: {
      type: String,
      default: '',
    },
    recoveryIV: {
      type: String,
      default: '',
    },
    recoverySalt: {
      type: String,
      default: '',
    },
    recoveryHint: {
      type: String,
      default: '',
    },
    recoveryPhrase: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Hash password before saving
UserSchema.pre('save', async function () {
  if (this.isModified('passwordHash')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
});

// Compare passwords
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', UserSchema);
