import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

console.log("=====================================================");
console.log("   🌪️ THE ESCALATION MATRIX (AUTONOMOUS CHAOS LOOP)");
console.log("=====================================================\n");

const desktopPath = path.join(os.homedir(), 'Desktop');

const LEVELS = [
    {
        level: 1,
        name: "Compound File System",
        prompt: "قم بإنشاء مجلد باسم 'Nexus_Tests' على سطح المكتب، وبداخله مجلد آخر باسم 'Logs'، ثم أنشئ ملف نصي بداخله يكتب فيه 'نجح المستوى الأول'.",
        verify: () => {
            const targetDir = path.join(desktopPath, 'Nexus_Tests', 'Logs');
            const targetFile = fs.readdirSync(targetDir).find(f => f.endsWith('.txt'));
            if (!targetFile) return false;
            const content = fs.readFileSync(path.join(targetDir, targetFile), 'utf8');
            return content.includes('نجح المستوى الأول');
        }
    },
    {
        level: 2,
        name: "PowerShell Execution",
        prompt: "استخدم PowerShell لمعرفة حجم الذاكرة العشوائية (RAM) المتاحة في الجهاز، واكتب النتيجة في ملف اسمه 'RAM_Report.md' على سطح المكتب.",
        verify: () => {
            const file = path.join(desktopPath, 'RAM_Report.md');
            if (!fs.existsSync(file)) return false;
            const content = fs.readFileSync(file, 'utf8');
            return content.length > 0;
        }
    },
    {
        level: 3,
        name: "Browser RPA & Contextual Research",
        prompt: "افتح المتصفح وابحث عن 'Greco-Roman classical sculpture anatomy'، استخرج فقرة واحدة من النتائج، واحفظها في ملف باسم 'Art_Research.txt' على سطح المكتب.",
        verify: () => {
            const file = path.join(desktopPath, 'Art_Research.txt');
            if (!fs.existsSync(file)) return false;
            const content = fs.readFileSync(file, 'utf8');
            return content.length > 10; // At least a paragraph
        }
    },
    {
        level: 4,
        name: "Clean-up & Finalization",
        prompt: "ابحث عن مجلد 'Nexus_Tests' على سطح المكتب وقم بحذفه تماماً مع كل محتوياته لتنظيف النظام.",
        verify: () => {
            return !fs.existsSync(path.join(desktopPath, 'Nexus_Tests'));
        }
    }
];

function runVisualTest(prompt) {
    console.log(`\n\x1b[36m[Escalation Controller] Executing Visual UI Injector for prompt:\x1b[0m\n"${prompt}"\n`);
    try {
        execSync(`node apps/backend-core/visual-ui-test.js "${prompt}"`, { stdio: 'inherit' });
        return true;
    } catch (e) {
        console.error(`\x1b[31m[Escalation Controller] UI Test script failed with code ${e.status}\x1b[0m`);
        return false;
    }
}

async function startLoop() {
    let currentLevelIndex = 0;

    while (currentLevelIndex < LEVELS.length) {
        const levelData = LEVELS[currentLevelIndex];
        console.log(`\n\x1b[33m▶️ INITIATING LEVEL ${levelData.level}: ${levelData.name}\x1b[0m`);

        runVisualTest(levelData.prompt);

        console.log(`\x1b[36m[Escalation Controller] Running Local Verification for Level ${levelData.level}...\x1b[0m`);

        let passed = false;
        try {
            passed = levelData.verify();
        } catch (err) {
            console.error(`Verification threw an error: ${err.message}`);
            passed = false;
        }

        if (passed) {
            console.log(`\x1b[32m✅ LEVEL ${levelData.level} SUCESSFULLY CONQUERED.\x1b[0m`);
            currentLevelIndex++;
        } else {
            console.error(`\x1b[31m❌ LEVEL ${levelData.level} FAILED.\x1b[0m`);
            console.log(`The verification routine returned FALSE. Expected files/state not found.`);
            console.log(`\nThe loop will now exit to allow the NexusOS Architect Agent to debug the skills and retry.\n`);
            process.exit(1);
        }
    }

    console.log(`\n\x1b[32m🏁 THE ESCALATION MATRIX HAS BEEN FULLY CONQUERED! 🏁\x1b[0m`);
    process.exit(0);
}

startLoop();
