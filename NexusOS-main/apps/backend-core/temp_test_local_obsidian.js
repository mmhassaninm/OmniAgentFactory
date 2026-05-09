import obsidianSkill from './src/skills/obsidianSkill.js';

async function test() {
    console.log("--- 💎 Testing Native Obsidian Skill ---");

    console.log("\n1. Creating Note 'Test_Nexus_Project'...");
    const createRes = await obsidianSkill.executeIntent({
        action: 'createNote',
        title: 'Test_Nexus_Project',
        content: '# Test Project\n\nThis is a native NexusOS test.'
    });
    console.log(createRes);

    console.log("\n2. Listing Notes...");
    const listRes = await obsidianSkill.executeIntent({ action: 'listNotes' });
    console.log(listRes);

    console.log("\n3. Reading Note...");
    const readRes = await obsidianSkill.executeIntent({ action: 'readNote', title: 'Test_Nexus_Project' });
    console.log(readRes);

    console.log("\n4. Searching Notes for 'NexusOS'...");
    const searchRes = await obsidianSkill.executeIntent({ action: 'searchNotes', query: 'NexusOS' });
    console.log(searchRes);

    process.exit(0);
}

test();
