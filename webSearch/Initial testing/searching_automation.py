import requests
import threading
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from json import loads, JSONDecodeError
from time import sleep
from datetime import datetime
from queue import Queue
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm
import re
import os # Added for potential API key management if needed later

# ========= Configuration =========
MAX_RETRIES = 3
MAX_WORKERS = 10 # Use ThreadPoolExecutor for worker management
SEARCH_TIMEOUT = 10 # seconds for individual search/scrape
LLM_TIMEOUT = 30 # seconds for LLM calls
MAX_SEARCH_TASKS = 30 # Limit the total number of search queries executed
MAX_SCRAPED_CHARS_PER_PAGE = 4000 # Limit text per page before processing
MAX_TOTAL_SCRAPED_CHARS = 40000 # Limit total text fed into intermediate LLM steps

# Use environment variable for potential future API key
# POLLINATIONS_API_KEY = os.environ.get("POLLINATIONS_API_KEY") # Pollinations doesn't need key currently

# ========= Utilities =========

def query_llm(messages, seed=42, timeout=LLM_TIMEOUT):
    """Robust LLM query function with retries."""
    api_url = "https://text.pollinations.ai/openai" # Consider adding a model parameter if needed
    payload = {
        "model": "openai", # Defaulting to openai on Pollinations
        "messages": messages,
        "seed": seed
    }
    headers = {"Content-Type": "application/json"}
    # if POLLINATIONS_API_KEY: # Example for future API key integration
    #     headers["Authorization"] = f"Bearer {POLLINATIONS_API_KEY}"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            res = requests.post(api_url, json=payload, headers=headers, timeout=timeout)
            res.raise_for_status() # Raise an HTTPError for bad responses (4xx or 5xx)
            return res.json()["choices"][0]["message"]["content"]
        except requests.exceptions.Timeout:
            print(f"[!] LLM Timeout (Attempt {attempt}/{MAX_RETRIES}): API did not respond in time.")
        except requests.exceptions.RequestException as e:
            print(f"[!] LLM Request Error (Attempt {attempt}/{MAX_RETRIES}): {e}")
        except KeyError:
            print(f"[!] LLM Response Error (Attempt {attempt}/{MAX_RETRIES}): Unexpected JSON format.")
            print("Response:", res.text) # Print response text for debugging
            return "" # Return empty on parsing error
        sleep(2 ** attempt) # Exponential backoff
    print(f"[!] LLM Failed after {MAX_RETRIES} attempts.")
    return ""

def scrape_text_from_url(url, headers=None, timeout=SEARCH_TIMEOUT):
    """Scrapes text from a URL with robustness."""
    headers = headers or {"User-Agent": "Mozilla/5.0 (compatible; OpenSearchAgent/1.0; +https://github.com/example/opensearchagent)"} # More descriptive user agent
    try:
        res = requests.get(url, timeout=timeout, headers=headers)
        res.raise_for_status() # Raise an HTTPError for bad responses (4xx or 5xx)

        # Basic check for common non-HTML content types
        content_type = res.headers.get('Content-Type', '').lower()
        if not 'text/html' in content_type:
            print(f"[!] Skipping non-HTML content at {url}: {content_type}")
            return ""

        soup = BeautifulSoup(res.text, "html.parser")

        # Remove common noisy elements (scripts, styles, headers, footers, nav)
        for script_or_style in soup(["script", "style"]):
            script_or_style.decompose()
        for nav in soup(["nav", "header", "footer", "aside"]):
             nav.decompose()

        # Get text from main content areas or body
        text = ""
        main_content = soup.find('main') or soup.find('article') or soup.body
        if main_content:
             paragraphs = main_content.find_all("p")
             text = "\n".join(p.get_text() for p in paragraphs)
        else: # Fallback to all paragraphs if specific tags not found
             paragraphs = soup.find_all("p")
             text = "\n".join(p.get_text() for p in paragraphs)


        text = text.strip()

        # Basic length and noise check
        if len(text) < 100: # Too short might be an error or sparse page
             print(f"[!] Scraped text too short from {url}. Length: {len(text)}")
             return ""
        if len(text) > MAX_SCRAPED_CHARS_PER_PAGE:
             print(f"[!] Truncating scraped text from {url} to {MAX_SCRAPED_CHARS_PER_PAGE} chars.")
             text = text[:MAX_SCRAPED_CHARS_PER_PAGE]

        return text

    except requests.exceptions.RequestException as e:
        # print(f"[!] Scrape failed {url}: {e}") # Uncomment for detailed scrape errors
        return ""
    except Exception as e:
        print(f"[!] Scrape failed {url} during parsing: {e}")
        return ""

# ========= LLM Prompting Functions =========

def plan_search_strategy(full_query):
    """Uses LLM to plan initial and potential follow-up search queries."""
    prompt = (
        "Analyze the following complex query and plan a search strategy.\n"
        "Identify the core information needed to answer the query comprehensively.\n"
        "Suggest initial search queries to get started, and think about what kind of follow-up searches might be needed based on the *type* of information you expect to find (e.g., if looking for a person, maybe search for their publications, biography, recent news; if looking for a concept, maybe search for definitions, history, current research, applications).\n"
        "Structure your response as a JSON object with the following keys:\n"
        "{\n"
        "  \"initial_searches\": [\"query 1\", \"query 2\", ...],\n"
        "  \"analysis\": \"Brief explanation of the search approach.\"\n"
        "}\n"
        "Focus on diverse angles to cover the query effectively.\n\n"
        f"Query: {full_query}"
    )
    messages = [
        {"role": "system", "content": "You are a search strategist. Plan effective web searches to answer complex questions."},
        {"role": "user", "content": prompt}
    ]
    try:
        response = query_llm(messages)
        plan = loads(response)
        if not isinstance(plan, dict) or 'initial_searches' not in plan or not isinstance(plan['initial_searches'], list):
             print("[!] LLM planning failed: Invalid JSON structure.")
             return {"initial_searches": [full_query], "analysis": "Fallback to initial query."} # Fallback
        return plan
    except JSONDecodeError:
        print(f"[!] LLM planning failed: Could not decode JSON. Response:\n{response}")
        return {"initial_searches": [full_query], "analysis": "Fallback to initial query."} # Fallback
    except Exception as e:
        print(f"[!] LLM planning failed unexpectedly: {e}")
        return {"initial_searches": [full_query], "analysis": "Fallback to initial query."} # Fallback


def process_search_results(original_query, search_query, scraped_text):
    """Uses LLM to process scraped text, extract info, and suggest follow-up queries."""
    if not scraped_text.strip():
        return {"extracted_info": [], "summary": "No text scraped.", "suggested_queries": []}

    # Truncate text for LLM context if necessary
    if len(scraped_text) > MAX_TOTAL_SCRAPED_CHARS:
         scraped_text = scraped_text[:MAX_TOTAL_SCRAPED_CHARS]
         print(f"[!] Truncating scraped text for processing LLM call.")


    prompt = (
        f"Given the original user query: '{original_query}', the specific search query used: '{search_query}', and the following scraped text, please:\n"
        "1. Extract key facts and relevant pieces of information that directly or indirectly help answer the original query.\n"
        "2. Provide a brief summary of the scraped text in the context of the original query.\n"
        "3. Suggest 1-3 potential follow-up search queries that could help gather *more specific* or *related* information needed to answer the original query based on what you learned from this text (e.g., if the text mentions a name, suggest searching for that name; if it mentions a date, suggest searching for events on that date related to the topic).\n"
        "Respond strictly in this JSON format:\n"
        "{\n"
        "  \"extracted_info\": [\"Fact 1\", \"Fact 2\", ...],\n"
        "  \"summary\": \"Brief summary relevant to the original query.\",\n"
        "  \"suggested_queries\": [\"Follow-up query 1\", \"Follow-up query 2\", ...]\n"
        "}\n"
        "Make sure the extracted facts and summary are directly relevant to the original query.\n\n"
        f"Scraped Text:\n{scraped_text}"
    )
    messages = [
        {"role": "system", "content": "You are a web result analyzer and information extractor. Process scraped content and identify next steps."},
        {"role": "user", "content": prompt}
    ]

    try:
        response = query_llm(messages)
        processed = loads(response)
        if not isinstance(processed, dict) or 'extracted_info' not in processed or 'summary' not in processed or 'suggested_queries' not in processed:
             print("[!] LLM processing failed: Invalid JSON structure.")
             return {"extracted_info": [], "summary": "Processing failed.", "suggested_queries": []} # Fallback
        return processed
    except JSONDecodeError:
        print(f"[!] LLM processing failed: Could not decode JSON. Response:\n{response}")
        return {"extracted_info": [], "summary": "Processing failed.", "suggested_queries": []} # Fallback
    except Exception as e:
        print(f"[!] LLM processing failed unexpectedly: {e}")
        return {"extracted_info": [], "summary": "Processing failed.", "suggested_queries": []} # Fallback


def synthesize_final_answer(original_query, all_processed_info, access_time):
    """Uses LLM to synthesize a final answer from all collected and processed information."""
    if not all_processed_info:
        return "Could not find enough relevant information to answer the query."

    # Combine extracted info and summaries, keeping track of sources
    context_parts = []
    for info_bundle in all_processed_info:
        source_urls = info_bundle.get("sources", ["N/A"])
        source_str = ", ".join(source_urls)
        if info_bundle.get("summary"):
             context_parts.append(f"Summary (Source(s): {source_str}):\n{info_bundle['summary']}")
        if info_bundle.get("extracted_info"):
             facts_str = "\n".join([f"- {fact}" for fact in info_bundle['extracted_info']])
             context_parts.append(f"Extracted Facts (Source(s): {source_str}):\n{facts_str}")

    combined_context = "\n\n".join(context_parts)

    # Ensure context fits within typical LLM limits - prioritize facts over summaries
    # A more advanced approach might rank/select context parts
    if len(combined_context) > 8000: # Adjust based on LLM context window
        print("[!] Truncating combined context for final synthesis.")
        combined_context = combined_context[:8000] # Basic truncation

    prompt = (
        "You are a comprehensive AI assistant. Synthesize a detailed, accurate, and well-structured answer to the original question based *only* on the provided context and access time.\n"
        "Prioritize the extracted facts and integrate information smoothly.\n"
        "If the context is insufficient to fully answer, state that clearly.\n"
        "Do not use outside knowledge. Focus on the information given.\n"
        "Format the answer clearly with paragraphs.\n\n"
        f"Original Question: {original_query}\n"
        f"Accessed On: {access_time}\n\n"
        f"Context from Processed Web and Local Queries:\n{combined_context}"
    )
    messages = [
        {"role": "system", "content": "You are an expert information synthesizer. Compose a comprehensive answer using the provided context."},
        {"role": "user", "content": prompt}
    ]
    return query_llm(messages)


# ========= Agent / Task Management =========

def perform_search_task(original_query, search_query, geo_headers, visited_urls):
    """Performs a search, scrapes results, and processes them using the LLM."""
    print(f"\n🔎 Searching: {search_query}")
    results = []
    try:
        with DDGS() as ddgs:
            # Consider adding more advanced DDGS parameters if needed (region, time)
            search_results = [r for r in ddgs.text(search_query, max_results=5) if r and r.get("href")] # Get more results initially
    except Exception as e:
        print(f"[!] DuckDuckGo Search error for '{search_query}': {e}")
        return [] # Return empty results on search failure

    processed_results = []
    suggested_queries = []

    scraped_texts = {}
    sources_from_this_search = []
    total_scraped_chars_for_processing = 0

    # Scrape top results, avoiding duplicates and limiting total text
    for r in search_results:
        url = r.get("href")
        if not url or url in visited_urls:
            continue

        print(f"📄 Scraping: {url}")
        text = scrape_text_from_url(url, headers=geo_headers)

        if text:
            visited_urls.add(url)
            scraped_texts[url] = text
            sources_from_this_search.append(url)
            total_scraped_chars_for_processing += len(text)
            # Stop scraping more text if we hit the intermediate processing limit
            if total_scraped_chars_for_processing >= MAX_TOTAL_SCRAPED_CHARS:
                 print(f"[!] Reached max processing text limit ({MAX_TOTAL_SCRAPED_CHARS}). Stopping scraping for this task.")
                 break

    # Process the collected text using the LLM
    if scraped_texts:
        combined_scraped_text = "\n\n--- NEW DOCUMENT ---\n\n".join(scraped_texts.values())
        # Pass the *original* query and the *specific* search query used
        processing_output = process_search_results(original_query, search_query, combined_scraped_text)

        processed_results.append({
            "search_query_used": search_query,
            "sources": sources_from_this_search,
            "summary": processing_output.get("summary", ""),
            "extracted_info": processing_output.get("extracted_info", [])
        })
        suggested_queries.extend(processing_output.get("suggested_queries", []))

    return processed_results, suggested_queries


# ========= Master Pipeline =========

def smart_search_agent_pipeline(full_query):
    print(f"\n===== Starting Smart Search Pipeline =====\n")
    print(f"Query: {full_query}")

    access_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    geo_headers = {
        "User-Agent": "Mozilla/5.0 (compatible; OpenSearchAgent/1.0; +https://github.com/example/opensearchagent)",
        "X-Forwarded-For": "auto", # Or a specific IP if needed for geo-targeting
        "Accept-Language": "en-US,en;q=0.9,en-IN;q=0.8" # Prioritize US English first
    }

    # Step 1: Plan the initial search strategy
    print("\n🧠 Planning search strategy...")
    search_plan = plan_search_strategy(full_query)
    initial_searches = search_plan.get("initial_searches", [])
    print(f"Analysis: {search_plan.get('analysis', 'N/A')}")
    print(f"Initial Searches: {initial_searches}")

    if not initial_searches:
        return {"question": full_query, "answer": "The search planner could not generate initial queries.", "sources": []}

    # Step 2: Execute searches and process results iteratively
    search_tasks_queue = Queue()
    for query in initial_searches:
        search_tasks_queue.put(query)

    all_processed_info = []
    all_sources = set() # Use a set to track unique sources
    visited_urls = set() # Track URLs already scraped to avoid redundancy
    executed_queries = set() # Track queries already run
    executed_query_count = 0

    # Use ThreadPoolExecutor for managing parallel search/processing agents
    print(f"\n🚀 Executing search tasks with up to {MAX_WORKERS} workers...")
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_query = {}

        # Start initial tasks
        while not search_tasks_queue.empty() and executed_query_count < MAX_SEARCH_TASKS:
            current_query = search_tasks_queue.get()
            if current_query in executed_queries:
                 continue
            executed_queries.add(current_query)
            executed_query_count += 1
            print(f"--- Starting task for query: {current_query} ({executed_query_count}/{MAX_SEARCH_TASKS}) ---")
            future = executor.submit(perform_search_task, full_query, current_query, geo_headers, visited_urls)
            future_to_query[future] = current_query

        # Process results as they complete and potentially add new tasks
        # Using tqdm for progress on the futures as they complete
        for future in tqdm(as_completed(future_to_query), total=len(future_to_query), desc="Processing Search Tasks", unit="task"):
            query_that_finished = future_to_query[future]
            try:
                processed_data, suggested_queries = future.result()
                all_processed_info.extend(processed_data)
                for bundle in processed_data:
                     all_sources.update(bundle.get("sources", []))

                # Add suggested queries to the queue if we haven't hit the limit
                for next_query in suggested_queries:
                     if next_query not in executed_queries and executed_query_count < MAX_SEARCH_TASKS:
                          search_tasks_queue.put(next_query)
                          # Note: We don't immediately submit here. We'll refill the executor pool
                          # after processing a batch or when slots become free.
                          # For simplicity in this script, we'll just add to queue and check limit
                          # before starting *new* tasks from the queue.
                          # A more complex loop would actively manage the pool based on queue size.


            except Exception as exc:
                print(f"[!] Task for query '{query_that_finished}' generated an exception: {exc}")

            # This simple loop structure processes completed tasks and *then* checks the queue
            # to potentially add new tasks. A more dynamic approach would manage the queue
            # and thread pool more actively. Let's add a logic to add new tasks if slots are free.
            while len(future_to_query) < MAX_WORKERS and not search_tasks_queue.empty() and executed_query_count < MAX_SEARCH_TASKS:
                 next_query = search_tasks_queue.get()
                 if next_query in executed_queries:
                      continue
                 executed_queries.add(next_query)
                 executed_query_count += 1
                 print(f"--- Starting task for query: {next_query} ({executed_query_count}/{MAX_SEARCH_TASKS}) ---")
                 future = executor.submit(perform_search_task, full_query, next_query, geo_headers, visited_urls)
                 future_to_query[future] = next_query


        # Wait for any remaining tasks to complete if the queue was fully processed before the loop ended
        # (as_completed already waits, but good to be explicit if managing queue differently)
        # print("Waiting for any final tasks to complete...") # Optional: add final waiting message


    print("\n--- Finished search and processing steps ---")

    if not all_processed_info:
        return {"question": full_query, "answer": "Could not gather any relevant information from web searches.", "sources": []}

    # Step 3: Synthesize the final answer from processed information
    print("\n📝 Synthesizing final answer...")
    final_answer = synthesize_final_answer(full_query, all_processed_info, access_time)

    return {
        "question": full_query,
        "answer": final_answer,
        "sources": list(all_sources) # Convert set back to list for output
    }

# ========= Entry Point =========
if __name__ == "__main__":
    user_q = input("Enter your complex question: ")
    result = smart_search_agent_pipeline(user_q)

    print(f"\n===== Final Result =====")
    if "error" in result:
        print("[❌]", result["error"])
    else:
        print("\n💬 Answer:\n", result["answer"])
        print("\n🔗 Sources:")
        if result["sources"]:
            for i, src in enumerate(result["sources"]):
                print(f"{i+1}. {src}")
        else:
            print("No specific sources found or listed in processed information.")

    print(f"\n===== Pipeline Finished =====\n")
