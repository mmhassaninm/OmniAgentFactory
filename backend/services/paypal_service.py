"""
PayPal REST API integration for the Money Agent.
Uses PayPal Invoicing v2 and Reporting APIs.
Sandbox by default; set PAYPAL_SANDBOX=false in .env to go live.
"""
import os
import logging
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger(__name__)

_SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
_LIVE_BASE    = "https://api-m.paypal.com"


class PayPalService:
    def __init__(self, client_id: str, client_secret: str, paypal_email: str = "", sandbox: bool = True):
        self.client_id = client_id
        self.client_secret = client_secret
        self.paypal_email = paypal_email
        self.base = _SANDBOX_BASE if sandbox else _LIVE_BASE
        self._token: str | None = None
        self._token_expiry: datetime = datetime.min

    @property
    def _is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    async def get_token(self) -> str:
        """Fetch or reuse an OAuth2 access token."""
        if self._token and datetime.now() < self._token_expiry:
            return self._token
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base}/v1/oauth2/token",
                data={"grant_type": "client_credentials"},
                auth=(self.client_id, self.client_secret),
                timeout=15,
            )
            r.raise_for_status()
            data = r.json()
            self._token = data["access_token"]
            # expires_in is in seconds; refresh a minute early
            self._token_expiry = datetime.now() + timedelta(seconds=data.get("expires_in", 3600) - 60)
            return self._token

    def _auth_headers(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async def create_invoice(
        self,
        client_email: str,
        amount: float,
        service_description: str,
        currency: str = "USD",
    ) -> dict:
        """Create and immediately send a PayPal invoice. Returns invoice metadata."""
        if not self._is_configured:
            return {"error": "PayPal credentials not configured", "invoice_id": None}

        token = await self.get_token()
        headers = self._auth_headers(token)

        invoice_data = {
            "detail": {
                "invoice_number": f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "currency_code": currency,
                "payment_term": {"term_type": "DUE_ON_RECEIPT"},
                "note": "Thank you for your business!",
            },
            "invoicer": {
                "email_address": self.paypal_email or "noreply@omnibot.ai",
            },
            "primary_recipients": [
                {"billing_info": {"email_address": client_email}}
            ],
            "items": [
                {
                    "name": service_description[:100],
                    "quantity": "1",
                    "unit_amount": {"currency_code": currency, "value": f"{amount:.2f}"},
                }
            ],
        }

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                create_r = await client.post(
                    f"{self.base}/v2/invoicing/invoices",
                    json=invoice_data,
                    headers=headers,
                )
                create_r.raise_for_status()
                invoice_href = create_r.json().get("href", "")
                invoice_id = invoice_href.split("/")[-1] if invoice_href else "unknown"

                # Send the invoice
                send_r = await client.post(
                    f"{self.base}/v2/invoicing/invoices/{invoice_id}/send",
                    json={"send_to_invoicer": True},
                    headers=headers,
                )
                send_r.raise_for_status()

            logger.info("[PayPal] Invoice %s sent to %s for $%.2f", invoice_id, client_email, amount)
            return {
                "invoice_id": invoice_id,
                "amount": amount,
                "currency": currency,
                "client_email": client_email,
                "description": service_description,
                "created_at": datetime.now().isoformat(),
            }
        except httpx.HTTPStatusError as e:
            logger.error("[PayPal] Invoice creation failed: %s — %s", e.response.status_code, e.response.text)
            return {"error": str(e), "invoice_id": None}

    async def check_balance(self) -> dict:
        """Return current PayPal account balance."""
        if not self._is_configured:
            return {"error": "PayPal credentials not configured", "balances": []}
        try:
            token = await self.get_token()
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{self.base}/v1/reporting/balances",
                    headers=self._auth_headers(token),
                )
                r.raise_for_status()
                return r.json()
        except Exception as e:
            logger.error("[PayPal] check_balance failed: %s", e)
            return {"error": str(e), "balances": []}

    async def get_recent_payments(self, days: int = 7) -> list:
        """Return completed transactions from the last N days."""
        if not self._is_configured:
            return []
        try:
            token = await self.get_token()
            start = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S-0000")
            end   = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S-0000")
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{self.base}/v1/reporting/transactions",
                    params={
                        "start_date": start,
                        "end_date": end,
                        "transaction_status": "S",
                        "fields": "all",
                        "page_size": 50,
                    },
                    headers=self._auth_headers(token),
                )
                r.raise_for_status()
                return r.json().get("transaction_details", [])
        except Exception as e:
            logger.error("[PayPal] get_recent_payments failed: %s", e)
            return []

    async def total_received(self, days: int = 7) -> float:
        """Sum of all completed incoming payments over the last N days."""
        payments = await self.get_recent_payments(days)
        total = 0.0
        for p in payments:
            try:
                amount = float(
                    p.get("transaction_info", {})
                    .get("transaction_amount", {})
                    .get("value", 0)
                )
                if amount > 0:
                    total += amount
            except (ValueError, TypeError):
                pass
        return total


# ── Singleton ────────────────────────────────────────────────────────────────

def get_paypal_service() -> PayPalService:
    from core.config import get_settings
    s = get_settings()
    return PayPalService(
        client_id=s.paypal_client_id,
        client_secret=s.paypal_client_secret,
        paypal_email=s.paypal_email,
        sandbox=s.paypal_sandbox,
    )
