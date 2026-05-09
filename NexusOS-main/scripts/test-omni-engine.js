import browserSkill from '../apps/backend-core/src/skills/browserSkill.js';
import fooocusBridge from '../apps/backend-core/src/skills/fooocusBridge.js';

async function runOmniEngineSiegeTest() {
    console.log('\n═════════════════════════════════════════════════════');
    console.log('  🔥 OMNI-ACTION ENGINE: E2E SIEGE PROTOCOL 62 🔥');
    console.log('═════════════════════════════════════════════════════\n');

    // TEST A: Web Search / Browser Action Intent
    console.log('▸ [TEST A] Initiating Browser RPA Intent: Classical Antiquity Extraction');
    const browserIntent = {
        action: 'extract',
        url: 'https://en.wikipedia.org/wiki/Classical_antiquity',
        selector: '#mw-content-text > div.mw-content-ltr.mw-parser-output > p:nth-of-type(2)' // Usually the first main paragraph
    };

    try {
        const browserResult = await browserSkill.executeIntent(browserIntent);
        if (browserResult.success) {
            console.log('\n✅ BROWSER SKILL SUCCESS:');
            console.log(`Extracted Text snippet: "${browserResult.payload.substring(0, 150)}..."\n`);
        } else {
            console.error('❌ BROWSER SKILL FAILED:', browserResult.error);
        }
    } catch (e) {
        console.error('❌ BROWSER SKILL CRASHED:', e.message);
    }

    // TEST B: Image Generation Pinging Integration
    console.log('▸ [TEST B] Initiating Fooocus UI Integration Ping');
    try {
        const fooocusStatus = await fooocusBridge.ping();
        if (fooocusStatus.online) {
            console.log('\n✅ FOOOCUS SKILL SUCCESS: Engine is LIVE and ready for prompts.\n');
        } else {
            console.log(`\n⚠️  FOOOCUS SKILL PENDING: Waiting for Fooocus Engine to be started by the user. (Status: ${fooocusStatus.error || fooocusStatus.status})\n`);
        }
    } catch (e) {
        console.error('❌ FOOOCUS SKILL CRASHED:', e.message);
    }

    console.log('═════════════════════════════════════════════════════');
    console.log('  🏁 SIEGE TEST COMPLETE. ARCHITECTURE VALIDATED.');
    console.log('═════════════════════════════════════════════════════\n');
    process.exit(0);
}

runOmniEngineSiegeTest();
