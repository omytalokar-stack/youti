import mongoose from 'mongoose';

const videoLogSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true, trim: true, index: true },
    videoId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    hookUsed: { type: String, default: '' },
    tags: { type: [String], default: [] },
    views: { type: Number, default: null, min: 0 },
    subscribersGained: { type: Number, default: null, min: 0 },
    watchTimeHours: { type: Number, default: null, min: 0 },
    retentionScore: { type: Number, default: null, min: 0 },
    uploadDate: { type: Date, default: null },
    status: { type: String, default: 'draft', trim: true },
  },
  { timestamps: true },
);

videoLogSchema.index({ channelId: 1, videoId: 1 }, { unique: true });

export default mongoose.model('VideoLog', videoLogSchema);
