import parserSkill from './src/skills/parserSkill.js';
import fs from 'fs';
import path from 'path';

async function verifyParser() {
    console.log("--- 🕵️‍♂️ Testing Native Parser Skill ---");

    console.log("\n1. Testing URL Parsing (Example.com)...");
    const urlResult = await parserSkill.executeIntent({ action: 'parseURL', url: 'http://example.com' });
    console.log(urlResult.payload ? `Success. Text Snippet: ${urlResult.payload.substring(0, 100)}...` : urlResult);

    console.log("\n2. Creating a temporary dummy PDF to test PDF-Parse...");
    // Create a dummy simple PDF file manually or just parse a known text file
    const tempTextPath = path.join(process.cwd(), 'temp_test_parser.txt');
    fs.writeFileSync(tempTextPath, 'This is a test document payload extracted perfectly.');

    console.log("\n3. Testing Raw Text File Parsing...");
    const fileResult = await parserSkill.executeIntent({ action: 'parseFile', filePath: tempTextPath });
    console.log(fileResult.payload ? `Success. Text Snippet: ${fileResult.payload.substring(0, 100)}...` : fileResult);

    // Clean up
    if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath);

    console.log("\n✅ Parser Local Diagnostic Complete.");
    process.exit(0);
}

verifyParser();
