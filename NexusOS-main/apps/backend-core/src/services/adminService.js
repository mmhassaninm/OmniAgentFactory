import User from '../models/User.js';
import logger from '@nexus/logger';

export const getUsers = async (event) => {
    try {
        logger.info('[AdminCore] Fetching all users.');
        const users = await User.find({}, '-password').sort({ createdAt: -1 });
        return { success: true, users };
    } catch (error) {
        logger.error('[AdminCore] Fetch users error:', error.message);
        return { success: false, message: 'Server error', error: error.message };
    }
};

export const updateUserStatus = async (event, { id, isActive }) => {
    try {
        const targetUser = await User.findById(id);
        if (!targetUser) return { success: false, message: 'User not found' };

        if (targetUser.role === 'master_admin') {
            return { success: false, message: 'Cannot ban Master Admin' };
        }

        targetUser.isActive = isActive;
        await targetUser.save();

        logger.info(`[AdminCore] User ${targetUser.email} status updated to ${isActive}`);
        return { success: true, message: `User status updated.` };
    } catch (error) {
        logger.error('[AdminCore] Update status error:', error.message);
        return { success: false, message: 'Server error', error: error.message };
    }
};

export const deleteUser = async (event, { id }) => {
    try {
        const targetUser = await User.findById(id);
        if (!targetUser) return { success: false, message: 'User not found' };

        if (targetUser.role === 'master_admin') {
            return { success: false, message: 'Cannot delete Master Admin' };
        }

        await User.findByIdAndDelete(id);
        logger.info(`[AdminCore] User ${targetUser.email} deleted.`);
        return { success: true, message: 'User deleted.' };
    } catch (error) {
        logger.error('[AdminCore] Delete user error:', error.message);
        return { success: false, message: 'Server error', error: error.message };
    }
};
