const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Health-Check
app.get('/', (req, res) => {
    res.json({
        status: "NexusOS Tunneled Backend Active",
        timestamp: new Date()
    });
});

// MongoDB Atlas Connection Setup
const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is not defined in .env file");
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[Tunnel] MongoDB Atlas Connected.');
    } catch (error) {
        console.error('[Tunnel] MongoDB Atlas Connection Failed:', error.message);
        // Do not exit process, let it try to recover or fail gracefully when endpoints are hit
    }
};

connectDB();

// Import Routes (From Phase 26)
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Server Listen
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[Tunnel] Server running locally on port ${PORT}`);
    console.log(`[Tunnel] Ready for Cloudflare mapping.`);
});
