import mongoose from 'mongoose';

const provenTacticSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    impact: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const mistakeLogSchema = new mongoose.Schema(
  {
    videoId: { type: String, required: true, trim: true },
    issue: { type: String, required: true, trim: true },
    retentionDropAt: { type: String, default: '' },
    ruleUpdated: { type: String, required: true, trim: true },
    resolvedAt: { type: Date, default: null },
  },
  { _id: true },
);

const brainMemorySchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true, unique: true, trim: true },
    selfCorrectionMode: { type: Boolean, default: true },
    provenTactics: { type: [provenTacticSchema], default: [] },
    mistakeLogs: { type: [mistakeLogSchema], default: [] },
    lastAutonomousRun: { type: Date, default: null },
    lastFallbackScriptIndex: { type: Number, default: -1, min: -1 },
  },
  { timestamps: true },
);

export default mongoose.model('BrainMemory', brainMemorySchema);
