import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import User from '../models/User.js';
import logger from '@nexus/logger';

// NodeMailer Transporter Setup
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'no-reply@example.com',
        pass: process.env.SMTP_PASS || 'secret'
    }
});

export const register = async (event, { email, password }) => {
    try {
        logger.info(`[AuthCore] Registering user: ${email}`);
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return { success: false, message: 'User already exists.' };
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const count = await User.countDocuments();
        const role = count === 0 ? 'master_admin' : 'standard';

        const user = new User({
            email,
            password,
            role,
            verificationToken,
            isVerified: count === 0 ? true : false
        });

        await user.save();

        if (user.role !== 'master_admin') {
            const activationLink = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/api/auth/verify/${verificationToken}`;
            const mailOptions = {
                from: process.env.SMTP_USER,
                to: user.email,
                subject: 'NexusOS - Account Activation',
                html: `<h3>Welcome to NexusOS</h3><p>Please click the link below to activate your account:</p><a href="${activationLink}">${activationLink}</a>`
            };
            transporter.sendMail(mailOptions).catch(err => logger.error('[Nodemailer] Failed to send activation email:', err));
        }

        return { success: true, message: 'Registration successful.', role };
    } catch (error) {
        logger.error('[AuthCore] Registration error:', error.message);
        return { success: false, message: 'Server error', error: error.message };
    }
};

export const login = async (event, { email, password }) => {
    try {
        logger.info(`[AuthCore] Login attempt: ${email}`);
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return { success: false, message: 'User not found' };

        if (!user.isVerified) return { success: false, message: 'Please verify your email.' };
        if (!user.isActive) return { success: false, message: 'Account is banned.' };

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return { success: false, message: 'Invalid credentials' };

        const token = jwt.sign(
            { id: user._id, role: user.role, email: user.email },
            process.env.JWT_SECRET || 'nexus_secure_secret',
            { expiresIn: '7d' }
        );

        user.lastLogin = new Date();
        await user.save();

        return { success: true, token, user: { email: user.email, role: user.role } };
    } catch (error) {
        logger.error('[AuthCore] Login error:', error.message);
        return { success: false, message: 'Server error', error: error.message };
    }
};
