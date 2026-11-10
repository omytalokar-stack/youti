import mongoose from 'mongoose';

const automationLockSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true, unique: true, trim: true },
    leaseId: { type: String, required: true },
    leaseUntil: { type: Date, required: true },
  },
  { timestamps: true },
);

export default mongoose.model('AutomationLock', automationLockSchema);
