import requests
import threading
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from json import loads
from time import sleep
from datetime import datetime

MAX_RETRIES = 3

# ========= LLM Utilities =========

def query_llm(messages, seed=42):
    api_url = "https://text.pollinations.ai/openai"
    payload = {
        "model": "openai",
        "messages": messages,
        "seed": seed
    }
    res = requests.post(api_url, json=payload, headers={"Content-Type": "application/json"})
    if res.ok:
        return res.json()["choices"][0]["message"]["content"]
    else:
        print("[!] LLM Error:", res.text)
        return ""

# ========= Web Scraping =========

def scrape_text_from_url(url, headers=None):
    try:
        res = requests.get(url, timeout=10, headers=headers or {"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(res.text, "html.parser")
        paragraphs = soup.find_all("p")
        text = "\n".join(p.get_text() for p in paragraphs)
        return text.strip()
    except Exception as e:
        print(f"[!] Scrape failed {url}: {e}")
        return ""

# ========= Intent Decomposition =========

def classify_and_split_query(full_query):
    prompt = f"""
You are a query understanding agent. Your job is to:
1. Understand the user's intent.
2. Split it into atomic sub-queries if necessary.
3. Classify each sub-query as 'local' (LLM-answerable) or 'web' (needs online search).
4. Identify and propagate context such as location, time, and topical focus.

Respond strictly in JSON:
{{
  "context": "...",
  "intents": [
    {{"query": "...", "type": "local|web"}},
    ...
  ]
}}

Query: "{full_query}"
"""
    messages = [
        {"role": "system", "content": "You are a context-aware query decomposition engine."},
        {"role": "user", "content": prompt}
    ]
    try:
        response = query_llm(messages)
        return loads(response)
    except:
        return {"context": "", "intents": [{"query": full_query, "type": "web"}]}

# ========= Local Query Handler =========

def answer_local(query):
    messages = [
        {"role": "system", "content": "Answer the user's question directly and concisely. Do not perform any web search."},
        {"role": "user", "content": query}
    ]
    return query_llm(messages)

# ========= Web Search Handler =========

def deep_search_agent(query, geo_headers=None):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"🔎 [Attempt {attempt}] Searching: {query}")
            with DDGS() as ddgs:
                results = [r for r in ddgs.text(query, max_results=3) if r.get("href")]

            if not results:
                print("[!] No results, retrying with LLM rephrased query...")
                rephrased_query = query_llm([
                    {"role": "system", "content": "You are an assistant that rephrases vague or failed search queries."},
                    {"role": "user", "content": f"Rephrase this for web search: {query}"}
                ])
                query = rephrased_query
                continue

            full_text = ""
            for r in results:
                txt = scrape_text_from_url(r["href"], headers=geo_headers)
                if txt:
                    full_text += txt + "\n\n"
            if full_text.strip():
                return full_text.strip(), [r["href"] for r in results]
        except Exception as e:
            print("[!] Deep search error:", e)
        sleep(1)
    return "", []

# ========= Threaded Intent Processor =========

def process_intent(intent, context_str, results_store, geo_headers=None):
    query = intent["query"]
    intent_type = intent["type"]
    full_query = f"{query}. Context: {context_str}" if context_str else query

    if intent_type == "local":
        print(f"💡 Local intent: {query}")
        results_store.append((query, answer_local(full_query), []))
    else:
        content, sources = deep_search_agent(full_query, geo_headers=geo_headers)
        if content:
            results_store.append((query, content, sources))

# ========= Summarizer =========

def answer_combined_query(original_query, all_contexts, access_time):
    combined_text = "\n\n".join([ctx for _, ctx, _ in all_contexts if ctx.strip()])
    messages = [
        {"role": "system", "content": "You are a summarizer. Use the provided context and access time to answer the question thoroughly."},
        {"role": "user", "content": f"""
Original Question: {original_query}
Accessed On: {access_time}

Context:
{combined_text[:4000]}
"""}
    ]
    return query_llm(messages)

# ========= Master Function =========

def smart_search_agent_pipeline(full_query):
    print(f"\n🧠 Parsing and classifying: {full_query}")
    parsed = classify_and_split_query(full_query)
    intents = parsed.get("intents", [])
    context_str = parsed.get("context", "")
    access_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    threads = []
    results = []

    geo_headers = {
        "User-Agent": "Mozilla/5.0",
        "X-Forwarded-For": "auto",
        "Accept-Language": "en-IN,en;q=0.9"
    }

    for intent in intents:
        t = threading.Thread(target=process_intent, args=(intent, context_str, results, geo_headers))
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    if not results:
        return {"error": "Nothing could be answered."}

    final_answer = answer_combined_query(full_query, results, access_time)

    return {
        "question": full_query,
        "answer": final_answer,
        "sources": [src for _, _, srcs in results for src in srcs]
    }

# ========= Entry =========

if __name__ == "__main__":
    user_q = input("Enter your question: ")
    result = smart_search_agent_pipeline(user_q)

    if "error" in result:
        print("[❌]", result["error"])
    else:
        print("\n💬 Answer:\n", result["answer"])
        print("\n🔗 Sources:")
        for src in result["sources"]:
            print("-", src)
