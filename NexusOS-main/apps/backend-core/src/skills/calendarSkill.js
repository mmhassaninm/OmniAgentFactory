import { connectNoSQL } from '@nexus/database';
import path from 'path';
import fs from 'fs';
import logger from '@nexus/logger';

// ── Database Setup ──────────────────────────────────────────
const DATA_DIR = path.resolve('data/skills');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const eventsDb = connectNoSQL(path.join(DATA_DIR, 'calendar.db'));
const tasksDb = connectNoSQL(path.join(DATA_DIR, 'tasks.db'));

/**
 * Calendar & Tasks Skill
 * Replicates OpenClaw's Things/Reminders logic for native NexusOS productivity.
 */
class CalendarSkill {
    constructor() {
        logger.info('[CalendarSkill] ✅ Calendar & Tasks Skill Initialized.');
    }

    async executeIntent(args) {
        if (!args || !args.action) {
            return { success: false, error: "No action provided to CalendarSkill." };
        }

        const { action, title, notes, when, deadline, list, id, limit = 20 } = args;

        logger.info(`[CalendarSkill] 📅 Executing Action: ${action} `);

        try {
            switch (action) {
                // Task Operations
                case 'addTask':
                    return await this._addTask({ title, notes, when, deadline, list });
                case 'listTasks':
                    return await this._listTasks(list, limit);
                case 'updateTask':
                    return await this._updateTask(id, { title, notes, when, deadline, list });
                case 'deleteTask':
                    return await this._deleteTask(id);

                // Event Operations
                case 'addEvent':
                    return await this._addEvent({ title, notes, when });
                case 'listEvents':
                    return await this._listEvents(limit);
                case 'deleteEvent':
                    return await this._deleteEvent(id);

                default:
                    return { success: false, error: `Unsupported Calendar action: ${action}` };
            }
        } catch (err) {
            logger.error(`[CalendarSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Task Methods ──────────────────────────────────────────

    async _addTask(data) {
        if (!data.title) return { success: false, error: "Task title is required." };
        const doc = {
            ...data,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        const newDoc = await tasksDb.insert(doc);
        return { success: true, payload: `Task '${data.title}' added with ID: ${newDoc._id}` };
    }

    async _listTasks(list, limit) {
        const query = list ? { list } : {};
        const tasks = await tasksDb.find(query).sort({ createdAt: -1 }).limit(limit);
        return { success: true, payload: JSON.stringify(tasks, null, 2) };
    }

    async _updateTask(id, updates) {
        if (!id) return { success: false, error: "Task ID is required for update." };
        const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
        await tasksDb.update({ _id: id }, { $set: cleanUpdates });
        return { success: true, payload: `Task ${id} updated successfully.` };
    }

    async _deleteTask(id) {
        if (!id) return { success: false, error: "Task ID is required for deletion." };
        await tasksDb.remove({ _id: id });
        return { success: true, payload: `Task ${id} deleted.` };
    }

    // ── Event Methods ──────────────────────────────────────────

    async _addEvent(data) {
        if (!data.title || !data.when) return { success: false, error: "Event title and date/time are required." };
        const doc = {
            ...data,
            createdAt: new Date().toISOString()
        };
        const newDoc = await eventsDb.insert(doc);
        return { success: true, payload: `Event '${data.title}' scheduled for ${data.when} (ID: ${newDoc._id})` };
    }

    async _listEvents(limit) {
        const events = await eventsDb.find({}).sort({ when: 1 }).limit(limit);
        return { success: true, payload: JSON.stringify(events, null, 2) };
    }

    async _deleteEvent(id) {
        if (!id) return { success: false, error: "Event ID is required for deletion." };
        await eventsDb.remove({ _id: id });
        return { success: true, payload: `Event ${id} removed.` };
    }
}

export default new CalendarSkill();
