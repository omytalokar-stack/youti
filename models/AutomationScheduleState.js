import mongoose from 'mongoose';

const automationScheduleStateSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true, unique: true, trim: true },
    activeCycleDate: { type: String, default: '' },
    lastSuccessfulCycleDate: { type: String, default: '' },
  },
  { timestamps: true },
);

export default mongoose.model('AutomationScheduleState', automationScheduleStateSchema);
