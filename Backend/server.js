require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const filesRouter = require('./routes/files');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://cloud-file-storage-xcca.onrender.com'
  ],
  methods: ['GET', 'POST', 'DELETE','PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/api/files',filesRouter)
app.use('/api/auth', authRouter);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Test route
app.get('/', (req, res) => {
  res.send('Cloud Storage API is running!');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});