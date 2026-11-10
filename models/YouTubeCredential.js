import mongoose from 'mongoose';

const youTubeCredentialSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true, unique: true, trim: true },
    refreshTokenEncrypted: { type: String, required: true },
    refreshTokenIv: { type: String, required: true },
    refreshTokenTag: { type: String, required: true },
    grantedScopes: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model('YouTubeCredential', youTubeCredentialSchema);
