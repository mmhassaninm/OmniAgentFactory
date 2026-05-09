import openClawBridge from '../apps/backend-core/src/services/openClawBridge.js';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

async function runAntigravityLoop() {
    console.log("🚀 INITIALIZING ANTIGRAVITY INFINITE LOOP...");

    let isStable = false;
    let currentTask = "قم بفحص ملفات المشروع الأساسية، تأكد من عدم وجود أخطاء في الـ IPC Router، وقم بتشغيل اختبارات النظام.";
    let iteration = 1;

    while (!isStable) {
        console.log(`\n=== 🔄 الدورة رقم: ${iteration} ===`);

        // 1. إرسال المهمة أو الخطأ للوكيل
        const result = await openClawBridge.spawnLocalSubagent(currentTask);
        const agentResponse = result.response || result.payload || JSON.stringify(result);

        // 2. فحص شرط التوقف
        if (agentResponse.includes("[SYSTEM_STABLE_OMNI_LOOP_TERMINATE]")) {
            console.log("✅ نظام NexusOS مستقر بالكامل. تم إيقاف حلقة Antigravity.");
            isStable = true;
            break;
        }

        // 3. استخراج الكود التنفيذي (PowerShell)
        const codeMatch = agentResponse.match(/```powershell\n([\s\S]*?)\n```/);

        if (codeMatch && codeMatch[1]) {
            const psScript = codeMatch[1];
            console.log("⚡ جاري تنفيذ كود Antigravity...");

            try {
                // 4. تنفيذ الكود فعلياً على النظام
                const { stdout, stderr } = await execPromise(psScript, { shell: 'powershell.exe' });

                // 5. تغذية النتيجة للوكيل في الدورة القادمة
                currentTask = `نجح التنفيذ. المخرجات:\n${stdout.substring(0, 1000)}\nحدد الخطوة التالية للإصلاح أو اكتب [SYSTEM_STABLE_OMNI_LOOP_TERMINATE].`;

            } catch (error) {
                // 6. في حالة الخطأ، إرسال الخطأ للوكيل لتصحيحه (Self-Healing)
                console.log("⚠️ حدث خطأ أثناء التنفيذ. جاري تمريره لـ Antigravity ليعالجه...");
                currentTask = `فشل الأمر السابق. هذا هو الخطأ:\n${error.message}\nقم بتحليل الخطأ وكتابة كود PowerShell جديد لإصلاحه. لا تكرر نفس الأمر.`;
            }
        } else {
            console.log("⚠️ الوكيل لم يُخرج كود PowerShell سليم. جاري إجباره...");
            currentTask = "أنت لم تخرج كود بصيغة ```powershell```. أعد المحاولة فوراً بالكود فقط.";
        }

        iteration++;
    }
}

runAntigravityLoop();
