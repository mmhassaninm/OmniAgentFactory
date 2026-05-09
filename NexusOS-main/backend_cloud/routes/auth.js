const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const router = express.Router();

// NodeMailer Transporter Setup (Keys not hardcoded, to be configured in Settings/ENV)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || 'no-reply@example.com',
        pass: process.env.SMTP_PASS || 'secret'
    }
});

// Register new user with Email Verification
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check existing user
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists with this email.' });
        }

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Automate checking for first user to assign master_admin
        const count = await User.countDocuments();
        const role = count === 0 ? 'master_admin' : 'standard';

        const user = new User({
            email,
            password, // Hashed by pre-save
            role,
            verificationToken,
            // Auto-verify if it's the master admin, otherwise require email
            isVerified: count === 0 ? true : false
        });

        await user.save();

        // Send Activation Email
        if (user.role !== 'master_admin') {
            const activationLink = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/auth/verify/${verificationToken}`;
            const mailOptions = {
                from: process.env.SMTP_USER || 'no-reply@nexusos.local',
                to: user.email,
                subject: 'NexusOS - Account Activation',
                html: `<h3>Welcome to NexusOS</h3><p>Please click the link below to activate your account:</p><a href="${activationLink}">${activationLink}</a>`
            };

            transporter.sendMail(mailOptions).catch(err => console.error('[Nodemailer] Failed to send activation email:', err));
        }

        res.status(201).json({ message: 'Registration successful. Please check your email for the activation link.', role });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Verify Email Route
router.get('/verify/:token', async (req, res) => {
    try {
        const user = await User.findOne({ verificationToken: req.params.token });
        if (!user) return res.status(400).json({ message: 'Invalid or expired activation link.' });

        user.isVerified = true;
        user.verificationToken = undefined; // Clear token after success
        await user.save();

        res.send('<h2>Account Activated Successfully. You can now return to NexusOS and Login.</h2>');
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.isVerified) return res.status(403).json({ message: 'Please verify your email before logging in.' });
        if (!user.isActive) return res.status(403).json({ message: 'Account is banned by administration.' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, role: user.role, email: user.email },
            process.env.JWT_SECRET || 'fallback_secret_must_change',
            { expiresIn: '7d' }
        );

        user.lastLogin = new Date();
        await user.save();

        res.json({ token, user: { email: user.email, role: user.role } });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        // Send Reset Email
        const resetLink = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/auth/reset-password/${resetToken}`;
        const mailOptions = {
            from: process.env.SMTP_USER || 'no-reply@nexusos.local',
            to: user.email,
            subject: 'NexusOS - Password Reset',
            html: `<h3>Password Reset Request</h3><p>Please click the link below to reset your password. This link will expire in 1 hour:</p><a href="${resetLink}">${resetLink}</a>`
        };

        transporter.sendMail(mailOptions).catch(err => console.error('[Nodemailer] Failed to send reset email:', err));

        res.json({ message: 'Password reset link sent to your email.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Reset Password
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ message: 'Invalid or expired reset token.' });

        user.password = password; // Hashed by pre-save hook
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: 'Password reset successful. You can now login with your new password.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
