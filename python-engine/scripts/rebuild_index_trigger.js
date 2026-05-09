import { rebuildIndex } from '../utils/knowledgeManager.js';

console.log("🚀 Triggering Manual Vault Rebuild...");

rebuildIndex()
    .then(count => {
        console.log(`✅ Rebuild Complete. Indexed ${count} documents.`);
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ Rebuild Failed:", err);
        process.exit(1);
    });
