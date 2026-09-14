import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import recoveryRoutes from './routes/recoveryRoutes.js';
import chatRoutes from './routes/chatRoutes.js';

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '32kb' }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/recovery', recoveryRoutes);
app.use('/api/chat', chatRoutes);
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

export default app;