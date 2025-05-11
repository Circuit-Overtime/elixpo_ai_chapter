import requests
import threading
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from json import loads, JSONDecodeError
from time import sleep, time
from datetime import datetime
from queue import Queue, Empty
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
from tqdm import tqdm
import re
import os
import sys
import traceback 

# ========= Configuration =========
MAX_RETRIES = 3
MAX_SEARCH_WORKERS = 8 # Workers for web search & scraping
MAX_LLM_WORKERS = 4    # Workers specifically for LLM calls
SEARCH_TIMEOUT = 15    # seconds for individual search/scrape
LLM_TIMEOUT = 75       # seconds for LLM calls

# Limits for COMPLEX_WEB (All queries now go through this)
MAX_SEARCH_TASKS = 5  # Limit total number of text search queries executed
MAX_SEARCH_RESULTS_PER_QUERY = 4 # Number of initial search results to consider for link selection
MAX_LINKS_TO_SCRAPE_PER_QUERY = 4 # Max number of links the LLM can choose to scrape per search query
MAX_SCRAPED_CHARS_PER_PAGE = 4000 # Limit text per page before processing
MAX_TOTAL_SCRAPED_CHARS_PER_TASK = 8000 # Limit total text fed into intermediate LLM processing per task
MAX_TOTAL_PROCESSED_INFO_CHARS = 10000 # Limit total combined info fed into final synthesis
MAX_TOTAL_IMAGES = 5 # Max total images collected (from scraping only)
LLM_RATE_LIMIT_PER_MINUTE = 15 # Max LLM calls per minute
LLM_BUCKET_SIZE = 5           # Max concurrent calls or burst size
VALID_TEXT_TIMELIMITS = ['d', 'w', 'm', 'y', 'e', None] # d=day, w=week, m=month, y=year, e=all time

llm_rate_limiter = None
llm_executor = None
search_executor = None

# ========= Rate Limiter (Simple Token Bucket) =========

class TokenBucketRateLimiter:
    def __init__(self, rate: float, capacity: float):
        self._rate_per_sec = rate / 60.0
        self._capacity = capacity
        self._tokens = capacity
        self._last_check = time()
        self._lock = threading.Lock()

    def acquire(self, amount: int = 1):
        if amount > self._capacity:
            raise ValueError("Requested amount exceeds bucket capacity")

        with self._lock:
            now = time()
            elapsed = now - self._last_check
            self._last_check = now
            self._tokens += elapsed * self._rate_per_sec
            self._tokens = min(self._tokens, self._capacity)

            if self._tokens < amount:
                needed = amount - self._tokens
                wait_time = needed / self._rate_per_sec
                sleep(wait_time)
                self._tokens = 0
            else:
                self._tokens -= amount


# ========= Utility Functions (using executors and rate limiter) =========

def submit_llm_task(messages, seed=42, timeout=LLM_TIMEOUT, purpose="general"):
    if llm_executor is None:
        # print("[!] LLM Executor not initialized!", file=sys.stderr) 
        def _raise_uninitialized():
             raise RuntimeError("LLM Executor not initialized")
        return ThreadPoolExecutor(max_workers=1).submit(_raise_uninitialized)

    future = llm_executor.submit(
        _execute_llm_call, messages, seed, timeout, purpose
    )
    return future

def _execute_llm_call(messages, seed=42, timeout=LLM_TIMEOUT, purpose="general"):
    if llm_rate_limiter:
        try:
            llm_rate_limiter.acquire()
        except Exception as e:
            # print(f"[!] Error acquiring LLM rate limit token for {purpose}: {e}", file=sys.stderr) 
            pass 

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
            # print(f"[!] LLM Timeout for {purpose} (Attempt {attempt}/{MAX_RETRIES}): API did not respond in time.", file=sys.stderr) 
            pass
        except requests.exceptions.RequestException as e:
            # print(f"[!] LLM Request Error for {purpose} (Attempt {attempt}/{MAX_RETRIES}): {e}", file=sys.stderr) 
            pass
        except KeyError:
            # print(f"[!] LLM Response Error for {purpose} (Attempt {attempt}/{MAX_RETRIES}): Unexpected JSON format.", file=sys.stderr) 
            # print("Response:", res.text, file=sys.stderr) 
            return ""
        sleep(2 ** attempt)
    # print(f"[!] LLM Failed for {purpose} after {MAX_RETRIES} attempts.", file=sys.stderr) 
    return ""

def submit_search_task(func, *args, **kwargs):
    if search_executor is None:
        # print("[!] Search Executor not initialized!", file=sys.stderr) 
        def _raise_uninitialized():
            raise RuntimeError("Search Executor not initialized")
        return ThreadPoolExecutor(max_workers=1).submit(_raise_uninitialized)

    future = search_executor.submit(func, *args, **kwargs)
    return future

def scrape_text_from_url(url, headers=None, timeout=SEARCH_TIMEOUT, max_chars=None):
    headers = headers or {"User-Agent": "Mozilla/5.0 (compatible; OpenSearchAgent/1.6; +https://github.com/example/opensearchagent)"} 
    max_chars = max_chars if max_chars is not None else MAX_SCRAPED_CHARS_PER_PAGE

    try:
        res = requests.get(url, timeout=timeout, headers=headers)
        res.raise_for_status()

        content_type = res.headers.get('Content-Type', '').lower()
        if not 'text/html' in content_type:
            return "", []

        soup = BeautifulSoup(res.text, "html.parser")

        for script_or_style in soup(["script", "style"]):
            script_or_style.decompose()
        for nav in soup(["nav", "header", "footer", "aside", "form", "button", "noscript", "svg", "canvas"]):
             nav.decompose()

        # --- Attempt to find image URLs within the scraped HTML ---
        image_urls_found = []
        for img_tag in soup.find_all('img', src=True):
            img_src = img_tag['src']
            if not any(filter_term in img_src.lower() for filter_term in ['logo', 'icon', 'advert', 'tracker', 'spacer', 'spinner']):
                 if img_src.startswith('http') or img_src.startswith('//'):
                      if img_src.startswith('//'):
                          img_src = 'http:' + img_src if url.startswith('http:') else 'https:' + img_src
                      elif not img_src.startswith('http'):
                           from urllib.parse import urljoin
                           img_src = urljoin(url, img_src)
                      # Basic validation of URL format
                      if re.match(r'https?://.*\.(?:png|jpg|jpeg|gif|svg|webp)(\?.*)?$', img_src, re.IGNORECASE):
                           image_urls_found.append(img_src)
                 elif img_tag.get('data-src'):
                      img_src = img_tag['data-src']
                      if not any(filter_term in img_src.lower() for filter_term in ['logo', 'icon', 'advert', 'tracker', 'spacer', 'spinner']):
                          if img_src.startswith('http') or img_src.startswith('//'):
                              if img_src.startswith('//'):
                                  img_src = 'http:' + img_src if url.startswith('http:') else 'https:' + img_src
                              elif not img_src.startswith('http'):
                                   from urllib.parse import urljoin
                                   img_src = urljoin(url, img_src)
                              if re.match(r'https?://.*\.(?:png|jpg|jpeg|gif|svg|webp)(\?.*)?$', img_src, re.IGNORECASE):
                                   image_urls_found.append(img_src)


        meta_image = soup.find('meta', property='og:image') or soup.find('meta', name='twitter:image')
        if meta_image and meta_image.get('content'):
             img_src = meta_image['content']
             if not any(filter_term in img_src.lower() for filter_term in ['logo', 'icon', 'advert', 'tracker', 'spacer', 'spinner']):
                  if img_src.startswith('http') or img_src.startswith('//'):
                       if img_src.startswith('//'):
                           img_src = 'http:' + img_src if url.startswith('http:') else 'https:' + img_src
                       # Basic validation
                       if re.match(r'https?://.*\.(?:png|jpg|jpeg|gif|svg|webp)(\?.*)?$', img_src, re.IGNORECASE):
                            image_urls_found.append(img_src)
        main_content = soup.find('main') or soup.find('article') or soup.body
        if not main_content:
            main_content = soup.body
            if not main_content: return "", list(set(image_urls_found)) # Return text and image_urls

        text_elements = []
        potential_text_tags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'div', 'span']
        for tag in main_content.select(','.join(potential_text_tags)):
            text = tag.get_text().strip()
            if tag.name == 'div' and len(text.split()) < 5 and not tag.find('p') and not tag.find('li'):
                 continue
            if text:
                 text_elements.append(text)
        text = "\n".join(filter(None, text_elements))
        text = text.strip()

        if len(text) < 100: 
             return "", list(set(image_urls_found))
        if len(text) > max_chars:
             text = text[:max_chars]

        return text, list(set(image_urls_found)) 


    except requests.exceptions.RequestException as e:
        # print(f"[!] Scrape failed {url} due to request error: {e}", file=sys.stderr) 
        return "", []
    except Exception as e:
        # print(f"[!] Scrape failed {url} during parsing: {e}", file=sys.stderr) 
        return "", []

# ========= LLM Prompting Functions (return Futures) =========

def select_relevant_links(original_query, search_query, search_results, max_links, access_time_str):
    if not search_results:
        future = llm_executor.submit(lambda: [])
        return future

    results_context = "\n\n".join([
        f"Result {i+1}:\nTitle: {r.get('title', 'N/A')}\nURL: {r.get('href', 'N/A')}\nSnippet: {r.get('body', 'N/A')}"
        for i, r in enumerate(search_results[:MAX_SEARCH_RESULTS_PER_QUERY])
    ])

    prompt = (
        f"Search Context Timestamp (Accessed On): {access_time_str}\n\n"
        f"Given the original user query: '{original_query}', the specific search query used: '{search_query}', and the following list of search results (Title, URL, Snippet), select the {max_links} most relevant URLs to scrape for detailed information.\n"
        "Prioritize links that seem authoritative, comprehensive, or highly relevant based on snippets and their potential recency relative to the 'Search Context Timestamp'. Pay special attention to links from platforms like Instagram if relevant to the original query or results.\n"
        "Exclude irrelevant links like shopping sites, general forums unless they directly discuss the topic, or unrelated news articles.\n"
        "Respond strictly with a JSON array of the selected URLs:\n"
        "[\"url1\", \"url2\", ...]\n\n"
        f"Search Results:\n{results_context}\n\n"
        f"Selected URLs (max {max_links}):"
    )
    messages = [
        {"role": "system", "content": "You are a web result evaluator. Select the most relevant links based on titles, snippets, and potential recency relative to the provided timestamp. Prioritize relevant social media links if indicated by the query or results."},
        {"role": "user", "content": prompt}
    ]

    return submit_llm_task(messages, purpose="select_links")


def process_scraped_text(original_query, search_query, combined_scraped_text, access_time_str):
    if not combined_scraped_text.strip():
         future = llm_executor.submit(lambda: {"extracted_info": [], "social_media_mentions": [], "summary": "No text scraped or processed.", "suggested_queries": [], "suggested_timelimit_text": None})
         return future

    if len(combined_scraped_text) > MAX_TOTAL_SCRAPED_CHARS_PER_TASK:
         combined_scraped_text = combined_scraped_text[:MAX_TOTAL_SCRAPED_CHARS_PER_TASK]

    timelimit_options = ", ".join([f"'{t}'" if t is not None else 'None' for t in VALID_TEXT_TIMELIMITS])


    prompt = (
        f"Search Context Timestamp (Accessed On): {access_time_str}\n\n"
        f"Given the original user query: '{original_query}', the specific search query used: '{search_query}', and the following scraped text from one or more pages, please:\n"
        "1. Extract key facts and relevant pieces of information that directly or indirectly help answer the original query. Pay attention to any dates or timestamps mentioned in the text and interpret them relative to the 'Search Context Timestamp'.\n"
        "2. Identify any specific mentions of social media profiles (like Instagram usernames or links) or references to notable social media content (like popular posts) related to the query within the text.\n"
        "3. Provide a brief summary of the scraped text in the context of the original query.\n"
        "4. Suggest 1-3 potential *text* search queries that could help gather *more specific*, *related*, or *more recent/historical* information needed to answer the original query based on what you learned from this text and the 'Search Context Timestamp'. If social media mentions were found, suggest targeted searches (e.g., 'site:instagram.com username').\n"
        f"5. Suggest the best 'timelimit' for the *next* text searches from these options: [{timelimit_options}]. Choose 'None' if the time period is not important or is historical/very broad.\n"
        "Respond strictly in this JSON format:\n"
        "{{\n"
        "  \"extracted_info\": [\"Fact 1\", \"Fact 2\", ...],\n"
        "  \"social_media_mentions\": [\"Mention 1\", \"Mention 2\", ...],\n"
        "  \"summary\": \"Brief summary relevant to the original query.\",\n"
        "  \"suggested_queries\": [\"Follow-up query 1\", \"Follow-up query 2\", ...],\n"
        f"  \"suggested_timelimit_text\": {timelimit_options} or None\n"
        "}}\n\n"
        f"Make sure the extracted facts and summary are directly relevant to the original query.\n\n"
        f"Scraped Text:\n{combined_scraped_text}"
    )
    messages = [
        {"role": "system", "content": "You are a web result analyzer and information extractor. Process scraped content, interpreting dates relative to the provided timestamp, identifying social media mentions, and suggesting next text search steps with a relevant time limit."},
        {"role": "user", "content": prompt}
    ]

    return submit_llm_task(messages, purpose="process_text")


def synthesize_complex_answer(original_query, all_processed_info, image_urls, access_time_str):
    if not all_processed_info and not image_urls:
         future = llm_executor.submit(lambda: "Could not find enough relevant information to answer the query.")
         return future

    context_parts = []
    total_context_chars = 0
    all_social_media_mentions = []

    for info_bundle in all_processed_info:
        if total_context_chars >= MAX_TOTAL_PROCESSED_INFO_CHARS:
             break

        source_urls = info_bundle.get("sources", ["N/A"])
        source_str = ", ".join(source_urls)

        if info_bundle.get("extracted_info"):
             facts_str = "\n".join([f"- {fact}" for fact in info_bundle['extracted_info']])
             part = f"Extracted Facts (Source(s): {source_str}):\n{facts_str}"
             if total_context_chars + len(part) <= MAX_TOTAL_PROCESSED_INFO_CHARS:
                 context_parts.append(part)
                 total_context_chars += len(part)
             else:
                 
                 remaining_chars = MAX_TOTAL_PROCESSED_INFO_CHARS - total_context_chars
                 context_parts.append(part[:remaining_chars])
                 total_context_chars += remaining_chars
                 break 

        if total_context_chars >= MAX_TOTAL_PROCESSED_INFO_CHARS:
             break # Check again after adding facts

        if info_bundle.get("summary"):
             part = f"Summary (Source(s): {source_str}):\n{info_bundle['summary']}"
             if total_context_chars + len(part) <= MAX_TOTAL_PROCESSED_INFO_CHARS:
                 context_parts.append(part)
                 total_context_chars += len(part)
             else:
                 
                 remaining_chars = MAX_TOTAL_PROCESSED_INFO_CHARS - total_context_chars
                 context_parts.append(part[:remaining_chars])
                 total_context_chars += remaining_chars
                 break 


        if info_bundle.get("social_media_mentions"):
            all_social_media_mentions.extend(info_bundle["social_media_mentions"])

    if all_social_media_mentions:
        social_media_mentions_text = "\n\n--- Identified Social Media Mentions ---\n\n" + "\n".join([f"- {m}" for m in all_social_media_mentions])
        if total_context_chars + len(social_media_mentions_text) <= MAX_TOTAL_PROCESSED_INFO_CHARS:
            context_parts.append(social_media_mentions_text)
            total_context_chars += len(social_media_mentions_text)



    combined_context = "\n\n---\n\n".join(context_parts)

    image_markdown = ""
    if image_urls:
        image_markdown = "\n\n--- Relevant Images Found During Scraping ---\n\n" + "\n".join([f"![Relevant Image]({url})" for url in image_urls])

    prompt = (
        f"Search Context Timestamp (Accessed On): {access_time_str}\n\n"
        "You are a comprehensive AI assistant. Synthesize a detailed, accurate, and well-structured answer to the original question based *only* on the provided context (which includes facts, summaries, and identified social media mentions gathered from web searches) and the 'Search Context Timestamp'.\n"
        "Integrate the information smoothly into a coherent response. Pay close attention to dates and times mentioned in the context and interpret them relative to the 'Search Context Timestamp'.\n"
        "If relevant images were found during text scraping and are provided as markdown links, you can refer to them conceptually if the text provides captions, or simply provide the answer based on text alone.\n"
        "If the context is insufficient to fully answer, state that clearly. If social media mentions were found but yielded no direct answerable facts, you can mention that relevant activity or profiles were identified, but details were limited by available data.\n"
        "Do not use outside knowledge. Focus on the information given.\n"
        "Format the answer clearly with paragraphs and potentially bullet points if helpful.\n\n"
        f"Original Question: {original_query}\n\n"
        f"Context from Processed Web and Scraped Images:\n{combined_context}\n{image_markdown}" 
    )
    messages = [
        {"role": "system", "content": "You are an expert information synthesizer. Compose a comprehensive answer using the provided context (including social media mentions) and access time, referring to images found during scraping."}, # Updated system message
        {"role": "user", "content": prompt}
    ]

    return submit_llm_task(messages, purpose="synthesize_complex_answer")


# ========= Agent / Task Functions =========

def perform_complex_search_task(original_query, search_query, geo_headers, visited_urls_set, access_time_str, timelimit=None):
    # print(f"\n--- Starting text search task for: {search_query} (Timelimit: {timelimit}) ---", file=sys.stderr) 
    search_results = []
    try:
        with DDGS() as ddgs:
            search_results = [r for r in ddgs.text(search_query, max_results=MAX_SEARCH_RESULTS_PER_QUERY, timelimit=timelimit) if r and r.get("href")]
    except Exception as e:
        # print(f"[!] DuckDuckGo Text Search error for '{search_query}' with timelimit '{timelimit}': {e}", file=sys.stderr) 
        return [], [], None, [] #

    if not search_results:
        # print(f"--- No initial results for search: {search_query} ---", file=sys.stderr) 
        return [], [], None, []

    select_links_future = select_relevant_links(original_query, search_query, search_results, MAX_LINKS_TO_SCRAPE_PER_QUERY, access_time_str)

    selected_urls = []
    try:
        response = select_links_future.result()
        selected_urls = loads(response)
        if not isinstance(selected_urls, list):
            # print(f"[!] LLM link selection for '{search_query}' failed: Invalid JSON structure.", file=sys.stderr) 
            selected_urls = []
        selected_urls = selected_urls[:MAX_LINKS_TO_SCRAPE_PER_QUERY]

    except (JSONDecodeError, Exception) as e:
        # print(f"[!] LLM link selection for '{search_query}' failed: {e}. Falling back to selecting top {MAX_LINKS_TO_SCRAPE_PER_QUERY} links.", file=sys.stderr) 
        selected_urls = [r.get("href") for r in search_results[:MAX_LINKS_TO_SCRAPE_PER_QUERY] if r.get("href")]


    if not selected_urls:
        # print(f"--- No links selected to scrape for search: {search_query} ---", file=sys.stderr) 
        return [], [], None, []

    scraped_texts = {}
    scraped_image_urls_from_scrape = set() # Images found *during* scrape for this task
    sources_from_this_task = []
    total_scraped_chars_for_processing = 0
    scrape_futures = {}

    for url in selected_urls:
        if not url or url in visited_urls_set:
            continue
        scrape_future = submit_search_task(scrape_text_from_url, url, geo_headers, MAX_SCRAPED_CHARS_PER_PAGE)
        scrape_futures[scrape_future] = url # Map future back to URL

    completed_scrape_futures = as_completed(scrape_futures)

    while scrape_futures:
        try:
        
            scrape_future = next(completed_scrape_futures) # This will block until one completes

            url = None
            # Find which URL this future belongs to and remove it from the dict
            url = scrape_futures.pop(scrape_future)


            try:
                text, images_on_page = scrape_future.result() 


                if text:
                    visited_urls_set.add(url) 
                    scraped_texts[url] = text
                    sources_from_this_task.append(url)
                    total_scraped_chars_for_processing += len(text)

                if images_on_page:
                    scraped_image_urls_from_scrape.update(images_on_page)
                if total_scraped_chars_for_processing >= MAX_TOTAL_SCRAPED_CHARS_PER_TASK:
                     # print(f"[!] Reached max processing text limit ({MAX_TOTAL_SCRAPED_CHARS_PER_TASK}) for task '{search_query}'. Stopping scraping.", file=sys.stderr) 
                     for remaining_future in list(scrape_futures.keys()):
                         if not remaining_future.done(): # Check if it's still running/pending
                             remaining_future.cancel() # Request cancellation
                             # print(f"[*] Cancelling scrape task for {scrape_futures[remaining_future]}", file=sys.stderr) 
                             del scrape_futures[remaining_future] # Remove from tracking dict
                     break

            except Exception as e:
                 # Handle exceptions from getting the result or processing it
                 # print(f"[!] Error processing scrape result for {url} in task '{search_query}': {e}", file=sys.stderr) 
                 pass # Continue processing other futures in scrape_futures

        except StopIteration:
            # as_completed is exhausted
            break
        except Exception as e:
            # Handle exceptions from as_completed itself (less common)
            # print(f"[!] Unexpected error during scrape futures processing for task '{search_query}': {e}", file=sys.stderr) 
            pass


    if not scraped_texts:
        # print(f"--- No text scraped from selected links for search: {search_query} ---", file=sys.stderr) 
        return [], [], None, list(scraped_image_urls_from_scrape)

    # Combine scraped texts for processing by LLM
    combined_scraped_text = "\n\n--- NEW DOCUMENT ---\n\n".join(scraped_texts.values())

    # Process the combined text using LLM
    process_text_future = process_scraped_text(original_query, search_query, combined_scraped_text, access_time_str)

    processed_data = {}
    suggested_queries = []
    suggested_timelimit_text = None
    social_media_mentions = []

    try:
        response = process_text_future.result()
        processed = loads(response)
        if not isinstance(processed, dict) or 'extracted_info' not in processed or 'summary' not in processed or 'suggested_queries' not in processed or 'social_media_mentions' not in processed or 'suggested_timelimit_text' not in processed:
            #  print(f"[!] LLM text processing for '{search_query}' failed: Invalid JSON structure.", file=sys.stderr) 
             processed = {"extracted_info": [], "social_media_mentions": [], "summary": "Processing failed.", "suggested_queries": [], "suggested_timelimit_text": None}

        processed_data = {
            "search_query_used": search_query,
            "sources": sources_from_this_task,
            "summary": processed.get("summary", ""),
            "extracted_info": processed.get("extracted_info", []),
            "social_media_mentions": processed.get("social_media_mentions", [])
        }
        suggested_queries = processed.get("suggested_queries", [])
        social_media_mentions = processed.get("social_media_mentions", [])

        suggested_timelimit_text = processed.get("suggested_timelimit_text")
        if suggested_timelimit_text not in VALID_TEXT_TIMELIMITS:
            #  print(f"[!] LLM suggested invalid text timelimit '{suggested_timelimit_text}'. Using default None.", file=sys.stderr) 
             suggested_timelimit_text = None

    except (JSONDecodeError, Exception) as e:
        # print(f"[!] LLM text processing for '{search_query}' failed: {e}. Returning empty processed data and default timelimit.", file=sys.stderr) 
        processed_data = {
            "search_query_used": search_query,
            "sources": sources_from_this_task,
            "summary": "Processing failed due to error.",
            "extracted_info": [],
            "social_media_mentions": []
        }
        suggested_queries = []
        suggested_timelimit_text = None
        social_media_mentions = []

    # print(f"--- Finished text search task for: {search_query} ---", file=sys.stderr) 
    return [processed_data] if processed_data else [], suggested_queries, suggested_timelimit_text, list(scraped_image_urls_from_scrape)




# ========= Master Pipeline =========

def smart_search_agent_pipeline(full_query):
    global llm_rate_limiter, llm_executor, search_executor

    current_datetime = datetime.now()
    access_time_str = current_datetime.strftime("%Y-%m-%d %H:%M:%S")

    # Initialize executors and rate limiter
    llm_rate_limiter = TokenBucketRateLimiter(LLM_RATE_LIMIT_PER_MINUTE, LLM_BUCKET_SIZE)
    llm_executor = ThreadPoolExecutor(max_workers=MAX_LLM_WORKERS)
    search_executor = ThreadPoolExecutor(max_workers=MAX_SEARCH_WORKERS)
    # print("[*] Executors and Rate Limiter initialized.", file=sys.stderr) 


    geo_headers = {
        "User-Agent": "Mozilla/5.0 (compatible; OpenSearchAgent/1.5; +https://github.com/example/opensearchagent)",
        "X-Forwarded-For": "auto",
        "Accept-Language": "en-US,en;q=0.9,en-IN;q=0.8"
    }

    result_data = {
        "question": full_query,
        "answer": "Could not complete search pipeline.",
        "sources": [],
        "images": [] 
    }

    all_processed_info = []
    all_sources = set()
    visited_urls = set()
    executed_text_queries = set()
    text_search_tasks_queue = Queue()
    complex_futures = {}
    all_scraped_images_from_text_search = set() 

    current_text_timelimit = None 

   
    initial_search_query = full_query
    text_search_tasks_queue.put(initial_search_query)
    executed_query_count = 0 

    def submit_next_text_task():
        nonlocal executed_query_count, current_text_timelimit
        try:
            while executed_query_count < MAX_SEARCH_TASKS:
                current_query = text_search_tasks_queue.get_nowait()
                if current_query in executed_text_queries:
                     continue
                executed_text_queries.add(current_query)
                executed_query_count += 1
        
                future = submit_search_task(perform_complex_search_task, full_query, current_query, geo_headers, visited_urls, access_time_str, current_text_timelimit)
                complex_futures[future] = {"query": current_query, "type": "text_search"} # Type is now just 'text_search'
                # print(f"[*] Submitted text search task {executed_query_count}/{MAX_SEARCH_TASKS}: '{current_query}' (Timelimit: {current_text_timelimit})", file=sys.stderr) 
                return True # Successfully submitted a task
            return False 
        except Empty:
            return False 

    try:
        while len(complex_futures) < MAX_SEARCH_WORKERS and submit_next_text_task():
            pass

        initial_completed = len(executed_text_queries) - text_search_tasks_queue.qsize()
        with tqdm(total=MAX_SEARCH_TASKS, desc="Text Search & Processing", unit="task", initial=initial_completed) as pbar:
            while complex_futures or not text_search_tasks_queue.empty():
                 # Submit more tasks if workers are available and max task limit hasn't been reached
                 while len(complex_futures) < MAX_SEARCH_WORKERS and submit_next_text_task():
                      pass

                 if not complex_futures: # If no futures are running but queue isn't empty, wait briefly before checking again
                      if text_search_tasks_queue.empty(): break # Really nothing left
                      # print("[*] Waiting for futures to complete before submitting more tasks...", file=sys.stderr) 
                      sleep(0.5) 
                      continue 
                 try:
                    completed_future = next(as_completed(complex_futures.keys(), timeout=5)) # Add a small timeout here to allow checking queue/limits
                 except StopIteration:
                    # as_completed is exhausted (should only happen if complex_futures becomes empty)
                     break
                 except Exception as e:
                     # Handle other unexpected errors from as_completed
                     # print(f"[!] Unexpected error from as_completed: {e}", file=sys.stderr) 
                     continue # Try to continue the loop


                 task_info = complex_futures.pop(completed_future)
                 query_that_finished = task_info["query"]
                 pbar.update(1) # Update progress bar for the completed task

                 try:
                     processed_data_list, suggested_queries, suggested_timelimit_text_from_task, scraped_images_from_task = completed_future.result()

                     all_processed_info.extend(processed_data_list)
                     for bundle in processed_data_list:
                          all_sources.update(bundle.get("sources", []))

                     for img_url in scraped_images_from_task:
                          if len(all_scraped_images_from_text_search) < MAX_TOTAL_IMAGES:
                               all_scraped_images_from_text_search.add(img_url)
                          else:
                               break # Stop adding images if total limit is reached globally


                     if suggested_timelimit_text_from_task in VALID_TEXT_TIMELIMITS:
                          current_text_timelimit = suggested_timelimit_text_from_task
                          # print(f"[*] Updating text timelimit to: {current_text_timelimit} based on '{query_that_finished}' results.", file=sys.stderr) 


                     for next_query in suggested_queries:
                          if next_query and isinstance(next_query, str) and next_query.strip() and next_query not in executed_text_queries and text_search_tasks_queue.qsize() + len(complex_futures) + len(executed_text_queries) < MAX_SEARCH_TASKS:
                               text_search_tasks_queue.put(next_query)
                               # print(f"[*] Suggested query added to queue: '{next_query}'", file=sys.stderr) 


                 except Exception as exc:
                    
                     # print(f"[!] Task for query '{query_that_finished}' generated an exception: {exc}", file=sys.stderr) 
                     pass 


            # Ensure progress bar finishes at MAX_SEARCH_TASKS
            pbar.n = min(pbar.n, pbar.total)
            pbar.refresh()

        # print("\n[*] Finished text search and processing phase.", file=sys.stderr) 
        final_image_urls = list(all_scraped_images_from_text_search)
        # print(f"[*] Collected {len(final_image_urls)} images during scraping.", file=sys.stderr) 


        if not all_processed_info and not final_image_urls:
            result_data["answer"] = "Could not gather any relevant information or images."
        else:
            # Pass the collected scraped image URLs to the synthesis LLM
            synth_future = synthesize_complex_answer(full_query, all_processed_info, final_image_urls, access_time_str)

            final_answer = "Synthesis failed."
            try:
                # print("[*] Starting final synthesis...", file=sys.stderr) 
                final_answer = synth_future.result()
                # print("[*] Final synthesis complete.", file=sys.stderr) 
            except Exception as e:
                # print(f"[!] Final synthesis failed: {e}", file=sys.stderr) 
                summaries = [b['summary'] for b in all_processed_info if b.get('summary')]
                fallback_text = "Synthesis failed due to an error. Collected summaries:\n" + "\n---\n".join(summaries)
                final_answer = fallback_text[:MAX_TOTAL_PROCESSED_INFO_CHARS] + "..." if len(fallback_text) > MAX_TOTAL_PROCESSED_INFO_CHARS else fallback_text

            result_data["answer"] = final_answer
            result_data["sources"] = list(all_sources)
            result_data["images"] = final_image_urls # Include images list in result_data


    except Exception as pipeline_error:
        # print(f"[FATAL] An unexpected error occurred during the pipeline execution: {pipeline_error}", file=sys.stderr) 
        traceback.print_exc() # Print to default stderr
        result_data["answer"] = f"An internal error occurred during the search process: {pipeline_error}"

    finally:
        if llm_executor:
             llm_executor.shutdown(wait=True)
             llm_executor = None 
        if search_executor:
             search_executor.shutdown(wait=True)
             search_executor = None 
        # print("[*] Executors shut down.", file=sys.stderr) 


    return result_data

# ========= Entry Point =========
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

    # Images section
    images = result.get("images", [])
    if images:
        print("## Relevant Images")
        
        for img_url in images:
            print(f"![Relevant Image]({img_url})")
            print(f"<{img_url}>") 
        print("") 

    print("--- End of Result ---")