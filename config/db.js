import mongoose from 'mongoose';

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI or MONGODB_URI is required.');
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');
}
