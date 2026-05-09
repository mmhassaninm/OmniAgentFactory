CONTENT_TEMPLATE = {
    "description": "Content Agent - specialized in generating high-conversion bilingual (Arabic/English) viral copy, Middle Eastern cultural hooks, and monetization CTAs.",
    "code": '''async def execute(input_data):
    """Content Agent — constructs viral campaigns, hooks, and localized copy with monetization anchors."""
    if not input_data:
        return "Please specify a campaign objective, product details, or target audience."

    prompt = str(input_data).lower()
    
    # Simple localization and viral hook logic
    arabic_hook = "🚀 هل أنت جاهز لتحويل أفكارك إلى أرباح حقيقية؟"
    english_hook = "🚀 Ready to convert your brilliant ideas into real scalable revenue?"
    
    if "tech" in prompt or "software" in prompt:
        arabic_body = "نقدم لك OmniBot - المصنع الأول والوحيد للأعوان البرمجية المستقلة بالكامل. دعه يعمل بدلاً عنك على مدار الساعة!"
        english_body = "Meet OmniBot - the ultimate autonomous agent factory that builds, test-drives, and scales digital systems for you 24/7."
    else:
        arabic_body = "حلول ذكية مصممة خصيصاً لتنمية مشاريعك الرقمية بضغطة زر واحدة."
        english_body = "Smart tailored solutions built to amplify your digital presence and cashflow with single-click simplicity."

    viral_hashtags = ["#الذكاء_الاصطناعي", "#ريادة_الأعمال", "#OmniBot", "#NexusOS", "#AI_Startup", "#ArabicTech"]

    return {
        "campaign_objective": "Middle Eastern Digital Viral Scale",
        "language": "Arabic & English (Bilingual)",
        "hooks": {
            "ar": arabic_hook,
            "en": english_hook
        },
        "copy_body": {
            "ar": arabic_body,
            "en": english_body
        },
        "monetization_cta": {
            "ar": "💳 اشترك الآن وابدأ التشغيل الفوري عبر الرابط: {PAYPAL_LINK}",
            "en": "💳 Activate your autonomous pipeline today: {PAYPAL_LINK}"
        },
        "hashtags": viral_hashtags,
        "platforms": ["LinkedIn", "Twitter/X", "Instagram Threads"]
    }
''',
    "test_cases": [
        {"input": "write a viral post launching a new AI SaaS product in Riyadh", "weight": 1.0},
        {"input": "create a sales pitch copy for an online agency", "weight": 1.0},
        {"input": None, "expected": "Please specify a campaign objective, product details, or target audience.", "weight": 0.5},
    ]
}
