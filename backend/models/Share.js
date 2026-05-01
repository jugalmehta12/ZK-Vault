const mongoose = require('mongoose');

const ShareSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiverEmail: {
      type: String,
      required: true,
      lowercase: true,
    },
    encryptedPayload: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Share', ShareSchema);
