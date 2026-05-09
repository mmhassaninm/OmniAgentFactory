import aiOrchestrator from '../apps/backend-core/src/services/aiOrchestrator.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

console.log("=============================================================");
console.log("   🚀 ADVANCED CHAOS MATRIX (DIRECT BACKEND MULTI-TEST) 🚀  ");
console.log("=============================================================\n");

const desktopPath = path.join(os.homedir(), 'Desktop');

const TESTS = [
    {
        level: 1,
        name: "Process Extraction & File Creation",
        prompt: "قم بإنشاء مجلد باسم 'Chaos_Matrix' على سطح المكتب، ثم استخدم أمر tasklist لاستخراج قائمة بالعمليات الحالية التي تعمل على نظام التشغيل واحفظها في ملف نصي باسم 'running_processes.txt' داخل هذا المجلد.",
        verify: () => {
            const file = path.join(desktopPath, 'Chaos_Matrix', 'running_processes.txt');
            if (!fs.existsSync(file)) return false;
            return fs.readFileSync(file, 'utf8').length > 50;
        }
    },
    {
        level: 2,
        name: "Network Configuration Mining",
        prompt: "استخدم أمر ipconfig لاستخراج إعدادات الشبكة وحفظها في ملف باسم 'network_config.md' داخل مجلد 'Chaos_Matrix' على سطح المكتب.",
        verify: () => {
            const file = path.join(desktopPath, 'Chaos_Matrix', 'network_config.md');
            if (!fs.existsSync(file)) return false;
            return fs.readFileSync(file, 'utf8').toLowerCase().includes('windows ip configuration');
        }
    },
    {
        level: 3,
        name: "Nested Directories & System Info",
        prompt: "في مجلد 'Chaos_Matrix' الموجود على سطح المكتب، قم بإنشاء مجلديين فرعيين الأول باسم 'Hardware' والثاني باسم 'Software'. تأكد من استخدام المسار الكامل لسطح المكتب. بعد ذلك استخدم أمر systeminfo لجمع معلومات النظام واحفظها في ملف 'sys_info.txt' داخل مجلد Hardware الذي يقع على سطح المكتب.",
        verify: () => {
            const hwDir = path.join(desktopPath, 'Chaos_Matrix', 'Hardware');
            const swDir = path.join(desktopPath, 'Chaos_Matrix', 'Software');
            const file = path.join(hwDir, 'sys_info.txt');
            if (!fs.existsSync(hwDir) || !fs.existsSync(swDir) || !fs.existsSync(file)) return false;
            return fs.readFileSync(file, 'utf8').toLowerCase().includes('os name');
        }
    },
    {
        level: 4,
        name: "PowerShell API & Sorting",
        prompt: "استخدم PowerShell للبحث عن أكبر 5 ملفات في مجلد التنزيلات (Downloads) للمستخدم الحالي (لا تتجاوز المجلدات المحمية واستخدم ErrorAction SilentlyContinue)، واحفظ المسارات والأحجام في ملف 'largest_files.json' داخل مجلد 'Chaos_Matrix' الذي يقع على سطح المكتب.",
        verify: () => {
            const file = path.join(desktopPath, 'Chaos_Matrix', 'largest_files.json');
            return fs.existsSync(file) && fs.readFileSync(file, 'utf8').length > 20;
        }
    },
    {
        level: 5,
        name: "Complex File Manipulation (Move/Rename/Delete)",
        prompt: "على سطح المكتب داخل مجلد 'Chaos_Matrix'، أنشئ ملفاً باسم 'temp_target.txt'. ثم انسخ هذا الملف إلى المجلد الفرعي 'Software' (تأكد من استخدام المسار الكامل لسطح المكتب) وسمّه 'renamed_target.txt'. أخيراً، احذف الملف الأصلي 'temp_target.txt'. أخرج إجابتك كـ مصفوفة JSON صالحة تماماً وتم اختبارها بدون أخطاء مطبعية.",
        verify: () => {
            const orig = path.join(desktopPath, 'Chaos_Matrix', 'temp_target.txt');
            const copied = path.join(desktopPath, 'Chaos_Matrix', 'Software', 'renamed_target.txt');
            return !fs.existsSync(orig) && fs.existsSync(copied);
        }
    }
];

async function runTests() {
    await aiOrchestrator.init();

    // Clean slate
    const targetDir = path.join(desktopPath, 'Chaos_Matrix');
    if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
    }

    let successes = 0;

    for (const test of TESTS) {
        console.log(`\n\x1b[33m▶️ INITIATING LEVEL ${test.level}: ${test.name}\x1b[0m`);
        console.log(`[Test] Sending Prompt: ${test.prompt}\n`);

        try {
            const result = await aiOrchestrator.spawnSubagent(test.prompt, `Advanced-Chaos-${test.level}`);
            console.log("\n[LLM Result Debug]:", JSON.stringify(result, null, 2));
            console.log(`\x1b[36m[Escalation Controller] Validating OS State for Level ${test.level}...\x1b[0m`);
            const passed = test.verify();

            if (passed) {
                console.log(`\x1b[32m✅ LEVEL ${test.level} PASSED.\x1b[0m`);
                successes++;
            } else {
                console.error(`\x1b[31m❌ LEVEL ${test.level} FAILED.\x1b[0m`);
                console.log(`Halting matrix. Debug required.`);
                process.exit(1);
            }

            // Sleep 5s to avoid LLM rate limits/overlapping
            await new Promise(r => setTimeout(r, 5000));
        } catch (e) {
            console.error(`\x1b[31m❌ FATAL EXCEPTION on LEVEL ${test.level}:\x1b[0m`, e);
            process.exit(1);
        }
    }

    if (successes === TESTS.length) {
        console.log(`\n\x1b[32m🏁 THE ADVANCED CHAOS MATRIX HAS BEEN FULLY CONQUERED! 🏁\x1b[0m`);
    }
    process.exit(0);
}

runTests();
