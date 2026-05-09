def fetch_url(url: str, max_chars: int = 3000) -> str:
    if not url.startswith(("http://", "https://")):
        return "Error: URL must start with http:// or https://"
    try:
        import httpx
        from bs4 import BeautifulSoup
        headers = {"User-Agent": "Mozilla/5.0 (OmniBot/1.0; +https://github.com/omnibot)"}
        with httpx.Client(timeout=8, follow_redirects=True) as client:
            resp = client.get(url, headers=headers)
            resp.raise_for_status()
        ct = resp.headers.get("content-type", "")
        if "html" in ct:
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            lines = [ln for ln in text.splitlines() if ln.strip()]
            text = "\n".join(lines)
        else:
            text = resp.text
        if len(text) > max_chars:
            text = text[:max_chars] + f"\n\n[...truncated at {max_chars} chars. Full length: {len(text)}]"
        return text if text else "(empty page)"
    except Exception as e:
        return f"Fetch error: {e}"
