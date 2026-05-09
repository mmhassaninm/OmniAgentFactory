import githubSkill from './src/skills/githubSkill.js';

async function verifyGithub() {
    console.log("--- 🐙 Testing Native GitHub Skill ---");

    console.log("\n1. Running API Query (Whoami)...");
    const whoami = await githubSkill.executeIntent({ action: 'runAPIQuery', query: 'user' });
    console.log(whoami.payload ? whoami.payload.substring(0, 100) + '...' : whoami);

    console.log("\n2. Listing PRs for mmhassanin/NexusOS-main...");
    const prs = await githubSkill.executeIntent({ action: 'listPRs', repo: 'mmhassanin/NexusOS-main' });
    console.log(prs.payload ? prs.payload : prs);

    console.log("\n3. Listing Issues for mmhassanin/NexusOS-main...");
    const issues = await githubSkill.executeIntent({ action: 'listIssues', repo: 'mmhassanin/NexusOS-main' });
    console.log(issues.payload ? issues.payload : issues);

    console.log("\n✅ GitHub Local Diagnostic Complete.");
    process.exit(0);
}

verifyGithub();
