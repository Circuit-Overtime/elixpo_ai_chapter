import requests
import threading
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from json import loads, JSONDecodeError
from time import sleep, time
from datetime import datetime
from queue import Queue, Empty
from concurrent.futures import ThreadPoolExecutor, as_completed, wait, FIRST_COMPLETED
from tqdm import tqdm
import re
import os
import sys # Import sys for error output

# ========= Configuration =========
MAX_RETRIES = 3
MAX_SEARCH_WORKERS = 8 # Workers for web search & scraping
MAX_LLM_WORKERS = 4    # Workers specifically for LLM calls
SEARCH_TIMEOUT = 15    # seconds for individual search/scrape
LLM_TIMEOUT = 75       # seconds for LLM calls (increased for complexity/time context)

# Limits for COMPLEX_WEB
MAX_COMPLEX_SEARCH_TASKS = 10  # Limit total number of text search queries executed in complex mode
MAX_IMAGE_TASKS = 5            # Limit total number of image search queries executed (max 5 distinct queries)
MAX_SEARCH_RESULTS_PER_QUERY = 7 # Number of initial search results to consider for link selection in complex mode
MAX_LINKS_TO_SCRAPE_PER_QUERY = 4 # Max number of links the LLM can choose to scrape per search query in complex mode
MAX_SCRAPED_CHARS_PER_PAGE = 6000 # Limit text per page before processing
MAX_TOTAL_SCRAPED_CHARS_PER_TASK = 10000 # Limit total text fed into intermediate LLM processing per task
MAX_TOTAL_PROCESSED_INFO_CHARS = 14000 # Limit total combined info fed into final synthesis
MAX_IMAGES_TO_FETCH_PER_QUERY = 10 # Max number of image URLs to take from a single image search query (Increased for Instagram focus)
MAX_TOTAL_IMAGES = 15 # Max total images across all image searches (Increased)

# Limits for SIMPLE_WEB
MAX_SIMPLE_SEARCH_TASKS = 2    # Number of simple search queries to execute
MAX_SIMPLE_SEARCH_RESULTS = 3  # Number of search results to consider for simple scraping/snippets
MAX_SIMPLE_SCRAPE_CHARS_PER_PAGE = 1500 # Less scraping for simple queries
MAX_SIMPLE_SYNTHESIS_CHARS = 3000 # Less context for simple synthesis

# Define MAX_IMAGE_RESULTS_PER_QUERY as requested
MAX_IMAGE_RESULTS_PER_QUERY = 15 # Number of image search results to consider per query (Increased)

# Valid timelimit strings for DuckDuckGo Image Search
VALID_IMAGE_TIMELIMITS = ['Day', 'Week', 'Month', 'Year', None]
# Valid timelimit strings for DuckDuckGo Text Search (Note: DDGS library uses these)
VALID_TEXT_TIMELIMITS = ['d', 'w', 'm', 'y', 'e', None] # d=day, w=week, m=month, y=year, e=all time

# LLM Rate Limiter Config (Simple Token Bucket)
LLM_RATE_LIMIT_PER_MINUTE = 15 # Max LLM calls per minute
LLM_BUCKET_SIZE = 5           # Max concurrent calls or burst size

# Global Rate Limiter and Executor instances (initialized in main pipeline)
llm_rate_limiter = None
llm_executor = None
search_executor = None

# ========= Rate Limiter (Simple Token Bucket) =========

class TokenBucketRateLimiter:
    def __init__(self, rate: float, capacity: float):
        """
        rate: tokens per minute
        capacity: max tokens in the bucket
        """
        self._rate_per_sec = rate / 60.0 # Convert to tokens per second
        self._capacity = capacity
        self._tokens = capacity
        self._last_check = time()
        self._lock = threading.Lock()

    def acquire(self, amount: int = 1):
        """Acquire tokens, blocking if necessary."""
        if amount > self._capacity:
            raise ValueError("Requested amount exceeds bucket capacity")

        with self._lock:
            now = time()
            elapsed = now - self._last_check
            self._last_check = now
            self._tokens += elapsed * self._rate_per_sec
            self._tokens = min(self._tokens, self._capacity) # Cap the tokens

            if self._tokens < amount:
                # Calculate how long to wait for tokens
                needed = amount - self._tokens
                wait_time = needed / self._rate_per_sec
                # print(f"Rate limited. Waiting {wait_time:.2f} seconds...") # Optional: log rate limiting
                sleep(wait_time)
                self._tokens = 0 # After waiting, bucket is empty for this request
            else:
                self._tokens -= amount
                # print(f"Acquired {amount} token(s). Remaining: {self_tokens:.2f}") # Optional: log token usage


# ========= Utility Functions (using executors and rate limiter) =========

def submit_llm_task(messages, seed=42, timeout=LLM_TIMEOUT, purpose="general"):
    """Submits an LLM call to the dedicated executor with rate limiting."""
    if llm_executor is None:
        print("[!] LLM Executor not initialized!", file=sys.stderr)
        def _raise_uninitialized():
             raise RuntimeError("LLM Executor not initialized")
        return ThreadPoolExecutor(max_workers=1).submit(_raise_uninitialized)


    future = llm_executor.submit(
        _execute_llm_call, messages, seed, timeout, purpose
    )
    return future

def _execute_llm_call(messages, seed=42, timeout=LLM_TIMEOUT, purpose="general"):
    """Executes the actual LLM API call after acquiring a rate limit token."""
    if llm_rate_limiter:
        try:
            llm_rate_limiter.acquire()
        except Exception as e:
            print(f"[!] Error acquiring LLM rate limit token for {purpose}: {e}", file=sys.stderr)

    api_url = "https://text.pollinations.ai/openai"
    payload = {
        "model": "openai",
        "messages": messages,
        "seed": seed
    }
    headers = {"Content-Type": "application/json"}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            # print(f"Submitting LLM call for {purpose} (Attempt {attempt}/{MAX_RETRIES})...") # Debug print
            res = requests.post(api_url, json=payload, headers=headers, timeout=timeout)
            res.raise_for_status()
            # print(f"LLM call for {purpose} successful.") # Debug print
            return res.json()["choices"][0]["message"]["content"]
        except requests.exceptions.Timeout:
            print(f"[!] LLM Timeout for {purpose} (Attempt {attempt}/{MAX_RETRIES}): API did not respond in time.", file=sys.stderr)
        except requests.exceptions.RequestException as e:
            print(f"[!] LLM Request Error for {purpose} (Attempt {attempt}/{MAX_RETRIES}): {e}", file=sys.stderr)
        except KeyError:
            print(f"[!] LLM Response Error for {purpose} (Attempt {attempt}/{MAX_RETRIES}): Unexpected JSON format.", file=sys.stderr)
            # print("Response:", res.text) # Print response text for debugging
            return ""
        sleep(2 ** attempt)
    print(f"[!] LLM Failed for {purpose} after {MAX_RETRIES} attempts.", file=sys.stderr)
    return ""

def submit_search_task(func, *args, **kwargs):
    """Submits a search-related task (DDGS, scraping) to the search executor."""
    if search_executor is None:
        print("[!] Search Executor not initialized!", file=sys.stderr)
        def _raise_uninitialized():
            raise RuntimeError("Search Executor not initialized")
        return ThreadPoolExecutor(max_workers=1).submit(_raise_uninitialized)

    future = search_executor.submit(func, *args, **kwargs)
    return future

def scrape_text_from_url(url, headers=None, timeout=SEARCH_TIMEOUT, max_chars=None):
    """Scrapes text from a URL with robustness and optional character limit."""
    headers = headers or {"User-Agent": "Mozilla/5.0 (compatible; OpenSearchAgent/1.4; +https://github.com/example/opensearchagent)"} # Updated User Agent
    max_chars = max_chars if max_chars is not None else MAX_SCRAPED_CHARS_PER_PAGE

    try:
        # sleep(0.1) # Optional: uncomment for slower, polite scraping
        res = requests.get(url, timeout=timeout, headers=headers)
        res.raise_for_status()

        content_type = res.headers.get('Content-Type', '').lower()
        if not 'text/html' in content_type:
            # print(f"[!] Skipping non-HTML content at {url}: {content_type}") # Debug print
            return ""

        soup = BeautifulSoup(res.text, "html.parser")

        for script_or_style in soup(["script", "style"]):
            script_or_style.decompose()
        for nav in soup(["nav", "header", "footer", "aside", "form", "button", "noscript", "svg", "canvas"]): # Keep img tags if we want to find them after scraping
             nav.decompose()

        # --- Attempt to find image URLs within the scraped HTML ---
        # This is basic and may not work for all sites, especially dynamic ones like Instagram
        image_urls_found = []
        # Look for common image tags, potentially filtering by attributes like 'src'
        # For Instagram, images might be in meta tags or JSON-LD, which is more complex
        for img_tag in soup.find_all('img', src=True):
            img_src = img_tag['src']
            if img_src.startswith('http') or img_src.startswith('//'): # Basic filtering
                 # Check if it seems like a content image rather than tiny icon
                 if 'logo' not in img_src.lower() and 'icon' not in img_src.lower():
                      image_urls_found.append(img_src)
        # Can also look for Open Graph or Twitter Card meta tags for images if they exist
        meta_image = soup.find('meta', property='og:image') or soup.find('meta', name='twitter:image')
        if meta_image and meta_image.get('content'):
             img_src = meta_image['content']
             if img_src.startswith('http') or img_src.startswith('//'):
                  image_urls_found.append(img_src)
        # Note: Scraping Instagram directly requires looking for specific JSON-LD structures, which is complex.

        # --- Extract Text ---
        main_content = soup.find('main') or soup.find('article') or soup.body
        if not main_content:
            main_content = soup.body
            if not main_content: return "", [] # Return text and image_urls

        text_elements = []
        for tag in main_content.select('p, h1, h2, h3, h4, h5, h6, li, blockquote'):
             text_elements.append(tag.get_text().strip())

        text = "\n".join(filter(None, text_elements))
        text = text.strip()

        if len(text) < 100:
             # print(f"[!] Scraped text too short from {url}. Length: {len(text)}") # Debug print
             return "", [] # Return text and image_urls
        if len(text) > max_chars:
             # print(f"[!] Truncating scraped text from {url} to {max_chars} chars.") # Debug print
             text = text[:max_chars]

        # Return extracted text AND image URLs found on the page
        return text, list(set(image_urls_found)) # Return unique image URLs


    except requests.exceptions.RequestException as e:
        # print(f"[!] Scrape failed {url}: {e}") # Uncomment for detailed scrape errors
        return "", []
    except Exception as e:
        print(f"[!] Scrape failed {url} during parsing: {e}", file=sys.stderr)
        return "", []

# ========= LLM Prompting Functions (return Futures) =========

def classify_query(full_query, system_local_time_str):
    """Submits an LLM task to classify the query and returns the future."""
    try:
        system_datetime_obj = datetime.strptime(system_local_time_str, "%Y-%m-%d %H:%M:%S")
        system_year = system_datetime_obj.strftime("%Y")
        system_month_year = system_datetime_obj.strftime("%B %Y")
    except ValueError:
        system_year = "current_year" # Fallback placeholders
        system_month_year = "current_month_year"
        print(f"[!] Could not parse system_local_time_str: {system_local_time_str}. Using placeholders for search suggestions.", file=sys.stderr)


    prompt = (
        f"Pipeline Start Time (System Local): {system_local_time_str}\n\n"
        "Analyze the following user query and classify its type. Always plan to use web search for accurate, up-to-date information.\n"
        "- 'simple_web': Requires a quick web search for current or specific but easily found information (e.g., current weather, stock price, latest news headline, *current time/date/timezone in X*).\n"
        "- 'complex_web': Requires in-depth web search, possibly involving multiple steps, analyzing detailed information, or exploring nuanced topics (e.g., comparing concepts, summarizing research, historical analysis, technical explanations, finding information or images from specific platforms like Instagram).\n\n" # Added Instagram mention
        "Provide 1-2 concise search queries in the 'initial_searches' field for 'simple_web' queries. For time/date/timezone queries, suggest searches specifically designed to find this current information online (e.g., 'current time in Kolkata').\n"
        "Provide 2-4 initial diverse search queries in the 'initial_searches' field for 'complex_web' queries. Include time-sensitive terms like 'recent', 'latest', '{system_month_year}', or '{system_year}' where appropriate. If the query suggests looking for social media content (like Instagram), include relevant search terms like adding 'Instagram'.\n" # Added Instagram search suggestion hint
        "Respond strictly in this JSON format:\n"
        "{{\n"
        "  \"type\": \"simple_web|complex_web\",\n"
        "  \"initial_searches\": [\"query 1\", \"query 2\", ...]\n"
        "}}\n\n"
        f"Query: {full_query}"
    )
    prompt = prompt.format(system_local_time_str=system_local_time_str, system_year=system_year, system_month_year=system_month_year)


    messages = [
        {"role": "system", "content": "You are a query classifier and search planner. Categorize the user's request and suggest initial web search queries, using the provided system local time as context for recency. Consider social media platforms like Instagram if relevant."}, # Updated system message
        {"role": "user", "content": prompt}
    ]
    return submit_llm_task(messages, purpose="classify_query")


def select_relevant_links(original_query, search_query, search_results, max_links, access_time_str):
    """Submits an LLM task to select relevant links based on context and returns the future."""
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
        "Prioritize links that seem authoritative, comprehensive, or highly relevant based on snippets and their potential recency relative to the 'Search Context Timestamp'. Pay special attention to links from platforms like Instagram if relevant to the original query.\n" # Added Instagram relevance hint
        "Exclude irrelevant links like shopping sites, general forums unless they directly discuss the topic, or unrelated news articles.\n"
        "Respond strictly with a JSON array of the selected URLs:\n"
        "[\"url1\", \"url2\", ...]\n\n"
        f"Search Results:\n{results_context}\n\n"
        f"Selected URLs (max {max_links}):"
    )
    messages = [
        {"role": "system", "content": "You are a web result evaluator. Select the most relevant links based on titles, snippets, and potential recency relative to the provided timestamp. Prioritize relevant social media links if indicated by the query or results."}, # Updated system message
        {"role": "user", "content": prompt}
    ]

    return submit_llm_task(messages, purpose="select_links")


def process_scraped_text(original_query, search_query, combined_scraped_text, access_time_str):
    """Submits an LLM task to process scraped text, extract info, suggest queries, and returns the future (used in complex mode)."""
    # Combined scraped text now includes text AND mentions of found image URLs from scraping.
    # Need to slightly adapt the prompt, but mainly focus on the text content.

    if not combined_scraped_text.strip():
         future = llm_executor.submit(lambda: {"extracted_info": [], "summary": "No text scraped or processed.", "suggested_queries": [], "suggested_timelimit_text": None})
         return future

    if len(combined_scraped_text) > MAX_TOTAL_SCRAPED_CHARS_PER_TASK:
         combined_scraped_text = combined_scraped_text[:MAX_TOTAL_SCRAPED_CHARS_PER_TASK]

    timelimit_options = ", ".join([f"'{t}'" if t is not None else 'None' for t in VALID_TEXT_TIMELIMITS])


    prompt = (
        f"Search Context Timestamp (Accessed On): {access_time_str}\n\n"
        f"Given the original user query: '{original_query}', the specific search query used: '{search_query}', and the following scraped text from one or more pages, please:\n"
        "1. Extract key facts and relevant pieces of information that directly or indirectly help answer the original query. Pay attention to any dates or timestamps mentioned in the text and interpret them relative to the 'Search Context Timestamp'.\n"
        "2. Identify any specific mentions of social media profiles (like Instagram usernames or links) or references to notable social media content (like popular posts) related to the query within the text.\n" # Added instruction to find social media mentions
        "3. Provide a brief summary of the scraped text in the context of the original query.\n"
        "4. Suggest 1-3 potential *text* search queries that could help gather *more specific*, *related*, or *more recent/historical* information needed to answer the original query based on what you learned from this text and the 'Search Context Timestamp'. If social media mentions were found, suggest targeted searches (e.g., 'site:instagram.com username').\n" # Suggest targeted social media search
        f"5. Suggest the best 'timelimit' for the *next* text searches from these options: [{timelimit_options}]. Choose 'None' if the time period is not important or is historical/very broad.\n"
        "Respond strictly in this JSON format:\n"
        "{{\n"
        "  \"extracted_info\": [\"Fact 1\", \"Fact 2\", ...],\n"
        "  \"social_media_mentions\": [\"Mention 1\", \"Mention 2\", ...],\n" # New field for social media mentions
        "  \"summary\": \"Brief summary relevant to the original query.\",\n"
        "  \"suggested_queries\": [\"Follow-up query 1\", \"Follow-up query 2\", ...],\n"
        f"  \"suggested_timelimit_text\": {timelimit_options} or None\n"
        "}}\n\n"
        f"Make sure the extracted facts and summary are directly relevant to the original query.\n\n"
        f"Scraped Text:\n{combined_scraped_text}"
    )
    messages = [
        {"role": "system", "content": "You are a web result analyzer and information extractor. Process scraped content, interpreting dates relative to the provided timestamp, identifying social media mentions, and suggesting next text search steps with a relevant time limit."}, # Updated system message
        {"role": "user", "content": prompt}
    ]

    return submit_llm_task(messages, purpose="process_text")

def synthesize_simple_answer(original_query, scraped_text_and_snippets, access_time_str):
    """Submits an LLM task to synthesize a simple answer from limited text (used in simple_web mode)."""
    if not scraped_text_and_snippets.strip():
         future = llm_executor.submit(lambda: "Could not find relevant information with a simple search.")
         return future

    if len(scraped_text_and_snippets) > MAX_SIMPLE_SYNTHESIS_CHARS:
         scraped_text_and_snippets = scraped_text_and_snippets[:MAX_SIMPLE_SYNTHESIS_CHARS]

    prompt = (
        f"Search Context Timestamp (Accessed On): {access_time_str}\n\n"
        f"Answer the following question concisely based *only* on the limited text provided. Use the provided text to form your answer. Pay attention to any dates or times mentioned in the text and interpret them relative to the 'Search Context Timestamp'.\n"
        "If the text is insufficient, state that you couldn't find enough information.\n"
        "Do not use outside knowledge. Be brief and factual. For time/date/timezone queries, use the information directly extracted from the search results.\n\n"
        f"Original Question: {original_query}\n\n"
        f"Context from Web Snippets and Scrapes:\n{scraped_text_and_snippets}"
    )
    messages = [
        {"role": "system", "content": "You are a concise answer generator. Answer the question using only the provided text, interpreting dates relative to the timestamp. For time/date/timezone questions, use the text from search results."},
        {"role": "user", "content": prompt}
    ]
    return submit_llm_task(messages, purpose="synthesize_simple")


def suggest_image_queries(original_query, all_processed_info, access_time_str):
    """Submits an LLM task to suggest terms for image search and timelimit based on collected info and returns the future."""
    if not all_processed_info:
        future = llm_executor.submit(lambda: {"suggested_queries": [], "suggested_timelimit": None})
        return future

    context_parts = []
    total_context_chars = 0
    social_media_mentions = [] # Collect mentions from processing results

    for bundle in all_processed_info:
         part = ""
         if bundle.get("summary"):
             part += "Summary: " + bundle["summary"] + "\n"
         if bundle.get("extracted_info"):
             part += "Facts:\n" + "\n".join([f"- {fact}" for fact in bundle["extracted_info"]]) + "\n"
         if bundle.get("social_media_mentions"): # Collect social media mentions
             mentions_str = "\n".join([f"- {m}" for m in bundle["social_media_mentions"]])
             part += f"Social Media Mentions:\n{mentions_str}\n"
             social_media_mentions.extend(bundle["social_media_mentions"])


         if total_context_chars + len(part) <= MAX_TOTAL_PROCESSED_INFO_CHARS:
             context_parts.append(part)
             total_context_chars += len(part)
         else:
             break

    context = "\n\n".join(context_parts)

    if not context.strip():
         future = llm_executor.submit(lambda: {"suggested_queries": [], "suggested_timelimit": None})
         return future

    timelimit_options = ", ".join([f"'{t}'" if t is not None else 'None' for t in VALID_IMAGE_TIMELIMITS])

    prompt = (
        f"Search Context Timestamp (Accessed On): {access_time_str}\n\n"
        f"Based on the original user query: '{original_query}' and the following summary of information gathered from the web (including any identified social media mentions), suggest 1-3 concise search terms for finding relevant images, and suggest an appropriate time limit for the search.\n" # Added social media mentions hint
        f"Focus on key people, places, concepts, or objects mentioned that are likely to have illustrative images. If specific social media users or content were mentioned, prioritize image search terms related to them, potentially including their username or specific event/topic mentioned in the context.\n" # Prioritize social media related images
        f"Consider suggesting terms that might find *recent* or *historical* images if relevant to the query and context, interpreting dates relative to the 'Search Context Timestamp'.\n"
        f"Suggest the best 'timelimit' from these options: [{timelimit_options}]. Choose 'None' if the time period is not important or is historical/very broad.\n"
        "Respond strictly in this JSON format:\n"
        "{{\n"
        "  \"suggested_queries\": [\"image query 1\", \"image query 2\", ...],\n"
        f"  \"suggested_timelimit\": {timelimit_options} or None\n"
        "}}\n\n"
        f"Information Summary and Mentions:\n{context}\n\n" # Updated context title
        "Suggested Image Queries (max 3) and Timelimit:"
    )
    messages = [
        {"role": "system", "content": "You are an image search query and time limit suggester. Identify key visual concepts (including those mentioned from social media) and an appropriate time frame for image search, using the access time as context."}, # Updated system message
        {"role": "user", "content": prompt}
    ]

    return submit_llm_task(messages, purpose="suggest_images")


def synthesize_complex_answer(original_query, all_processed_info, image_urls, access_time_str):
    """Submits an LLM task to synthesize a final answer from all collected info and image URLs, and returns the future (used in complex mode)."""
    if not all_processed_info and not image_urls:
         future = llm_executor.submit(lambda: "Could not find enough relevant information to answer the query.")
         return future

    context_parts = []
    total_context_chars = 0

    # Include social media mentions in the context for synthesis
    social_media_mentions_text = ""
    all_social_media_mentions = []

    for info_bundle in all_processed_info:
        source_urls = info_bundle.get("sources", ["N/A"])
        source_str = ", ".join(source_urls)

        if info_bundle.get("extracted_info"):
             facts_str = "\n".join([f"- {fact}" for fact in info_bundle['extracted_info']])
             part = f"Extracted Facts (Source(s): {source_str}):\n{facts_str}"
             if total_context_chars + len(part) <= MAX_TOTAL_PROCESSED_INFO_CHARS:
                 context_parts.append(part)
                 total_context_chars += len(part)
             else:
                 pass

        if info_bundle.get("summary"):
             part = f"Summary (Source(s): {source_str}):\n{info_bundle['summary']}"
             if total_context_chars + len(part) <= MAX_TOTAL_PROCESSED_INFO_CHARS:
                 context_parts.append(part)
                 total_context_chars += len(part)
             else:
                 pass

        if info_bundle.get("social_media_mentions"):
            all_social_media_mentions.extend(info_bundle["social_media_mentions"])

    # Add social media mentions as a dedicated section if any were found
    if all_social_media_mentions:
        social_media_mentions_text = "\n\n--- Identified Social Media Mentions ---\n\n" + "\n".join([f"- {m}" for m in all_social_media_mentions])
        # Add this section only if there's space in the context
        if total_context_chars + len(social_media_mentions_text) <= MAX_TOTAL_PROCESSED_INFO_CHARS:
            context_parts.append(social_media_mentions_text)
            total_context_chars += len(social_media_mentions_text)
        else:
             social_media_mentions_text = "" # Don't add if it exceeds limit


    combined_context = "\n\n---\n\n".join(context_parts)

    image_markdown = ""
    if image_urls:
        image_markdown = "\n\n--- Relevant Images ---\n\n" + "\n".join([f"![Relevant Image]({url})" for url in image_urls])

    prompt = (
        f"Search Context Timestamp (Accessed On): {access_time_str}\n\n"
        "You are a comprehensive AI assistant. Synthesize a detailed, accurate, and well-structured answer to the original question based *only* on the provided context (which includes facts, summaries, and identified social media mentions gathered from web searches) and the 'Search Context Timestamp'.\n" # Added social media mentions hint
        "Integrate the information smoothly into a coherent response. Pay close attention to dates and times mentioned in the context and interpret them relative to the 'Search Context Timestamp'.\n"
        "If relevant images are provided as markdown links, consider referring to them or placing them appropriately in the answer if the format allows.\n"
        "If the context is insufficient to fully answer, state that clearly. If social media mentions were found but yielded no direct answerable facts, you can mention that relevant activity or profiles were identified, but details were limited by available data.\n" # Added instruction on handling social media mentions in answer
        "Do not use outside knowledge. Focus on the information given.\n"
        "Format the answer clearly with paragraphs and potentially bullet points if helpful.\n\n"
        f"Original Question: {original_query}\n\n"
        f"Context from Processed Web and Local Queries:\n{combined_context}\n{image_markdown}"
    )
    messages = [
        {"role": "system", "content": "You are an expert information synthesizer. Compose a comprehensive answer using the provided context (including social media mentions) and access time, and include relevant images."}, # Updated system message
        {"role": "user", "content": prompt}
    ]

    return submit_llm_task(messages, purpose="synthesize_complex_answer")


# ========= Agent / Task Functions =========

def perform_complex_search_task(original_query, search_query, geo_headers, visited_urls, access_time_str, timelimit=None):
    """Performs a text search with a specific timelimit, gets LLM to select links, scrapes, and gets LLM to process them (Complex Mode)."""
    print(f"\n--- Starting complex text search task for: {search_query} (Timelimit: {timelimit}) ---")
    search_results = []
    try:
        with DDGS() as ddgs:
            search_results = [r for r in ddgs.text(search_query, max_results=MAX_SEARCH_RESULTS_PER_QUERY, timelimit=timelimit) if r and r.get("href")]
    except Exception as e:
        print(f"[!] DuckDuckGo Text Search error for '{search_query}' with timelimit '{timelimit}': {e}", file=sys.stderr)
        return [], [], None # Return processed_data (empty list), suggested_queries (empty list), suggested_timelimit_text (None)

    if not search_results:
        print(f"--- No initial results for complex search: {search_query} ---")
        return [], [], None

    # Step 1: Submit task to LLM Executor to select most relevant links
    select_links_future = select_relevant_links(original_query, search_query, search_results, MAX_LINKS_TO_SCRAPE_PER_QUERY, access_time_str) # Pass access_time_str

    selected_urls = []
    try:
        response = select_links_future.result()
        selected_urls = loads(response)
        if not isinstance(selected_urls, list):
            print(f"[!] LLM link selection for '{search_query}' failed: Invalid JSON structure.", file=sys.stderr)
            selected_urls = []
        selected_urls = selected_urls[:MAX_LINKS_TO_SCRAPE_PER_QUERY]

    except (JSONDecodeError, Exception) as e:
        print(f"[!] LLM link selection for '{search_query}' failed: {e}. Falling back to selecting top {MAX_LINKS_TO_SCRAPE_PER_QUERY} links.", file=sys.stderr)
        selected_urls = [r.get("href") for r in search_results[:MAX_LINKS_TO_SCRAPE_PER_QUERY] if r.get("href")]


    if not selected_urls:
        print(f"--- No links selected to scrape for complex search: {search_query} ---")
        return [], [], None

    # Step 2: Scrape the selected links using the Search Executor
    scraped_texts = {}
    scraped_image_urls = set() # Collect image URLs found during scraping
    sources_from_this_task = []
    total_scraped_chars_for_processing = 0
    scrape_futures = {}

    for url in selected_urls:
        if not url or url in visited_urls:
            continue
        # scrape_text_from_url now returns text AND a list of image URLs
        scrape_future = submit_search_task(scrape_text_from_url, url, geo_headers, MAX_SCRAPED_CHARS_PER_PAGE)
        scrape_futures[scrape_future] = url # Store url with future

    completed_scrape_futures = as_completed(scrape_futures)
    while scrape_futures:
        try:
            scrape_future = next(completed_scrape_futures)
            # Find the original URL associated with this completed future
            url = None
            for key, value in list(scrape_futures.items()): # Iterate over a copy
                 if key is scrape_future:
                     url = value
                     del scrape_futures[key] # Remove the processed future
                     break
            if url is None: continue

            try:
                # Receive both text and images from the scrape result
                text, images_on_page = scrape_future.result(timeout=1)
                if text:
                    visited_urls.add(url)
                    scraped_texts[url] = text
                    sources_from_this_task.append(url)
                    total_scraped_chars_for_processing += len(text)

                if images_on_page:
                    # Add images found on this page to the set
                    scraped_image_urls.update(images_on_page)

                # Stop scraping if we hit character limit for processing
                if total_scraped_chars_for_processing >= MAX_TOTAL_SCRAPED_CHARS_PER_TASK:
                     print(f"[!] Reached max processing text limit ({MAX_TOTAL_SCRAPED_CHARS_PER_TASK}) for task '{search_query}'. Stopping scraping.", file=sys.stderr)
                     for remaining_future in list(scrape_futures.keys()): # Iterate over a copy
                         if not remaining_future.done():
                             remaining_future.cancel()
                     scrape_futures = {} # Clear remaining futures dictionary
                     break # Stop waiting for more scrapes

            except Exception as e:
                 print(f"[!] Error scraping {url} in complex task for '{search_query}': {e}", file=sys.stderr)

        except StopIteration:
            break
        except Exception as e:
            print(f"[!] Error processing completed scrape future for task '{search_query}': {e}", file=sys.stderr)


    if not scraped_texts:
        print(f"--- No text scraped from selected links for complex search: {search_query} ---")
        # Also return a default suggested timelimit None
        return [], [], None

    # Step 3: Submit task to LLM Executor to process the collected text
    combined_scraped_text = "\n\n--- NEW DOCUMENT ---\n\n".join(scraped_texts.values())
    # Pass access_time_str to the processing LLM
    process_text_future = process_scraped_text(original_query, search_query, combined_scraped_text, access_time_str)

    processed_data = {}
    suggested_queries = []
    suggested_timelimit_text = None # Default
    social_media_mentions = [] # New list to hold mentions


    try:
        response = process_text_future.result()
        processed = loads(response)
        # Updated validation to check for 'social_media_mentions' and 'suggested_timelimit_text'
        if not isinstance(processed, dict) or 'extracted_info' not in processed or 'summary' not in processed or 'suggested_queries' not in processed or 'social_media_mentions' not in processed or 'suggested_timelimit_text' not in processed:
             print(f"[!] LLM text processing for '{search_query}' failed: Invalid JSON structure.", file=sys.stderr)
             # Fallback data with all necessary keys
             processed = {"extracted_info": [], "social_media_mentions": [], "summary": "Processing failed.", "suggested_queries": [], "suggested_timelimit_text": None}

        processed_data = {
            "search_query_used": search_query,
            "sources": sources_from_this_task,
            "summary": processed.get("summary", ""),
            "extracted_info": processed.get("extracted_info", []),
            "social_media_mentions": processed.get("social_media_mentions", []) # Get social media mentions
        }
        suggested_queries = processed.get("suggested_queries", [])
        social_media_mentions = processed.get("social_media_mentions", []) # Use this list

        # Validate suggested text timelimit
        suggested_timelimit_text = processed.get("suggested_timelimit_text")
        if suggested_timelimit_text not in VALID_TEXT_TIMELIMITS:
             print(f"[!] LLM suggested invalid text timelimit '{suggested_timelimit_text}'. Using default None.", file=sys.stderr)
             suggested_timelimit_text = None


    except (JSONDecodeError, Exception) as e:
        print(f"[!] LLM text processing for '{search_query}' failed: {e}. Returning empty processed data, default timelimit, and no mentions.", file=sys.stderr)
        processed_data = {
            "search_query_used": search_query,
            "sources": sources_from_this_task,
            "summary": "Processing failed due to error.",
            "extracted_info": [],
            "social_media_mentions": [] # Empty list on failure
        }
        suggested_queries = []
        suggested_timelimit_text = None
        social_media_mentions = []


    print(f"--- Finished complex text search task for: {search_query} ---")
    # Return processed data list, suggested queries list, suggested text timelimit, AND scraped image URLs
    return [processed_data] if processed_data else [], suggested_queries, suggested_timelimit_text, list(scraped_image_urls) # Return list of unique scraped image URLs


def perform_simple_search_task(original_query, search_query, geo_headers):
    """Performs a simple text search and limited scraping (Simple Web Mode)."""
    print(f"\n--- Starting simple text search task for: {search_query} ---")
    search_results = []
    try:
        with DDGS() as ddgs:
            # Apply a 'd' timelimit as a heuristic for simple queries
            # Use 'timelimit' parameter
            timed_filter = 'd'
            search_results = [r for r in ddgs.text(search_query, max_results=MAX_SIMPLE_SEARCH_RESULTS, timelimit=timed_filter) if r and r.get("href")]
    except Exception as e:
        print(f"[!] DuckDuckGo Text Search error for simple search '{search_query}' with timelimit '{timed_filter}': {e}", file=sys.stderr)
        return "", []

    if not search_results:
        print(f"--- No initial results for simple search: {search_query} ---")
        return "", []

    scraped_texts = []
    sources = []

    for r in search_results:
         url = r.get("href")
         if not url: continue

         # For simple scrape, we don't need the images found on the page
         text, _ = scrape_text_from_url(url, headers=geo_headers, max_chars=MAX_SIMPLE_SCRAPE_CHARS_PER_PAGE)
         if text:
              scraped_texts.append(text)
              sources.append(url)
              if sum(len(t) for t in scraped_texts) > MAX_SIMPLE_SYNTHESIS_CHARS * 1.5:
                   break

    combined_scraped_text = "\n\n---\n\n".join(scraped_texts)

    print(f"--- Finished simple text search task for: {search_query} (Scraped {len(scraped_texts)} pages) ---")
    return combined_scraped_text, sources


def perform_image_search_task(image_query, timelimit):
    """Performs an image search with a specific timelimit and returns image URLs (Complex Mode)."""
    print(f"\n--- Starting image search task for: {image_query} (Timelimit: {timelimit}) ---")
    image_urls = []
    try:
        with DDGS() as ddgs:
            results = ddgs.images(image_query, max_results=MAX_IMAGE_RESULTS_PER_QUERY, timelimit=timelimit)
            for r in results:
                if r.get("image") and r["image"] not in image_urls:
                    image_urls.append(r["image"])
                    if len(image_urls) >= MAX_IMAGES_TO_FETCH_PER_QUERY:
                        break

    except Exception as e:
        print(f"[!] DuckDuckGo Image Search error for '{image_query}' with timelimit '{timelimit}': {e}", file=sys.stderr)

    print(f"--- Finished image search task for: {image_query} (Found {len(image_urls)} images) ---")
    return image_urls


# ========= Master Pipeline =========

def smart_search_agent_pipeline(full_query):
    global llm_rate_limiter, llm_executor, search_executor

    print(f"\n===== Starting Smart Search Pipeline (V2 - Adaptive + Time Context + Instagram Attempt) =====")
    print(f"Query: {full_query}")

    current_datetime = datetime.now()
    access_time_str = current_datetime.strftime("%Y-%m-%d %H:%M:%S")

    llm_rate_limiter = TokenBucketRateLimiter(LLM_RATE_LIMIT_PER_MINUTE, LLM_BUCKET_SIZE)
    llm_executor = ThreadPoolExecutor(max_workers=MAX_LLM_WORKERS)
    search_executor = ThreadPoolExecutor(max_workers=MAX_SEARCH_WORKERS)
    print(f"Initialized LLM Executor ({MAX_LLM_WORKERS} workers) and Search Executor ({MAX_SEARCH_WORKERS} workers).")
    print(f"LLM Rate Limit: {LLM_RATE_LIMIT_PER_MINUTE} calls/minute, Burst: {LLM_BUCKET_SIZE}")
    print(f"Pipeline Start Time (System Local - Accessed On): {access_time_str}")


    geo_headers = {
        "User-Agent": "Mozilla/5.0 (compatible; OpenSearchAgent/1.4; +https://github.com/example/opensearchagent)",
        "X-Forwarded-For": "auto",
        "Accept-Language": "en-US,en;q=0.9,en-IN;q=0.8"
    }

    result_data = {
        "question": full_query,
        "answer": "Could not complete search pipeline.",
        "sources": [],
        "images": []
    }

    try:
        # Step 1: Classify the query (uses LLM Executor)
        print("\n🧠 Classifying query type...")
        classify_future = classify_query(full_query, access_time_str)

        query_classification = {}
        try:
            response = classify_future.result()
            query_classification = loads(response)

            if not isinstance(query_classification, dict) or 'type' not in query_classification or 'initial_searches' not in query_classification:
                 print("[!] LLM classification failed: Invalid JSON structure.", file=sys.stderr)
                 query_classification = {"type": "complex_web", "initial_searches": [full_query]}

        except (JSONDecodeError, Exception) as e:
            print(f"[!] LLM classification failed entirely: {e}. Defaulting to complex web search.", file=sys.stderr)
            query_classification = {"type": "complex_web", "initial_searches": [full_query]}

        query_type = query_classification.get("type", "complex_web")
        initial_searches = query_classification.get("initial_searches", [])

        if not isinstance(initial_searches, list) or not initial_searches:
             print(f"[!] LLM classification failed to provide initial searches for type '{query_type}'. Using original query as fallback.", file=sys.stderr)
             initial_searches = [full_query]


        print(f"Classified as: {query_type}")
        print(f"Initial Searches suggested: {initial_searches}")


        # Step 2: Execute pipeline based on classification

        if query_type == "simple_web":
            print("\n✨ Handling as Simple Web Query...")
            simple_searches_to_run = initial_searches[:MAX_SIMPLE_SEARCH_TASKS]
            if not simple_searches_to_run:
                 print("[!] No simple searches to run after classification. Exiting simple mode.", file=sys.stderr)
                 result_data["answer"] = "Could not generate simple search queries."
            else:
                all_scraped_text = ""
                all_sources = set()
                simple_search_futures = {}

                print(f"🚀 Executing {len(simple_searches_to_run)} simple search tasks...")
                for s_query in simple_searches_to_run:
                    future = submit_search_task(perform_simple_search_task, full_query, s_query, geo_headers)
                    simple_search_futures[future] = s_query

                for future in tqdm(as_completed(simple_search_futures), total=len(simple_search_futures), desc="Simple Search", unit="task"):
                    query_that_finished = simple_search_futures[future]
                    try:
                        text, sources = future.result() # simple scrape returns text, sources
                        if text:
                            all_scraped_text += text + "\n\n---\n\n"
                            all_sources.update(sources)
                            if len(all_scraped_text) > MAX_SIMPLE_SYNTHESIS_CHARS * 1.5:
                                print(f"[!] Reached max simple synthesis context limit ({MAX_SIMPLE_SYNTHESIS_CHARS}). Stopping simple scraping.", file=sys.stderr)
                                for remaining_future in simple_search_futures:
                                    if not remaining_future.done():
                                        remaining_future.cancel()
                                break

                    except Exception as exc:
                        print(f"[!] Simple search task for '{query_that_finished}' generated an exception: {exc}", file=sys.stderr)

                print("\n📝 Synthesizing simple answer...")
                synth_future = synthesize_simple_answer(full_query, all_scraped_text, access_time_str)

                simple_answer = "Synthesis failed for simple query."
                try:
                     simple_answer = synth_future.result()
                except Exception as e:
                     print(f"[!] Simple synthesis failed: {e}", file=sys.stderr)
                     simple_answer = f"Simple synthesis failed due to an error. Collected text snippets: {all_scraped_text[:500]}..."

                result_data["answer"] = simple_answer
                result_data["sources"] = list(all_sources)
                print("--- Finished Simple Web Query Handling ---")


        elif query_type == "complex_web":
            print("\n✨ Handling as Complex Web Query...")
            complex_searches_to_run = initial_searches
            if not complex_searches_to_run:
                 print("[!] No complex searches to run after classification. Exiting complex mode.", file=sys.stderr)
                 result_data["answer"] = "Could not generate complex search queries."
            else:
                all_processed_info = []
                all_sources = set()
                visited_urls = set()
                executed_text_queries = set()
                text_search_tasks_queue = Queue()
                complex_futures = {}
                all_scraped_images_from_text_search = set() # Collect images found *during* text scraping


                current_text_timelimit = None # Or 'm' or 'y' depending on desired default recency

                for query in complex_searches_to_run:
                    text_search_tasks_queue.put(query)

                executed_complex_query_count = 0

                def submit_next_complex_text_task():
                    nonlocal executed_complex_query_count, current_text_timelimit
                    try:
                        while executed_complex_query_count < MAX_COMPLEX_SEARCH_TASKS:
                            current_query = text_search_tasks_queue.get_nowait()
                            if current_query in executed_text_queries:
                                 continue
                            executed_text_queries.add(current_query)
                            executed_complex_query_count += 1
                            # Pass the CURRENT suggested timelimit to the task runner
                            future = submit_search_task(perform_complex_search_task, full_query, current_query, geo_headers, visited_urls, access_time_str, current_text_timelimit)
                            complex_futures[future] = {"query": current_query, "type": "complex_text_search"}
                            return True
                        return False
                    except Empty:
                        return False

                print(f"🚀 Executing complex text search and processing tasks (up to {MAX_SEARCH_WORKERS} concurrent)...")

                while len(complex_futures) < MAX_SEARCH_WORKERS and submit_next_complex_text_task():
                    pass

                initial_completed = len(executed_text_queries) - text_search_tasks_queue.qsize()
                with tqdm(total=MAX_COMPLEX_SEARCH_TASKS, desc="Complex Text Search & Processing", unit="task", initial=initial_completed) as pbar:
                    while complex_futures:
                        try:
                            completed_future = next(as_completed(complex_futures.keys()))
                        except StopIteration:
                            break

                        task_info = complex_futures.pop(completed_future)
                        query_that_finished = task_info["query"]
                        pbar.update(1)

                        try:
                            # Receive processed data, suggested queries, suggested text timelimit, AND scraped image URLs
                            processed_data_list, suggested_queries, suggested_timelimit_text_from_task, scraped_images_from_task = completed_future.result()

                            all_processed_info.extend(processed_data_list)
                            for bundle in processed_data_list:
                                 all_sources.update(bundle.get("sources", []))

                            # Add scraped images from this task to the global set
                            all_scraped_images_from_text_search.update(scraped_images_from_task)


                            # Update the current_text_timelimit based on the latest suggestion from the task
                            if suggested_timelimit_text_from_task in VALID_TEXT_TIMELIMITS:
                                 current_text_timelimit = suggested_timelimit_text_from_task
                                 # print(f"[!] Text Timelimit updated to: {current_text_timelimit}") # Debug print

                            for next_query in suggested_queries:
                                 if next_query and next_query not in executed_text_queries:
                                      text_search_tasks_queue.put(next_query)

                        except Exception as exc:
                            print(f"[!] Complex task for query '{query_that_finished}' generated an exception: {exc}", file=sys.stderr)

                        while len(complex_futures) < MAX_SEARCH_WORKERS and submit_next_complex_text_task():
                             pass

                    pbar.n = min(pbar.n, pbar.total)
                    pbar.refresh()

                print("\n--- Finished complex text search and processing steps ---")

                # Step 3: Suggest Image Queries and Timelimit (uses LLM Executor)
                print("\n🖼️ Suggesting image queries and time limit based on gathered info...")
                # Pass access_time_str to image query suggestion
                image_suggestion_future = suggest_image_queries(full_query, all_processed_info, access_time_str)

                suggested_image_queries = []
                suggested_image_timelimit = None
                try:
                    response = image_suggestion_future.result()
                    suggestion_data = loads(response)

                    if not isinstance(suggestion_data, dict) or 'suggested_queries' not in suggestion_data:
                         print("[!] LLM image suggestion failed: Invalid JSON structure (missing suggested_queries).", file=sys.stderr)
                         suggested_image_queries = []
                    else:
                        suggested_image_queries = suggestion_data.get('suggested_queries', [])
                        if not isinstance(suggested_image_queries, list):
                            print("[!] LLM image suggestion failed: suggested_queries is not a list.", file=sys.stderr)
                            suggested_image_queries = []

                        suggested_image_timelimit = suggestion_data.get('suggested_timelimit')
                        if suggested_image_timelimit not in VALID_IMAGE_TIMELIMITS:
                            print(f"[!] LLM suggested invalid image timelimit '{suggested_image_timelimit}'. Using default None.", file=sys.stderr)
                            suggested_image_timelimit = None

                    suggested_image_queries = [re.sub(r'^[\'"]|[\'"]$', '', q).strip() for q in suggested_image_queries]
                    suggested_image_queries = [q for q in suggested_image_queries if q][:MAX_IMAGE_TASKS]


                except (JSONDecodeError, Exception) as e:
                    print(f"[!] LLM image query suggestion failed entirely: {e}. Falling back to simple image queries and default timelimit.", file=sys.stderr)
                    suggested_image_queries = [f"{full_query} image", f"{full_query} photo"]
                    suggested_image_queries = suggested_image_queries[:MAX_IMAGE_TASKS]
                    suggested_image_timelimit = None


                print(f"Suggested Image Queries: {suggested_image_queries}")
                print(f"Suggested Image Timelimit: {suggested_image_timelimit}")


                # Step 4: Execute Image Searches
                # Combine images found during text scraping with images from dedicated image search
                all_image_urls = set(all_scraped_images_from_text_search)
                image_futures = {}

                if suggested_image_queries and len(all_image_urls) < MAX_TOTAL_IMAGES: # Only run image search if we still need images
                    print(f"\n📸 Executing dedicated image search tasks (up to {MAX_SEARCH_WORKERS} concurrent)...")

                    executed_image_count = 0
                    for img_query in suggested_image_queries:
                        if img_query and executed_image_count < MAX_IMAGE_TASKS and len(all_image_urls) < MAX_TOTAL_IMAGES:
                            future = submit_search_task(perform_image_search_task, img_query, suggested_image_timelimit)
                            image_futures[future] = img_query
                            executed_image_count += 1

                    for future in tqdm(as_completed(image_futures), total=len(image_futures), desc="Image Search", unit="task"):
                        query_that_finished = image_futures[future]
                        try:
                            urls = future.result()
                            for url in urls:
                                if len(all_image_urls) < MAX_TOTAL_IMAGES:
                                    all_image_urls.add(url)
                                else:
                                    break
                            if len(all_image_urls) >= MAX_TOTAL_IMAGES:
                                 for remaining_future in image_futures:
                                     if not remaining_future.done():
                                         remaining_future.cancel()
                                 break

                        except Exception as exc:
                            print(f"[!] Image search task for '{query_that_finished}' generated an exception: {exc}", file=sys.stderr)

                    final_image_urls = list(all_image_urls) # Convert set to list

                else:
                    final_image_urls = list(all_image_urls) # Just use images found during scraping
                    if not final_image_urls:
                         print("--- No image queries suggested or executed, and no images found during text scraping. ---")
                    else:
                         print(f"--- No dedicated image searches executed. Using {len(final_image_urls)} images found during text scraping. ---")


                print(f"--- Finished image search steps (Total images collected: {len(final_image_urls)}) ---")

                if not all_processed_info and not final_image_urls:
                    result_data["answer"] = "Could not gather any relevant information or images."
                else:
                    # Step 5: Synthesize the final answer from processed info (uses LLM Executor)
                    print("\n📝 Synthesizing final complex answer...")
                    synth_future = synthesize_complex_answer(full_query, all_processed_info, final_image_urls, access_time_str)

                    final_answer = "Complex synthesis failed."
                    try:
                        final_answer = synth_future.result()
                    except Exception as e:
                        print(f"[!] Final complex synthesis failed: {e}", file=sys.stderr)
                        summaries = [b['summary'] for b in all_processed_info if b.get('summary')]
                        fallback_text = "Synthesis failed due to an error. Collected summaries:\n" + "\n---\n".join(summaries)
                        final_answer = fallback_text[:2000] + "..." if len(fallback_text) > 2000 else fallback_text

                    result_data["answer"] = final_answer
                    result_data["sources"] = list(all_sources)
                    result_data["images"] = final_image_urls # Include images list in result_data
                    print("--- Finished Complex Web Query Handling ---")


        else: # Should not happen with only simple_web/complex_web, but safety check
            print(f"[!] Unknown query type '{query_type}' returned by classifier. Defaulting to basic error.", file=sys.stderr)
            result_data["answer"] = f"Could not process query due to unknown type: {query_type}."


    except Exception as pipeline_error:
        print(f"[FATAL] An unexpected error occurred during the pipeline execution: {pipeline_error}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        result_data["answer"] = f"An internal error occurred during the search process: {pipeline_error}"

    finally:
        if llm_executor:
             print("Shutting down LLM executor...")
             llm_executor.shutdown(wait=True)
        if search_executor:
             print("Shutting down Search executor...")
             search_executor.shutdown(wait=True)
        print("Executors shut down.")


    return result_data

# ========= Entry Point =========
if __name__ == "__main__":
    user_q = input("Enter your complex question: ")
    result = smart_search_agent_pipeline(user_q)

    print(f"\n===== Final Result =====")
    if "error" in result:
         print("[❌]", result.get("error", "An error occurred."))
    else:
        print("\n💬 Answer:\n", result["answer"])
        print("\n🔗 Sources:")
        if result["sources"]:
            for i, src in enumerate(result["sources"]):
                print(f"{i+1}. {src}")
        else:
            print("No specific sources found or listed in processed information.")

        if result.get("images"):
            print("\n📸 Relevant Images Collected:")
            for i, img_url in enumerate(result["images"]):
                print(f"{i+1}. {img_url}")
            # Note: Images are also included as markdown in the answer text if synthesis worked.


    print(f"\n===== Pipeline Finished =====\n")