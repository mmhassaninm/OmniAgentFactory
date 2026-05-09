import httpx
from bs4 import BeautifulSoup
import asyncio

class SearchEngine:
    @staticmethod
    async def fetch_page_text(url: str, client: httpx.AsyncClient) -> str:
        """Helper robust fetcher for full page text."""
        try:
            res = await client.get(url, timeout=5.0, follow_redirects=True)
            res.raise_for_status()
            soup = BeautifulSoup(res.text, "html.parser")
            
            # Extreme minification for local LLM context budgets
            for element in soup(["script", "style", "nav", "footer", "header", "aside", "svg", "button", "iframe"]):
                element.decompose()
                
            text = soup.get_text(separator=' ', strip=True)
            # Rough compression to save VRAM (max ~800 chars per page)
            return text[:800]
        except Exception as e:
            return f"[Extraction Failed: {str(e)}]"

    @staticmethod
    async def search_duckduckgo(query: str, limit: int = 3, deep_scrape: bool = True) -> str:
        url = "https://html.duckduckgo.com/html/"
        import random
        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
            "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0"
        ]
        headers = {
            "User-Agent": random.choice(user_agents),
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        }
        
        try:
            async with httpx.AsyncClient(headers=headers) as client:
                res = await client.post(url, data={"q": query}, timeout=10.0)
                res.raise_for_status()
                soup = BeautifulSoup(res.text, "html.parser")
                
                results = []
                # Fetch up to 'limit' URLs
                for a in soup.find_all("a", class_="result__url"):
                    if len(results) >= limit:
                        break
                        
                    url = a['href']
                    if url.startswith('//'):
                        url = 'https:' + url
                        
                    title_tag = a.parent.find("a", class_="result__a")
                    snippet_tag = a.parent.find("a", class_="result__snippet")
                    
                    entry = {
                        "title": title_tag.text.strip() if title_tag else "No Title",
                        "url": url,
                        "snippet": snippet_tag.text.strip() if snippet_tag else "No Snippet",
                        "full_text": ""
                    }
                    results.append(entry)

                if not results:
                     return "STRICT_NO_DATA: No results found for query."

                if deep_scrape:
                    # Parallel scraping of found URLs
                    tasks = [SearchEngine.fetch_page_text(res['url'], client) for res in results]
                    extracted_texts = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    for i, text in enumerate(extracted_texts):
                        if isinstance(text, str) and not text.startswith("[Extraction Failed"):
                            results[i]['full_text'] = text
                        else:
                             results[i]['full_text'] = getattr(text, 'message', str(text))
                             
                # Format output for LLM consumption
                formatted_output = ""
                for i, r in enumerate(results):
                    formatted_output += f"--- Source {i+1} ---\n"
                    formatted_output += f"Title: {r['title']}\nURL: {r['url']}\n"
                    formatted_output += f"Snippet: {r['snippet']}\n"
                    if deep_scrape and r['full_text']:
                        formatted_output += f"Extracted Content:\n{r['full_text']}...\n"
                    formatted_output += "\n"
                    
                return formatted_output
                
        except Exception as e:
            print(f"[SearchEngine] Failed DDG Scrape: {e}")
            return f"STRICT_NO_DATA [Error: {str(e)}]"

search_duckduckgo = SearchEngine.search_duckduckgo
