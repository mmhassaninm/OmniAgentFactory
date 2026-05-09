import mediaSkill from './src/skills/mediaSkill.js';

async function verifyMedia() {
    console.log("--- 🎵 Testing Native Media & Audio Skill ---");

    console.log("\n1. Testing 'mute' virtual keycode...");
    const muteResult = await mediaSkill.executeIntent({ action: 'mute' });
    console.log(muteResult);

    console.log("\n2. Waiting 2 seconds, then unmuting...");
    setTimeout(async () => {
        const unmuteResult = await mediaSkill.executeIntent({ action: 'mute' });
        console.log(unmuteResult);

        console.log("\n3. Testing 'volumeDown' virtual keycode (decrease by 2)...");
        await mediaSkill.executeIntent({ action: 'volumeDown' });
        const volResult = await mediaSkill.executeIntent({ action: 'volumeDown' });
        console.log(volResult);

        console.log("\n✅ Media Local Diagnostic Complete.");
        process.exit(0);
    }, 2000);
}

verifyMedia();
