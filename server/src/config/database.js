import mongoose from 'mongoose';
import dns from 'node:dns';

export async function connectDatabase() {
  const template = process.env.MONGODB_URI_TEMPLATE;
  const password = process.env.MONGODB_PASSWORD;

    if (process.env.DNS_SERVER) {
    dns.setServers([process.env.DNS_SERVER]);
  }

  if (!template || !password) {
    throw new Error(
      'Add MONGODB_URI_TEMPLATE and MONGODB_PASSWORD to server/.env.'
    );
  }

  if (
    !template.startsWith('mongodb+srv://') ||
    !template.includes('<db_password>')
  ) {
    throw new Error(
      'Use the Atlas SRV connection string with <db_password> left in place.'
    );
  }

  const uri = template.replace(
    '<db_password>',
    encodeURIComponent(password)
  );

  await mongoose.connect(uri, {
    dbName: 'nutrichat',
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 5,
  });

  console.log('MongoDB connected: nutrichat');
}