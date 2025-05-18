import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from json import loads, JSONDecodeError
from time import sleep
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm
import re
import sys 

# ========= Configuration =========
MAX_RETRIES = 3
MAX_WORKERS = 10 # Workers for concurrent search & scraping
SEARCH_TIMEOUT = 10 # seconds for individual search/scrape
LLM_TIMEOUT = 60 # seconds for LLM calls
MAX_INITIAL_SEARCH_QUERIES = 3 # Number of initial text queries to run
MAX_TEXT_RESULTS_PER_QUERY = 5 # Number of text search results to consider scraping per query
MAX_SCRAPED_CHARS_PER_PAGE = 4000 # Limit text per page before processing
MAX_TOTAL_SCRAPED_CHARS = 20000 # Limit total text fed into the final synthesis LLM
MAX_TOTAL_IMAGES = 3 # Max total images to collect across all scrapes (Set to 3 as requested)

# ========= Utilities =========

def query_llm(messages, seed=42, timeout=LLM_TIMEOUT):
    """Robust LLM query function with retries."""
    api_url = "https://text.pollinations.ai/openai"
    payload = {
        "model": "openai",
        "messages": messages,
        "seed": seed
    }
    headers = {"Content-Type": "application/json"}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            res = requests.post(api_url, json=payload, headers=headers, timeout=timeout)
            res.raise_for_status()
            return res.json()["choices"][0]["message"]["content"]
        except requests.exceptions.Timeout:
            pass
        except requests.exceptions.RequestException as e:
            pass
        except KeyError:
            # print("Response:", res.text) # Commented out debug print
            return ""
        sleep(2 ** attempt)
    return ""

def scrape_text_from_url(url, headers=None, timeout=SEARCH_TIMEOUT, max_chars=None):
    """Scrapes text from a URL with robustness, optional character limit, and attempts to find image URLs."""
    headers = headers or {"User-Agent": "Mozilla/5.0 (compatible; OpenSearchAgent/1.6; +https://github.com/example/opensearchagent)"} # Updated UA slightly for clarity
    max_chars = max_chars if max_chars is not None else MAX_SCRAPED_CHARS_PER_PAGE

    try:
        res = requests.get(url, timeout=timeout, headers=headers)
        res.raise_for_status()

        content_type = res.headers.get('Content-Type', '').lower()
        if not 'text/html' in content_type:
            return "", [] # Return text and image_urls

        soup = BeautifulSoup(res.text, "html.parser")

        for script_or_style in soup(["script", "style"]):
            script_or_style.decompose()
        for nav in soup(["nav", "header", "footer", "aside", "form", "button", "noscript", "svg", "canvas"]): 
             nav.decompose()

        image_urls_found = []
        for img_tag in soup.find_all('img', src=True):
            img_src = img_tag['src']
            if img_src.startswith('http') or img_src.startswith('//'):
                 if 'logo' not in img_src.lower() and 'icon' not in img_src.lower():
                      # Try to make relative URLs absolute
                      if img_src.startswith('//'):
                          img_src = 'http:' + img_src if url.startswith('http:') else 'https:' + img_src
                      elif not img_src.startswith('http'):
                           from urllib.parse import urljoin
                           img_src = urljoin(url, img_src)

                      if re.match(r'https?://.*\.(?:png|jpg|jpeg|gif|svg|webp|aivf)', img_src, re.IGNORECASE):
                           image_urls_found.append(img_src)

        meta_image = soup.find('meta', property='og:image') or soup.find('meta', name='twitter:image')
        if meta_image and meta_image.get('content'):
             img_src = meta_image['content']
             if img_src.startswith('http') or img_src.startswith('//'):
                  if img_src.startswith('//'):
                      img_src = 'http:' + img_src if url.startswith('http:') else 'https:' + img_src
                  if re.match(r'https?://.*\.(?:png|jpg|jpeg|gif|svg|webp|aivf)', img_src, re.IGNORECASE):
                       image_urls_found.append(img_src)

        main_content = soup.find('main') or soup.find('article') or soup.body
        if not main_content:
            main_content = soup.body
            if not main_content: return "", list(set(image_urls_found))

        paragraphs = main_content.find_all("p")
        text = "\n".join(p.get_text() for p in paragraphs)

        text = text.strip()

        if len(text) < 100:
             return "", list(set(image_urls_found))
        if len(text) > max_chars:
             text = text[:max_chars]

        return text, list(set(image_urls_found))


    except requests.exceptions.RequestException as e:
        return "", []
    except Exception as e:
        # print(f"[!] Scrape failed {url} during parsing: {e}", file=sys.stderr) 
        return "", []

# ========= LLM Prompting Functions (Direct Call) =========

def generate_initial_queries(full_query):
    """Uses LLM to generate initial search queries."""
    prompt = (
        "Analyze the following user query and suggest 1-3 concise web search queries to find relevant information.\n"
        "Focus on terms that are likely to yield direct results for a standard search.\n"
        "Respond strictly as a JSON array of strings:\n"
        "[\"query 1\", \"query 2\", ...]\n\n"
        f"Query: {full_query}"
    )
    messages = [
        {"role": "system", "content": "You are a search query generator. Provide concise web search terms for a user query."},
        {"role": "user", "content": prompt}
    ]
    try:
        response = query_llm(messages)
        queries = loads(response)
        if not isinstance(queries, list) or not queries:
             # print("[!] LLM query generation failed: Invalid JSON structure or empty list.", file=sys.stderr) 
             return [full_query] # Fallback to original query
        return queries[:MAX_INITIAL_SEARCH_QUERIES]
    except JSONDecodeError:
        # print(f"[!] LLM query generation failed: Could not decode JSON. Response:\n{response}", file=sys.stderr) 
        return [full_query] # Fallback
    except Exception as e:
        # print(f"[!] LLM query generation failed unexpectedly: {e}", file=sys.stderr) # Commented out error print
        return [full_query] # Fallback

def synthesize_final_answer(original_query, all_scraped_text, all_image_urls, access_time_str):
    """Uses LLM to synthesize a final answer from all collected text and image URLs."""
    if not all_scraped_text.strip() and not all_image_urls:
        return "Could not find enough relevant information or images to answer the query."
    
    combined_text = all_scraped_text.strip()
    if len(combined_text) > MAX_TOTAL_SCRAPED_CHARS:
        # print(f"[!] Truncating combined scraped text for final synthesis to {MAX_TOTAL_SCRAPED_CHARS} chars.", file=sys.stderr)
        combined_text = combined_text[:MAX_TOTAL_SCRAPED_CHARS]
    image_markdown = ""
    if all_image_urls:
        image_markdown = "\n\n--- Relevant Images Found During Scraping ---\n\n" + "\n".join([f"![Relevant Image]({url})" for url in all_image_urls])

    prompt = (
        f"Accessed On: {access_time_str}\n\n"
        "You are a comprehensive AI assistant. Synthesize a detailed and accurate answer to the original question based *only* on the provided text and the 'Accessed On' time.\n"
        "Integrate information from the text smoothly. Pay attention to dates and times mentioned in the text relative to the 'Accessed On' time.\n"
         "If relevant images were found during text scraping and are provided as markdown links, you can refer to them conceptually if the text provides captions, or simply provide the answer based on text alone.\n"
        "If the text is insufficient to fully answer, state that clearly.\n"
        "Do not use outside knowledge. Focus on the information given.\n"
        "Format the answer clearly with paragraphs.\n\n"
        f"Original Question: {original_query}\n\n"
        f"Context from Web Searches and Scraped Images:\n{combined_text}\n{image_markdown}"
    )
    messages = [
        {"role": "system", "content": "You are an expert information synthesizer. Compose a comprehensive answer using the provided context and timestamp, referring to images found during scraping."},
        {"role": "user", "content": prompt}
    ]
    return query_llm(messages)

# ========= Agent / Task Functions =========

def perform_text_search_and_scrape(search_query, geo_headers, visited_urls, global_image_set, max_total_images):
    """Performs a single text search, scrapes relevant results, and collects found images."""
    # print(f"--- Starting text search and scrape for: {search_query} ---", file=sys.stderr)
    scraped_text_for_query = ""
    sources_for_query = []
    local_image_urls_found = set() # Collect images found in this task's scrapes

    try:
        with DDGS() as ddgs:
            search_results = [r for r in ddgs.text(search_query, max_results=MAX_TEXT_RESULTS_PER_QUERY) if r and r.get("href")]
    except Exception as e:
        # print(f"[!] DuckDuckGo Text Search error for '{search_query}': {e}", file=sys.stderr)
        return "", [], [] # Return empty text, sources, images

    if not search_results:
        # print(f"--- No initial results for search: {search_query} ---", file=sys.stderr)
        return "", [], []

    current_scraped_chars = 0
    for r in search_results:
        url = r.get("href")
        if not url or url in visited_urls:
            continue
        # Check if adding images from this URL would exceed the global limit
        # We scrape text regardless, but stop collecting images if the limit is hit
        can_collect_more_images = len(global_image_set) + len(local_image_urls_found) < max_total_images

        # print(f"📄 Scraping: {url}", file=sys.stderr) 
        text, images_on_page = scrape_text_from_url(url, headers=geo_headers, max_chars=MAX_SCRAPED_CHARS_PER_PAGE)

        if text:
            visited_urls.add(url) 
            scraped_text_for_query += text + "\n\n---\n\n"
            sources_for_query.append(url)
            current_scraped_chars += len(text)

        if images_on_page and can_collect_more_images:
             for img_url in images_on_page:
                 if len(global_image_set) + len(local_image_urls_found) < max_total_images:
                      local_image_urls_found.add(img_url)
                 else:
                      break 

        
        if current_scraped_chars >= MAX_TOTAL_SCRAPED_CHARS / MAX_INITIAL_SEARCH_QUERIES:
             # print(f"[!] Reached char limit for scraping in task '{search_query}'. Stopping scrapes for this query.", file=sys.stderr)
             break 

    # print(f"--- Finished text search and scrape for: {search_query} (Scraped {len(sources_for_query)} pages, Found {len(local_image_urls_found)} images) ---", file=sys.stderr) 
    
    return scraped_text_for_query.strip(), sources_for_query, list(local_image_urls_found)





# ========= Master Function (Normal Search - Images from Scrape Only) =========

def smart_search_agent_pipeline(full_query):
    access_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Using a single executor for all worker tasks
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:

        geo_headers = {
            "User-Agent": "Mozilla/5.0 (compatible; OpenSearchAgent/1.6; +https://github.com/example/opensearchagent)", 
            "X-Forwarded-For": "auto",
            "Accept-Language": "en-US,en;q=0.9,en-IN;q=0.8"
        }

        # Step 1: Generate initial text search queries
        initial_text_queries = generate_initial_queries(full_query)

        # Step 2: Execute text search and scrape tasks concurrently
        text_search_futures = {}
        visited_urls = set() 
        all_scraped_images = set() 

        for query in initial_text_queries:
            
            
            future = executor.submit(perform_text_search_and_scrape, query, geo_headers, visited_urls, all_scraped_images, MAX_TOTAL_IMAGES)
            text_search_futures[future] = query # Store query with future

        all_scraped_text = ""
        all_sources = set()

        
        for future in tqdm(as_completed(text_search_futures), total=len(text_search_futures), desc="Text Search & Scraping", unit="task"):
            query_that_finished = text_search_futures[future]
            try:
                # Capture text, sources, and images from the task result
                scraped_text_for_query, sources_for_query, images_from_task = future.result()

                all_scraped_text += scraped_text_for_query + "\n\n---\n\n"
                all_sources.update(sources_for_query)
                all_scraped_images.update(images_from_task) 

            except Exception as exc:
                print(f"[!] Text search/scrape task for '{query_that_finished}' generated an exception: {exc}", file=sys.stderr) # Keep error log


        # print("\n--- Finished text search and scraping ---", file=sys.stderr) 

        # Step3: Synthesize the final answer from all collected information
        # print("\n📝 Synthesizing final answer...", file=sys.stderr) 

        final_sources_list = list(all_sources)
        final_image_urls_list = list(all_scraped_images)[:MAX_TOTAL_IMAGES]
        if not all_scraped_text.strip() and not final_image_urls_list:
             final_answer = "Could not gather any relevant information or images from web searches."
        else:
             final_answer = synthesize_final_answer(full_query, all_scraped_text, final_image_urls_list, access_time_str)
    # Return the result data dictionary
    return {
        "question": full_query,
        "answer": final_answer,
        "sources": final_sources_list,
        "images": final_image_urls_list 
    }

# ========= Script Code Only =========
if __name__ == "__main__":
    user_q = input("Enter your complex question: ")
    result = smart_search_agent_pipeline(user_q)
    print("\n--- Final Result ---")
    print(f"## Answer\n\n{result.get('answer', 'Could not find a relevant answer.')}\n")

    
    sources = result.get("sources", [])
    if sources:
        print("## Sources")
        
        for i, src in enumerate(sorted(list(set(sources)))): 
            print(f"{i+1}. <{src}>") 
        print("") 

    
    images = result.get("images", [])
    if images:
        print("## Relevant Images (from scraped pages)") 
        
        for img_url in images:
            print(f"![Relevant Image]({img_url})")
            print(f"<{img_url}>") 
        print("") 

    print("--- End of Result ---")