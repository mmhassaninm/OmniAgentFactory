FREELANCE_TEMPLATE = {
    "description": "Freelance Agent - specialized in scraping simulated project boards, matching project scopes, and auto-bidding in Arabic & English.",
    "code": '''async def execute(input_data):
    """Freelance Agent — processes board requests, filters projects, and compiles winning proposals."""
    if not input_data:
        return "Please specify your freelancing skill set or board target constraints."

    skills = str(input_data).lower()
    
    # Simulated project scraping match
    simulated_projects = [
        {
            "id": "proj_01",
            "title": "تصميم موقع متجر إلكتروني متكامل",
            "budget": "500$ - 1000$",
            "required_skills": "react, styling, ui",
            "description": "مطلوب مهندس واجهات خبير لتصميم متجر إلكتروني ذكي وسريع متوافق مع كافة الأجهزة."
        },
        {
            "id": "proj_02",
            "title": "كتابة محتوى ترويجي باللغتين العربية والإنجليزية",
            "budget": "150$ - 300$",
            "required_skills": "writing, content, copy",
            "description": "نبحث عن كاتب مبدع لكتابة منشورات سوشيال ميديا وحملات تسويقية مبتكرة."
        }
    ]
    
    matched = []
    for proj in simulated_projects:
        # Check if any skill overlaps
        matched_skills = [s.strip() for s in proj["required_skills"].split(",") if s.strip() in skills]
        if matched_skills or "all" in skills or "any" in skills:
            # Build Arabic Bid proposal
            bid_pitch = f"""السلام عليكم ورحمة الله وبركاته،

قرأت تفاصيل مشروعكم الكريم: "{proj["title"]}" وأنا مهتم جداً بتقديمه بأعلى معايير الجودة والسرعة.
بصفتي خبيراً مستقلاً أمتلك مهارات قوية في {proj["required_skills"].upper()}، أضمن لكم:
- كوداً نظيفاً ومتجاوباً بالكامل.
- تصميم عصري وفاخر يجذب عملائكم.
- تسليم دقيق وفي الموعد المتفق عليه.

يمكننا البدء فوراً. تفضلوا بالاطلاع على معرض أعمالي، والبدء الآمن عبر الرابط: {{PAYPAL_LINK}}

تحياتي،
عامل OmniBot المستقل"""
            
            matched.append({
                "project_id": proj["id"],
                "project_title": proj["title"],
                "budget": proj["budget"],
                "pitch_proposal": bid_pitch
            })

    if not matched:
        return {
            "status": "idle",
            "reason": f"No high-confidence projects matching skills: {skills} on current job boards.",
            "bids_submitted": 0
        }

    return {
        "status": "bidding_active",
        "matched_jobs_count": len(matched),
        "submitted_proposals": matched,
        "average_budget": "Saudi Riyal/USD pegged",
        "estimated_payout_potential_usd": sum(float(p["budget"].split("-")[-1].replace("$","").strip()) for p in matched)
    }
''',
    "test_cases": [
        {"input": "React and UI styling", "weight": 1.0},
        {"input": "content writing and copy translation", "weight": 1.0},
        {"input": None, "expected": "Please specify your freelancing skill set or board target constraints.", "weight": 0.5},
    ]
}
