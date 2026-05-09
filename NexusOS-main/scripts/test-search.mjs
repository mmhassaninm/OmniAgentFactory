import { performSearch } from '../apps/nexus-desktop/src/services/searchEngine.js';

async function test() {
    // Test 1: The EXACT query the user used that failed before
    console.log('=== TEST 1: User\'s exact query (Reddit + AI tools) ===');
    const q1 = 'عايزك تبحث على ريديت وتشوف اية اكتر اداة فى الذكاء الاصطناعى دلوقتى اقدر استخدمها على جهازى زى Chatgpt كده';
    const r1 = await performSearch(q1, 'Normal', 'ar');
    console.log(`Results: ${r1.results.length} | Duration: ${r1.duration}ms`);
    if (r1.context) console.log('Context (300 chars):', r1.context.substring(0, 300));
    else console.log('❌ No context!');

    // Test 2: Arabic-only query about AI image tools
    console.log('\n=== TEST 2: Arabic AI image tools query ===');
    const q2 = 'عايزك تبحث على ريديت وتشوف اية اكتر اداة منتشرة اليومين دول لتوليد الصور بالذكاء الاصطناعى';
    const r2 = await performSearch(q2, 'Normal', 'ar');
    console.log(`Results: ${r2.results.length} | Duration: ${r2.duration}ms`);
    if (r2.context) console.log('Context (300 chars):', r2.context.substring(0, 300));
    else console.log('❌ No context!');

    // Test 3: Pure Arabic search about latest news
    console.log('\n=== TEST 3: Arabic AI developments 2025 ===');
    const q3 = 'ما هي آخر التطورات في مجال الذكاء الاصطناعي في عام 2025؟';
    const r3 = await performSearch(q3, 'Normal', 'ar');
    console.log(`Results: ${r3.results.length} | Duration: ${r3.duration}ms`);
    if (r3.context) console.log('Context (300 chars):', r3.context.substring(0, 300));
    else console.log('❌ No context!');
}
test();
