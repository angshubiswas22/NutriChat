import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './config/database.js';

const PORT = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    await connectDatabase();

    app.listen(PORT, '127.0.0.1', () => {
      console.log(
        `NutriChat API running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
        const redact = (message) => {
      let text = String(message ?? '');

      const password = process.env.MONGODB_PASSWORD;
      if (password) {
        text = text.split(password).join('[hidden]');
        text = text.split(encodeURIComponent(password)).join('[hidden]');
      }

      return text.replace(
        /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
        '[connection string hidden]'
      );
    };

    console.error('DETAILS:', redact(error.message));

    for (const server of error.reason?.servers?.values() ?? []) {
      console.error('SERVER:', server.address);
      console.error('CAUSE:', redact(server.error?.message));
      console.error('INNER CAUSE:', redact(server.error?.cause?.message));
    }
    if (error.name === 'Error') {
      console.error(error.message);
    } else {
      console.error(
        `Database connection failed (${error.name}).`
      );
      console.error(
        'Check your Atlas credentials, IP access list, cluster address and internet connection.'
      );
    }

    process.exit(1);
  }
}

startServer();