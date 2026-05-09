import Database from 'better-sqlite3';
import Datastore from 'nedb-promises';
import path from 'path';
import fs from 'fs';
import encryption from './encryption.js';

/**
 * Initializes and returns a connection to the SQLite database.
 * NOTE: Currently SQLite encryption is not supported out of the box without sqlcipher.
 * Consider storing JSON blobs as encrypted strings instead using encryption.encrypt().
 * @param {string} dbPath - The absolute path to the SQLite DB file.
 * @returns {Database} The connected database instance.
 */
export const connectSQLite = (dbPath) => {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return new Database(dbPath);
};

/**
 * Initializes and returns a connection to the NeDB Datastore.
 * Applies God-Mode AES-256 Nuclear Privacy encryption to string values and deep objects.
 * @param {string} dbPath - The absolute path to the NeDB file.
 * @returns {Datastore} The connected datastore instance wrapped with encryption.
 */
export const connectNoSQL = (dbPath) => {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    encryption.init(); // Ensure encryption is initialized with the master key

    const db = Datastore.create({
        filename: dbPath,
        autoload: true,
        timestampData: true
    });

    // We proxy the methods to provide transparent AES-256 encryption.
    const secureDb = {
        async insert(doc) {
            const encryptedDoc = encryption.encryptDocument(doc);
            const result = await db.insert(encryptedDoc);
            return encryption.decryptDocument(result);
        },
        async find(query, projection) {
            // Decrypting on the fly for queries is complex in NeDB because we need the cleartext to match.
            // Strict Nuclear Privacy: we fetch all and decrypt, then filter if query is complex, 
            // OR we expect the downstream caller to query by known exact string matches.
            // For now, we perform the underlying query (which might fail if querying encrypted fields)
            // and decrypt the results. Best practice is to query by non-encrypted IDs or dates.
            const results = await db.find(query, projection);
            return results.map(doc => encryption.decryptDocument(doc));
        },
        async findOne(query, projection) {
            const result = await db.findOne(query, projection);
            return result ? encryption.decryptDocument(result) : null;
        },
        async update(query, updateQuery, options) {
            // Note: $set updates might need targeted encryption depending on the update object.
            // For safety in this MVP, we encrypt the entire updateQuery if it doesn't use modifiers like $set.
            // If it uses $set, we encrypt the $set object's values.
            let safeUpdate = updateQuery;
            if (updateQuery.$set) {
                safeUpdate = { ...updateQuery, $set: encryption.encryptDocument(updateQuery.$set) };
            } else if (updateQuery.$push) {
                // Similarly for arrays, we could encrypt the pushed element
                const pushKey = Object.keys(updateQuery.$push)[0];
                safeUpdate = { ...updateQuery, $push: { [pushKey]: encryption.encryptDocument(updateQuery.$push[pushKey]) } };
            } else if (!Object.keys(updateQuery).some(k => k.startsWith('$'))) {
                // Full document replacement
                safeUpdate = encryption.encryptDocument(updateQuery);
            }
            return db.update(query, safeUpdate, options);
        },
        async remove(query, options) {
            return db.remove(query, options);
        },
        async count(query) {
            return db.count(query);
        },
        ensureIndex(options) {
            return db.ensureIndex(options);
        }
    };

    return secureDb;
};

export default { connectSQLite, connectNoSQL };
