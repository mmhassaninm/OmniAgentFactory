from core.config import get_settings


def get_payment_message(service_name: str, price: int = None) -> str:
    config = get_settings()
    p = price or config.default_service_price
    link = config.paypal_me_link
    if not link:
        return f"Service: {service_name} — Payment link not configured yet."
    return (
        f"✅ {service_name} is ready!\n\n"
        f"💳 Payment: {link}/{p}\n"
        f"📦 I'll deliver within 1 hour of payment confirmation.\n"
        f"Questions? Just reply here."
    )


def get_service_pitch(service_type: str, sample: str) -> str:
    return (
        f"👋 Hi! Here's a free sample of {service_type} I prepared:\n\n"
        f"{sample}\n\n"
        f"Want the full version? Reply and I'll send details + pricing."
    )


def is_revenue_mode() -> bool:
    return get_settings().revenue_mode
