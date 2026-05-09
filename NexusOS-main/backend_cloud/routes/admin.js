const express = require('express');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Role-Based Access Control Middleware
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'No token provided' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token invalid or expired' });

        // RBAC Check
        if (user.role !== 'admin' && user.role !== 'master_admin') {
            return res.status(403).json({ message: 'Access denied: Requires Admin privileges' });
        }

        req.user = user;
        next();
    });
};

// Get all users (Admin Only)
router.get('/users', verifyAdmin, async (req, res) => {
    try {
        // Exclude passwords
        const users = await User.find({}, '-passwordHash').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Ban/Unban user
router.put('/users/:id/status', verifyAdmin, async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: 'User not found' });

        // Master Admin Immunity Rule
        if (targetUser.role === 'master_admin') {
            return res.status(403).json({ message: 'Action denied: Cannot ban Master Admin' });
        }

        targetUser.isActive = req.body.isActive;
        await targetUser.save();

        res.json({ message: `User ${targetUser.username} status updated to ${targetUser.isActive}` });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Promote to Admin (Master Admin only)
router.put('/users/:id/promote', verifyAdmin, async (req, res) => {
    if (req.user.role !== 'master_admin') {
        return res.status(403).json({ message: 'Action denied: Only Master Admin can promote users' });
    }

    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: 'User not found' });

        targetUser.role = 'admin';
        await targetUser.save();

        res.json({ message: `User ${targetUser.username} promoted to Admin` });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete user
router.delete('/users/:id', verifyAdmin, async (req, res) => {
    // Only master_admin can delete users for safety
    if (req.user.role !== 'master_admin') {
        return res.status(403).json({ message: 'Action denied: Only Master Admin can delete users' });
    }

    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) return res.status(404).json({ message: 'User not found' });

        if (targetUser.role === 'master_admin') {
            return res.status(403).json({ message: 'Action denied: Cannot delete Master Admin' });
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ message: `User ${targetUser.email} deleted successfully` });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
