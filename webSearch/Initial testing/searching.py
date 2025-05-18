import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

# ========== Step 1: Perform Web Search ==========
def search_duckduckgo(query, max_results=3):
    results = []
    with DDGS() as ddgs:
        for r in ddgs.text(query, max_results=max_results):
            if r.get("href"):
                results.append({
                    "title": r.get("title"),
                    "href": r.get("href")
                })
    return results

# ========== Step 2: Scrape Web Page ==========
def scrape_text_from_url(url):
    try:
        res = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(res.text, "html.parser")
        paragraphs = soup.find_all("p")
        text = "\n".join(p.get_text() for p in paragraphs)
        return text.strip()
    except Exception as e:
        print(f"[!] Failed to scrape {url}: {e}")
        return ""

# ========== Step 3: Query LLM API ==========
def query_llm_with_content(query, context, seed=42):
    api_url = "https://text.pollinations.ai/openai"
    headers = {"Content-Type": "application/json"}

    payload = {
        "model": "openai",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an intelligent web assistant. "
                    "Given some context from webpages, respond accurately and clearly to the user's question."
                    "Respond me in markdown format with proper markdown formatting of the response"
                )
            },
            {"role": "user", "content": f"Question: {query}\n\nWeb Content:\n{context[:4000]}"}
        ],
        "seed": seed
    }

    response = requests.post(api_url, json=payload, headers=headers)
    if response.ok:
        return response.json()["choices"][0]["message"]["content"]
    else:
        print("[!] Error querying LLM:", response.text)
        return "Failed to get response from LLM."

# ========== Step 4: Master Function ==========
def search_scrape_ask(query):
    print(f"🔎 Searching for: {query}")
    results = search_duckduckgo(query)
    
    print(f"📄 Scraping top {len(results)} pages...")
    scraped_data = []
    for r in results:
        text = scrape_text_from_url(r["href"])
        if text:
            scraped_data.append((r["href"], text))

    if not scraped_data:
        return {"error": "No usable content found."}

    print("🧠 Sending to LLM...")
    combined_text = "\n\n".join(t[1] for t in scraped_data)
    answer = query_llm_with_content(query, combined_text)

    print("✅ Done.\n")
    return {
        "question": query,
        "answer": answer,
        "sources": [r[0] for r in scraped_data]
    }

# ========== Entry Point ==========
if __name__ == "__main__":
    user_question = input("Enter your question: ")
    result = search_scrape_ask(user_question)

    if "error" in result:
        print("[❌]", result["error"])
    else:
        print("\n💬 Answer:\n", result["answer"])
        print("\n🔗 Sources:")
        for src in result["sources"]:
            print("-", src)
