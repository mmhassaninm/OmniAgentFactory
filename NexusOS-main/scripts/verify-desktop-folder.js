import fs from 'fs';
import path from 'path';

const targetDir = 'C:\\Users\\Mostafa\\Desktop\\Amira Emad';
const targetFile = path.join(targetDir, 'Nexus_Audit.txt');

console.log('═════════════════════════════════════════════════════');
console.log('  🔍 PHYSICAL OS VERIFICATION (PHASE 60)');
console.log('═════════════════════════════════════════════════════');
console.log(`▸ Checking Directory: ${targetDir}`);

if (fs.existsSync(targetDir)) {
    console.log(`✅ SUCCESS: Directory physically exists on host OS!`);
} else {
    console.log(`❌ FAIL: Directory not found.`);
    process.exit(1);
}

console.log(`▸ Checking File: ${targetFile}`);
if (fs.existsSync(targetFile)) {
    console.log(`✅ SUCCESS: File physically exists on host OS!`);
    const content = fs.readFileSync(targetFile, 'utf8');
    console.log(`📝 Content: ${content}`);
} else {
    console.log(`❌ FAIL: File not found inside directory.`);
    process.exit(1);
}

console.log('\n✅ VERIFICATION COMPLETE: OpenClaw Subagent successfully manipulated physical OS outside sandbox.');
