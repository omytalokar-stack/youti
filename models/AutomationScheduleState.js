import mongoose from 'mongoose';

const automationScheduleStateSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true, unique: true, trim: true },
    activeCycleDate: { type: String, default: '' },
    lastSuccessfulCycleDate: { type: String, default: '' },
    lastRunAt: { type: Date, default: null },
    lastRunStatus: {
      type: String,
      enum: ['idle', 'running', 'succeeded', 'failed'],
      default: 'idle',
    },
    lastRunStep: { type: String, default: '' },
    lastRunError: { type: String, default: '' },
  },
  { timestamps: true },
);

export default mongoose.model('AutomationScheduleState', automationScheduleStateSchema);
