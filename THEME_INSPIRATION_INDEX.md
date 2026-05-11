# 🎨 THEME INSPIRATION INDEX
> مصدر الإلهام الدائم لـ Theme Generator Agent
> Generated: 2026-05-10 | Source Themes Analyzed: 2

---

## 📦 الثيمات المتاحة في المشروع

| الاسم | المسار | النوع | الغرض |
|---|---|---|---|
| **Glimmer (Stiletto v5.0.1)** | `backend/shopify/templates/Glimmer/` | Reference Theme | مصدر الإلهام التصميمي |
| **base_theme** | `backend/shopify/templates/base_theme/` | Generation Skeleton | الهيكل الأساسي للجيل |

---

## 🌟 THEME 1: Glimmer (Stiletto v5.0.1 by Fluorescent)

### المعلومات الأساسية

```
الاسم:       Stiletto v5.0.1
المطوّر:     Fluorescent Design Inc.
التوثيق:     https://help.fluorescent.co/v/stiletto
الشراء:      https://themes.shopify.com/themes/stiletto/
```

### 🖋️ نظام الخطوط

الثيم يستخدم **PingAR LT** — خط عربي احترافي بـ 8 أوزان:
| Weight | Files |
|---|---|
| Hairline | PingARLT-Hairline.woff2 |
| ExtraLight | PingARLT-ExtraLight.woff/woff2 |
| Thin | PingARLT-Thin.woff/woff2 |
| Light | PingARLT-Light.woff/woff2 |
| Regular | PingARLT-Regular.woff/woff2 |
| Medium | PingARLT-Medium.woff/woff2 |
| Bold | PingARLT-Bold.woff/woff2 |
| Black | PingARLT-Black.woff/woff2 |
| Heavy | PingARLT-Heavy.woff/woff2 |

**درس للـ Theme Generator:** دعم RTL/عربي بخط متخصص هو عامل تمييز قوي جداً في سوق Shopify العربي.

---

### 🎨 نظام الألوان (من settings_schema.json)

```json
color_background_body: "#ffffff"    // خلفية الصفحة
color_text_link: "#000"             // الروابط
color_text: "#111111"               // النص الأساسي
color_border: "#AAAAAA"             // الحدود
color_header_text: [custom]         // نص الهيدر
```

**Pattern:** نظام ألوان متغير بالكامل عبر Settings Schema — أي Theme Generated يجب أن يُعرّف على الأقل 8-10 CSS variables قابلة للتخصيص.

---

### 📐 مكتبات JavaScript المستخدمة

| المكتبة | الملف | الغرض |
|---|---|---|
| **Swiper** | `swiper-chunk.js` | سلايدرات وعروض المنتجات |
| **PhotoSwipe** | `photoswipe-chunk.js` | عارض صور Lightbox |
| **noUiSlider** | `nouislider-chunk.js` | فلاتر الأسعار slider |
| **Polyfill Inert** | `polyfill-inert-chunk.js` | دعم القوائم المنسدلة |
| **Custom Events** | `custom-events.js` | نظام أحداث مخصص |
| **Search Translations** | `search-translations.js` | بحث متعدد اللغات |

**Pattern:** لا تستخدم jQuery — كل شيء Vanilla JS + Web Components.

---

### 📄 79 Section متاحة في Glimmer

#### الهيدر والفوتر
- `header.liquid`, `header-group.json`
- `footer.liquid`, `footer-group.json`
- `announcement-bar.liquid`

#### Hero Sections (أقسام البطولة)
- `image-hero.liquid` — صورة بطل كاملة
- `image-hero-split.liquid` — صورة بطل مقسومة
- `image-with-text.liquid` — صورة مع نص
- `image-with-text-split.liquid` — تقسيم أفقي

#### Product Sections (أقسام المنتجات)
- `featured-product.liquid` — منتج مميز
- `featured-collection-grid.liquid` — شبكة مجموعة
- `featured-collection-slider.liquid` — سلايدر مجموعة
- `collection-list-grid.liquid` — شبكة مجموعات
- `collection-list-slider.liquid` — سلايدر مجموعات
- `complete-the-look.liquid` — "أكمل اللوك" (cross-sell)

#### Interactive/Engaging Sections
- `countdown-banner.liquid` — بانر عد تنازلي
- `countdown-bar.liquid` — شريط عد تنازلي
- `gallery-carousel.liquid` — معرض دوار
- `image-compare.liquid` — مقارنة صور (قبل/بعد)
- `events.liquid` — الفعاليات

#### Content Sections
- `blog-posts.liquid` — مقالات المدونة
- `collapsible-row-list.liquid` — أسئلة شائعة
- `contact-form.liquid` — نموذج اتصال
- `custom-about-section.liquid` — قسم "عن الشركة"
- `custom-liquid.liquid` — كود Liquid مخصص
- `grid.liquid` — شبكة عامة
- `apps.liquid` — تضمين تطبيقات

#### وبالإضافة:
- `main-404.liquid` — صفحة 404 مخصصة
- `main-all-brands.liquid` — جميع العلامات التجارية
- `main-article.liquid` — قالب المقالة
- ...و54 section أخرى

---

### 🌍 دعم اللغات (Locales)

| اللغة | الملف |
|---|---|
| English (Default) | `en.default.json`, `en.default.schema.json` |
| Arabic | `ar.json`, `ar-SA.json` |
| French | `fr.json`, `fr.schema.json` |
| German | `de.json`, `de.schema.json` |
| Spanish | `es.json`, `es.schema.json` |
| Italian | `it.json`, `it.schema.json` |

**درس للـ Theme Generator:** الثيمات المتعددة اللغات (خاصة العربية) تحقق نتائج أفضل في السوق العربي.

---

### 🏗️ بنية الملفات (Shopify OS 2.0)

```
Glimmer/
├── assets/         ← CSS, JS, fonts (minified + map files)
├── config/
│   ├── settings_schema.json  ← 12+ مجموعة إعدادات
│   └── settings_data.json    ← القيم الافتراضية
├── layout/
│   ├── theme.liquid    ← القالب الرئيسي (head/body wrapper)
│   └── password.liquid ← قالب صفحة كلمة المرور
├── locales/         ← 6 لغات
├── sections/        ← 79 section
├── snippets/        ← مكونات صغيرة قابلة للإعادة
└── templates/       ← JSON templates (OS 2.0)
```

---

### ✨ أنماط التصميم المستخرجة

#### Pattern 1: المبنى المعياري (Modular Architecture)
كل section مستقلة تماماً — لها CSS خاصة، إعدادات schema، وJS. لا تعتمد على أخواتها.

#### Pattern 2: CSS Variables System
```css
:root {
  --color-body: {{ settings.color_background_body }};
  --color-text: {{ settings.color_text }};
  --font-body-family: {{ settings.type_body_font.family }};
}
```
كل شيء يمر عبر CSS variables — سهولة التخصيص اللامتناهية.

#### Pattern 3: Progressive Loading
JavaScript deferred + CSS مقسّم (theme.css, theme-deferred.css) — أداء محسّن.

#### Pattern 4: Schema-Driven Customization
كل section لها `{% schema %}` block يُعرّف كل إعداد قابل للتخصيص في Shopify Editor.

#### Pattern 5: Responsive Mobile-First
كل section لها breakpoints واضحة — التصميم يبدأ من الموبايل.

---

## 🦴 THEME 2: base_theme (Generation Skeleton)

### المعلومات الأساسية
الهيكل الأساسي الذي يبني عليه Theme Generator Agent أي ثيم جديد.

### الملفات الموجودة

```
base_theme/
├── assets/
│   ├── theme.css    ← CSS الأساسية (ليست ثرية مثل Glimmer)
│   └── theme.js     ← JS الأساسية
├── config/
│   ├── settings_schema.json  ← 13 مجموعة إعدادات (محدّثة مؤخراً)
│   └── settings_data.json    ← 5 presets ألوان
├── layout/
│   ├── theme.liquid    ← layout أساسي
│   └── password.liquid
├── locales/
│   ├── en.default.json
│   └── ar.json         ← دعم عربي
├── sections/
│   └── .gitkeep        ← ⚠️ فارغ! لا توجد sections جاهزة
├── snippets/
│   ├── icon-cart.liquid
│   ├── icon-search.liquid
│   ├── meta-tags.liquid
│   ├── pagination.liquid
│   └── price.liquid
└── templates/         ← JSON templates أساسية
```

### ⚠️ ملاحظة مهمة
`sections/` **فارغ** (`.gitkeep` فقط) — الـ Theme Generator يُنشئ كل السections من الصفر مع كل ثيم جديد. هذا يعني أن Glimmer لا يُستخدم كمرجع تصميمي بل فقط base_theme كهيكل.

### الـ Settings Schema الموجودة (13 مجموعة)
1. theme_info, 2. colors, 3. typography, 4. layout, 5. buttons,
6. social_media, 7. cart, 8. animations, 9. search,
10. currency, 11. header_settings, 12. footer_settings, 13. product_cards

---

## 💡 توصيات لـ Theme Generator Agent

### الأولوية القصوى — استخدام Glimmer كمرجع فعلي

```python
# في liquid_developer.py — أضف هذا:
def _load_glimmer_inspiration() -> dict:
    glimmer_path = Path("shopify/templates/Glimmer/sections/")
    inspiration = {}
    
    # استخرج sections المهمة كمرجع
    key_sections = [
        "image-hero.liquid",
        "featured-collection-grid.liquid", 
        "countdown-banner.liquid",
        "complete-the-look.liquid",
        "image-compare.liquid"
    ]
    
    for section_file in key_sections:
        path = glimmer_path / section_file
        if path.exists():
            content = path.read_text(encoding="utf-8")
            # خذ أول 50 سطر كـ pattern reference
            inspiration[section_file] = "\n".join(content.split("\n")[:50])
    
    return inspiration
```

### الأولوية العالية — استخرج Design Patterns من Glimmer

| Pattern | الدرس من Glimmer |
|---|---|
| **Counter/Timer** | استخدم `countdown-banner.liquid` كمرجع |
| **Product Showcase** | `complete-the-look.liquid` للـ cross-sell |
| **Image Compare** | `image-compare.liquid` لتجربة قبل/بعد |
| **Collection Layout** | كلاهما Grid و Slider متاح |
| **Arabic Font** | PingAR LT إذا الثيم عربي |
| **CSS Variables** | كل لون/خط عبر CSS variables |
| **Lazy Loading** | JS deferred كما في Glimmer |

---

## 🌐 مصادر الإلهام الخارجية (للاستخدام المستقبلي)

| المصدر | الرابط | ما تجده |
|---|---|---|
| Shopify Theme Store | themes.shopify.com | ثيمات رسمية |
| Themeforest | themeforest.net/category/shopify | ثيمات متميزة |
| Awwwards | awwwards.com | تصميم ويب متقدم |
| Dribbble | dribbble.com/tags/shopify | تصاميم UI |
| Behance | behance.net | مشاريع تصميم كاملة |

---

## 📋 خلاصة الإلهام

```
ما يجب أن يعرفه Theme Generator Agent:

1. الهيكل: ابنِ على base_theme skeleton
2. الإلهام: استخرج patterns من Glimmer/sections/
3. التمييز: خط PingAR للعربية + CSS variables للتخصيص
4. الجودة: كل section يجب أن يكون modular مع schema كامل
5. الأداء: JS deferred, CSS split, responsive mobile-first
6. التنوع: لا تنسخ ثيماً واحداً — امزج من مصادر متعددة
7. اللغات: دائماً en + ar كحد أدنى
```
