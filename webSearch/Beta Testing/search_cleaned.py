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
from urllib.parse import urlparse, urljoin

# ========= Configuration =========
MAX_RETRIES = 3
MAX_WORKERS = 10 # Workers for concurrent search & scraping
SEARCH_TIMEOUT = 10 # seconds for individual search/scrape
LLM_TIMEOUT = 60 # seconds for LLM calls

# Dynamic configuration based on complexity and input
MAX_INITIAL_SEARCH_QUERIES = 1 # Initial base, can be increased
MAX_TEXT_RESULTS_PER_QUERY = 5 # Base results per query
MAX_SCRAPED_CHARS_PER_PAGE = 4000 # Limit text per page before processing
MAX_TOTAL_SCRAPED_CHARS = 20000 # Limit total text fed into the final synthesis LLM
MAX_TOTAL_IMAGES = 3 # Max total images to collect across all scrapes (Set to 3 as requested)
MAX_SEARCH_RESULTS_OVERALL = 15 # Cap on total search results considered for scraping

# ========= Utilities =========

def query_llm(messages, seed=42, timeout=LLM_TIMEOUT):
    """Robust LLM query function with retries."""
    api_url = "https://text.pollinations.ai/openai"
    payload = {
        "model": "openai", # Using OpenAI model for better understanding/planning
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
            print(f"[!] LLM Request timed out (Attempt {attempt}/{MAX_RETRIES})", file=sys.stderr)
            sleep(2 ** attempt)
        except requests.exceptions.RequestException as e:
            print(f"[!] LLM Request failed (Attempt {attempt}/{MAX_RETRIES}): {e}", file=sys.stderr)
            sleep(2 ** attempt)
        except KeyError:
            # print("Response:", res.text) # Debug print if needed
            print(f"[!] LLM response missing expected key 'choices' (Attempt {attempt}/{MAX_RETRIES})", file=sys.stderr)
            sleep(2 ** attempt)
            return "" # Return empty string if expected structure is missing
        except Exception as e:
             print(f"[!] Unexpected error during LLM call (Attempt {attempt}/{MAX_RETRIES}): {e}", file=sys.stderr)
             sleep(2 ** attempt)
    print(f"[!] LLM query failed after {MAX_RETRIES} attempts.", file=sys.stderr)
    return "" # Return empty string if all retries fail

def scrape_text_from_url(url, headers=None, timeout=SEARCH_TIMEOUT, max_chars=None):
    """Scrapes text and finds image URLs from a single URL."""
    headers = headers or {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OpenSearch/1.6 (+https://github.com/example/opensearchagent)"} # More common user agent
    max_chars = max_chars if max_chars is not None else MAX_SCRAPED_CHARS_PER_PAGE

    try:
        res = requests.get(url, timeout=timeout, headers=headers)
        res.raise_for_status()

        content_type = res.headers.get('Content-Type', '').lower()
        if 'text/html' not in content_type:
            return "", [] # Return text and image_urls

        soup = BeautifulSoup(res.text, "html.parser")

        # Remove unwanted tags
        for unwanted in soup(["script", "style", "nav", "header", "footer", "aside", "form", "button", "noscript", "svg", "canvas", "iframe"]):
            unwanted.decompose()

        image_urls_found = set()
        # Find images within the main content area if possible
        main_content = soup.find('main') or soup.find('article') or soup.body
        if main_content:
            for img_tag in main_content.find_all('img', src=True):
                img_src = img_tag['src']
                # Basic check for common image extensions
                if re.match(r'.*\.(?:png|jpg|jpeg|gif|webp|aivf|svg)\b', img_src, re.IGNORECASE):
                    # Resolve relative URLs
                    absolute_img_url = urljoin(url, img_src)
                    if absolute_img_url.startswith('http'):
                         # Simple heuristic to filter out potential non-content images
                         if not any(keyword in absolute_img_url.lower() for keyword in ['logo', 'icon', 'banner', 'sprite']):
                            image_urls_found.add(absolute_img_url)

        # Also check OpenGraph/Twitter meta tags for a primary image
        meta_image = soup.find('meta', property='og:image') or soup.find('meta', name='twitter:image')
        if meta_image and meta_image.get('content'):
             img_src = meta_image['content']
             absolute_img_url = urljoin(url, img_src)
             if absolute_img_url.startswith('http') and re.match(r'.*\.(?:png|jpg|jpeg|gif|webp|aivf|svg)\b', absolute_img_url, re.IGNORECASE):
                 image_urls_found.add(absolute_img_url)


        if not main_content:
             # Fallback to body if main content isn't found
             main_content = soup.body
             if not main_content: return "", list(image_urls_found) # Return if body is also empty

        paragraphs = main_content.find_all("p")
        text = "\n".join(p.get_text() for p in paragraphs)

        text = text.strip()

        # Basic quality check for text
        if len(text) < 100:
             return "", list(image_urls_found)
        if len(text) > max_chars:
             text = text[:max_chars]

        return text, list(image_urls_found)

    except requests.exceptions.Timeout:
        # print(f"[!] Scrape timed out: {url}", file=sys.stderr)
        return "", []
    except requests.exceptions.RequestException as e:
        # print(f"[!] Scrape failed {url} due to request error: {e}", file=sys.stderr)
        return "", []
    except Exception as e:
        # print(f"[!] Scrape failed {url} during parsing: {e}", file=sys.stderr)
        return "", []

# ========= LLM Prompting Functions =========

def analyze_query_and_plan(full_query):
    """Analyzes the query, identifies potential URLs, and plans search queries based on complexity."""
    prompt = (
        "Analyze the following user query and determine:\n"
        "1. Are there any specific URLs mentioned that should be visited first? List them as a JSON array of strings, or an empty array if none.\n"
        "2. What is the complexity of the query? (Simple, Medium, Complex)\n"
        "3. Suggest 1-3 concise web search queries based on the *non-URL* parts of the query or the overall topic, suitable for a standard search engine. Focus on terms likely to yield direct results.\n"
        "4. Based on the complexity, suggest a reasonable number of search results to consider scraping (between 5 and 15, prefer lower for Simple). Respond with just the number.\n"
        "\n"
        "Respond strictly as a JSON object with keys: 'urls', 'complexity', 'search_queries', 'max_search_results'.\n"
        "\n"
        f"Query: {full_query}"
    )
    messages = [
        {"role": "system", "content": "You are an expert query analyzer and search planner. Extract URLs, assess complexity, and generate relevant search queries and search result counts."},
        {"role": "user", "content": prompt}
    ]
    response = query_llm(messages)
    try:
        plan = loads(response)
        if not isinstance(plan, dict) or 'urls' not in plan or 'complexity' not in plan or 'search_queries' not in plan or 'max_search_results' not in plan:
             print(f"[!] LLM planning failed: Invalid JSON structure. Response:\n{response}", file=sys.stderr)
             return [], [full_query], 5 # Fallback
        
        # Validate and sanitize the plan
        urls_to_visit = [url for url in plan.get('urls', []) if url.startswith('http')] # Only process valid URLs
        search_queries = [q for q in plan.get('search_queries', []) if isinstance(q, str) and q.strip()]
        if not search_queries and not urls_to_visit: # Ensure at least one search query if no URLs were found
             search_queries = [full_query]
        search_queries = search_queries[:MAX_INITIAL_SEARCH_QUERIES] # Limit initial queries based on config

        max_results = int(plan.get('max_search_results', 5))
        max_results = max(5, min(max_results, MAX_SEARCH_RESULTS_OVERALL)) # Clamp between 5 and MAX_SEARCH_RESULTS_OVERALL

        return urls_to_visit, search_queries, max_results

    except JSONDecodeError:
        print(f"[!] LLM planning failed: Could not decode JSON. Response:\n{response}", file=sys.stderr)
        return [], [full_query], 5 # Fallback
    except Exception as e:
        print(f"[!] LLM planning failed unexpectedly: {e}", file=sys.stderr)
        return [], [full_query], 5 # Fallback


def resynthesize_and_refine(original_query, current_answer, all_scraped_text, all_image_urls, access_time_str):
    """(Optional) Uses LLM to refine the answer or generate follow-up search queries."""
    # This function can be extended for replanning or iterative refinement.
    # For now, we'll make it generate a refined answer if needed.
    if not all_scraped_text.strip() and not all_image_urls:
        return current_answer # Nothing new to add

    prompt = (
        f"Accessed On: {access_time_str}\n\n"
        "You have already generated a preliminary answer based on some information. Now, you have additional context from web searches and potentially images.\n"
        "Refine or expand the previous answer based *only* on this new context and the 'Accessed On' time.\n"
        "Integrate information from the new text smoothly. Pay attention to dates and times mentioned relative to the 'Accessed On' time.\n"
        "If relevant images were found during text scraping and are provided as markdown links, you can refer to them conceptually if the text provides captions.\n"
        "If the new text is insufficient to add meaningful information, reiterate the previous answer or state that not much new was found.\n"
        "Do not use outside knowledge. Focus on the information given.\n"
        "Format the answer clearly with paragraphs.\n\n"
        f"Original Question: {original_query}\n\n"
        f"Previous Answer:\n{current_answer}\n\n"
        f"Additional Context from Web Searches and Scraped Images:\n{all_scraped_text}\n" # Image markdown included in main synthesis
    )
    messages = [
        {"role": "system", "content": "You are an expert information synthesizer and refiner. Improve an existing answer using new context."},
        {"role": "user", "content": prompt}
    ]
    # Use the main synthesis function to do the refinement, simplifying the logic
    return synthesize_final_answer(original_query, all_scraped_text, all_image_urls, access_time_str)


def decide_on_images(initial_image_urls, scraped_text_by_url):
    """Uses LLM to decide which images are most relevant and reliable based on scraped text context."""
    if not initial_image_urls:
        return []

    # Create a context string combining image URLs and text snippets from their origin pages
    context_snippets = []
    for img_url in initial_image_urls:
        # Find the text associated with the URL where this image was found
        origin_url = None
        for url, text in scraped_text_by_url.items():
             if img_url in text: # Simple check if the image URL was mentioned in the text
                  origin_url = url
                  break

        if origin_url and scraped_text_by_url.get(origin_url):
             snippet = scraped_text_by_url[origin_url]
             # Take a snippet around the image if possible, or just the start of the text
             context_snippets.append(f"Image URL: {img_url}\nOrigin URL: {origin_url}\nText Snippet:\n{snippet[:500]}...\n---\n")
        else:
            context_snippets.append(f"Image URL: {img_url}\nOrigin URL: Unknown/No text scraped\n---\n")


    prompt = (
        "Analyze the following list of image URLs and the text snippets from the pages where they were found.\n"
        "Decide which of these images are most likely to be relevant and reliable for answering the original user's query.\n"
        "Consider the image URL itself (keywords, domain), and the context from the page text.\n"
        "Select up to 3 images that seem most directly related to the core topic and appear to be from reputable sources (e.g., official sites, news outlets, educational resources).\n"
        "If no images seem clearly relevant or reliable based on the context, return an empty array.\n"
        "Respond strictly as a JSON array of the selected image URLs:\n"
        "[\"selected_image_url_1\", \"selected_image_url_2\", ...]\n\n"
        "Context:\n" + "\n".join(context_snippets) +
        f"\nOriginal Query: {synthesize_final_answer.original_query}" # Access original query (workaround)
    )

    messages = [
        {"role": "system", "content": f"You are an image relevance and reliability assessor. Select the most useful images from a list based on surrounding text context. Original Query: {synthesize_final_answer.original_query}"},
        {"role": "user", "content": prompt}
    ]

    response = query_llm(messages)
    try:
        selected_images = loads(response)
        if not isinstance(selected_images, list):
             print(f"[!] LLM image selection failed: Invalid JSON structure. Response:\n{response}", file=sys.stderr)
             return initial_image_urls[:MAX_TOTAL_IMAGES] # Fallback to simply taking the first few
        return selected_images[:MAX_TOTAL_IMAGES] # Ensure we don't exceed the overall limit
    except JSONDecodeError:
        print(f"[!] LLM image selection failed: Could not decode JSON. Response:\n{response}", file=sys.stderr)
        return initial_image_urls[:MAX_TOTAL_IMAGES] # Fallback
    except Exception as e:
        print(f"[!] LLM image selection failed unexpectedly: {e}", file=sys.stderr)
        return initial_image_urls[:MAX_TOTAL_IMAGES] # Fallback


# This line is moved after the synthesize_final_answer function definition



def synthesize_final_answer(original_query, all_scraped_text_by_url, all_image_urls, access_time_str):
    """Uses LLM to synthesize a final answer with source attribution for paragraphs."""

# Workaround to pass original query to decide_on_images
    synthesize_final_answer.original_query = ""

    if not all_scraped_text_by_url and not all_image_urls:
        return "Could not find enough relevant information or images to answer the query."

    # Prepare text for the LLM, noting the source URL for each block
    context_with_sources = ""
    total_chars = 0
    for url, text in all_scraped_text_by_url.items():
         if text and total_chars < MAX_TOTAL_SCRAPED_CHARS:
              text_to_add = text
              if total_chars + len(text_to_add) > MAX_TOTAL_SCRAPED_CHARS:
                   text_to_add = text_to_add[:MAX_TOTAL_SCRAPED_CHARS - total_chars]
              context_with_sources += f"--- Content from {url} ---\n{text_to_add}\n\n"
              total_chars += len(text_to_add)

    image_markdown = ""
    if all_image_urls:
        image_markdown = "\n\n--- Relevant Images Found During Scraping ---\n\n" + "\n".join([f"![Relevant Image]({url})" for url in all_image_urls])

    prompt = (
        f"Accessed On: {access_time_str}\n\n"
        "You are a comprehensive AI assistant. Synthesize a detailed and accurate answer to the original question based *only* on the provided text and the 'Accessed On' time.\n"
        "The text is provided with source URLs clearly marked (e.g., '--- Content from <URL> ---').\n"
        "For each distinct idea or paragraph in your answer, cite the source URL(s) that primarily supported that idea using markdown reference links at the end of the paragraph, like [1] or [2, 3]. List the full URLs under a 'Sources' section at the end of your answer.\n"
        "Integrate information from the text smoothly. Pay attention to dates and times mentioned in the text relative to the 'Accessed On' time.\n"
         "If relevant images were found during text scraping and are provided as markdown links, you can refer to them conceptually if the text provides captions.\n"
        "If the text is insufficient to fully answer, state that clearly.\n"
        "Do not use outside knowledge. Focus on the information given.\n"
        "Format the answer clearly with paragraphs and markdown citations.\n"
        "At the very end, list the full URLs used for citations under a 'Sources' heading, using numerical labels corresponding to the citation markers (e.g., [1]: <URL>).\n\n"
        f"Original Question: {original_query}\n\n"
        f"Context from Web Searches and Scraped Images:\n{context_with_sources}\n{image_markdown}"
    )
    messages = [
        {"role": "system", "content": "You are an expert information synthesizer and source attributor. Compose a comprehensive answer using the provided context and timestamp, citing sources for each point and referring to images found during scraping."},
        {"role_content": prompt, "role": "user"}
    ]
    return query_llm(messages)


# ========= Agent / Task Functions =========

def scrape_single_url_task(url, geo_headers, visited_urls, global_image_set, max_total_images):
    """Task to scrape a single URL provided directly by the user or planning."""
    if url in visited_urls:
        return "", "", [] # Return empty if already visited

    print(f"📄 Scraping provided URL: {url}", file=sys.stderr)
    # Check if adding images from this URL would exceed the global limit
    can_collect_more_images = len(global_image_set) < max_total_images

    text, images_on_page = scrape_text_from_url(url, headers=geo_headers, max_chars=MAX_SCRAPED_CHARS_PER_PAGE)

    if text:
        visited_urls.add(url)
        scraped_text = text
        source = url
        local_image_urls_found = []
        if images_on_page and can_collect_more_images:
             for img_url in images_on_page:
                  if len(global_image_set) + len(local_image_urls_found) < max_total_images:
                       local_image_urls_found.append(img_url)
                  else:
                       break
        return scraped_text, source, local_image_urls_found
    else:
        return "", "", []


def perform_text_search_and_scrape(search_query, geo_headers, visited_urls, global_image_set, max_search_results_overall, max_images_overall):
    """Performs a single text search, scrapes relevant results (up to the overall limit), and collects found images."""
    print(f"--- Starting text search and scrape for: {search_query} ---", file=sys.stderr)

    scraped_text_by_url = {} # Store text keyed by URL for source attribution
    local_image_urls_found = set() # Collect images found in this task's scrapes
    urls_to_scrape_from_search = []

    try:
        with DDGS() as ddgs:
            # Limit results here based on the dynamic max_search_results_overall
            search_results = [r for r in ddgs.text(search_query, max_results=max_search_results_overall) if r and r.get("href")]
    except Exception as e:
        print(f"[!] DuckDuckGo Text Search error for '{search_query}': {e}", file=sys.stderr)
        return {}, [], [] # Return empty

    if not search_results:
        print(f"--- No initial results for search: {search_query} ---", file=sys.stderr)
        return {}, [], []

    # Filter results based on already visited URLs and the overall limit
    filtered_results = [r for r in search_results if r.get("href") not in visited_urls][:max_search_results_overall - len(visited_urls)] # Only consider results not already visited, up to limit

    if not filtered_results:
         print(f"--- All relevant results for '{search_query}' already visited or exceeded limit. ---", file=sys.stderr)
         return {}, [], []

    # Collect URLs to scrape from the filtered results
    urls_to_scrape_from_search = [r["href"] for r in filtered_results]

    # Use a nested ThreadPoolExecutor for scraping the found URLs concurrently
    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(urls_to_scrape_from_search))) as scraper_executor:
        scrape_futures = {scraper_executor.submit(scrape_text_from_url, url, geo_headers, SEARCH_TIMEOUT, MAX_SCRAPED_CHARS_PER_PAGE): url for url in urls_to_scrape_from_search}

        current_scraped_chars = 0
        for future in tqdm(as_completed(scrape_futures), total=len(scrape_futures), desc=f"Scraping search results for '{search_query[:30]}...'", unit="page", leave=False):
            url_that_finished = scrape_futures[future]
            try:
                text, images_on_page = future.result()
                if text:
                    # Check if adding this text exceeds the total character limit
                    if current_scraped_chars + len(text) <= MAX_TOTAL_SCRAPED_CHARS:
                        scraped_text_by_url[url_that_finished] = text
                        visited_urls.add(url_that_finished) # Mark as visited only if text was successfully scraped
                        current_scraped_chars += len(text)

                    # Check if adding images from this URL would exceed the global limit
                    can_collect_more_images = len(global_image_set) + len(local_image_urls_found) < max_images_overall

                    if images_on_page and can_collect_more_images:
                        for img_url in images_on_page:
                            if len(global_image_set) + len(local_image_urls_found) < max_images_overall:
                                local_image_urls_found.add(img_url)
                            else:
                                break # Stop collecting images once global limit is reached

                # Stop scraping more pages from this search query if we hit the total char limit
                if current_scraped_chars >= MAX_TOTAL_SCRAPED_CHARS:
                     print(f"[!] Reached total char limit for scraping. Stopping further scrapes.", file=sys.stderr)
                     break


            except Exception as exc:
                # print(f"[!] Scrape task for '{url_that_finished}' generated an exception: {exc}", file=sys.stderr) # Keep error log
                pass # Silently fail on scrape errors

    print(f"--- Finished text search and scrape for: {search_query} (Scraped {len(scraped_text_by_url)} pages, Found {len(local_image_urls_found)} images) ---", file=sys.stderr)

    # Return scraped text organized by URL, list of scraped URLs, and images found
    return scraped_text_by_url, list(scraped_text_by_url.keys()), list(local_image_urls_found)


# ========= Master Function (Integrated Search & Scraping) =========

def smart_search_agent_pipeline(full_query):
    access_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Using a single executor for all worker tasks
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:

        geo_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OpenSearch/1.6 (+https://github.com/example/opensearchagent)",
            "X-Forwarded-For": "auto", # Example: dynamic IP header (less effective without real geo-IP)
            "Accept-Language": "en-US,en;q=0.9,en-IN;q=0.8"
        }

        # Step 1: Analyze query, identify URLs, plan search queries, and set dynamic limits
        print("🧠 Analyzing query and planning...", file=sys.stderr)
        urls_to_visit_directly, initial_text_queries, max_search_results_overall = analyze_query_and_plan(full_query)
        print(f"Plan: Visit {len(urls_to_visit_directly)} URLs, Search Queries: {initial_text_queries}, Max Search Results to Consider: {max_search_results_overall}", file=sys.stderr)


        visited_urls = set()
        all_scraped_text_by_url = {} # Store text keyed by URL
        all_potential_images = set() # Collect all image URLs found

        # Step 2: Scrape provided URLs concurrently
        url_scrape_futures = {}
        if urls_to_visit_directly:
             print("\n📄 Scraping provided URLs...", file=sys.stderr)
             for url in urls_to_visit_directly:
                  future = executor.submit(scrape_single_url_task, url, geo_headers, visited_urls, all_potential_images, MAX_TOTAL_IMAGES)
                  url_scrape_futures[future] = url

             for future in tqdm(as_completed(url_scrape_futures), total=len(url_scrape_futures), desc="Scraping Provided URLs", unit="url"):
                  url_that_finished = url_scrape_futures[future]
                  try:
                       scraped_text, source_url, images_from_url = future.result()
                       if scraped_text:
                            all_scraped_text_by_url[source_url] = scraped_text
                            all_potential_images.update(images_from_url)
                  except Exception as exc:
                       print(f"[!] Provided URL scrape task for '{url_that_finished}' generated an exception: {exc}", file=sys.stderr)


        # Step 3: Execute text search and scrape tasks concurrently
        text_search_futures = {}
        print("\n🌐 Starting text search and scraping from web results...", file=sys.stderr)
        for query in initial_text_queries:
            # Pass visited_urls and image sets to tasks so they can respect global state
            future = executor.submit(perform_text_search_and_scrape, query, geo_headers, visited_urls, all_potential_images, max_search_results_overall, MAX_TOTAL_IMAGES)
            text_search_futures[future] = query # Store query with future


        for future in tqdm(as_completed(text_search_futures), total=len(text_search_futures), desc="Text Search & Scraping", unit="task"):
            query_that_finished = text_search_futures[future]
            try:
                # Capture text by URL, sources, and images from the task result
                scraped_text_from_search, sources_from_search, images_from_task = future.result()

                all_scraped_text_by_url.update(scraped_text_from_search) # Merge text by URL
                all_potential_images.update(images_from_task) # Add images found in this search batch

            except Exception as exc:
                print(f"[!] Text search/scrape task for '{query_that_finished}' generated an exception: {exc}", file=sys.stderr)


        print("\n--- Finished text search and scraping ---", file=sys.stderr)

        # Step 4: Decide which images are most relevant and reliable
        print("🖼️ Deciding on relevant images...", file=sys.stderr)
        final_image_urls = decide_on_images(list(all_potential_images), all_scraped_text_by_url)
        print(f"Selected {len(final_image_urls)} final images.", file=sys.stderr)


        # Step 5: Synthesize the final answer from all collected information
        print("\n📝 Synthesizing final answer...", file=sys.stderr)

        # Flatten scraped text for initial synthesis pass if needed, but keep by URL for final pass
        # For the final synthesis, we pass the dict with URLs for citation
        final_answer = synthesize_final_answer(full_query, all_scraped_text_by_url, final_image_urls, access_time_str)


    # Post-processing: Extract sources from the final answer text
    # This is a heuristic and might not be perfect depending on LLM formatting
    cited_sources = {}
    source_section_match = re.search(r'## Sources\s*\n', final_answer)
    if source_section_match:
         source_section_text = final_answer[source_section_match.end():].strip()
         # Split by potential citation formats like "[1]:" or "1."
         source_entries = re.split(r'\n\s*(?=\[\d+\]:|<URL>|\d+\.)', source_section_text)
         for entry in source_entries:
              entry = entry.strip()
              if entry:
                   # Try to extract number and URL
                   match = re.match(r'\[?(\d+)\]?:?\s*<?(http.*?)(?:>)?', entry)
                   if match:
                        num = match.group(1)
                        url = match.group(2).strip()
                        if url:
                             cited_sources[int(num)] = url
                   else:
                        # Fallback: try to find any URL in the line
                        url_match = re.search(r'<(http.*?)>', entry) or re.search(r'(http\S+)', entry)
                        if url_match:
                             # Use a dummy number or infer
                             cited_sources[len(cited_sources) + 1] = url_match.group(1)


    # Remove the source section from the main answer text
    if source_section_match:
         final_answer = final_answer[:source_section_match.start()].strip()


    # Return the result data dictionary
    return {
        "question": full_query,
        "answer": final_answer,
        "sources": [url for num, url in sorted(cited_sources.items())], # Return sorted list of cited URLs
        "images": final_image_urls
    }

# ========= Script Code Only =========
if __name__ == "__main__":
    user_q = input("Enter your complex question (include URLs if desired): ")
    result = smart_search_agent_pipeline(user_q)

    print("\n--- Final Result ---")
    print(f"## Answer\n\n{result.get('answer', 'Could not find a relevant answer.')}\n")

    sources = result.get("sources", [])
    if sources:
        print("## Sources")
        # Print sources with numbers matching potential markdown citations
        # Note: The numbers below might not perfectly match the LLM's markdown
        # citations if its formatting is inconsistent, but it provides the mapping.
        for i, src in enumerate(sources):
            print(f"[{i+1}]: <{src}>")
        print("")

    images = result.get("images", [])
    if images:
        print("## Relevant Images (from scraped pages)")
        for img_url in images:
            print(f"![Relevant Image]({img_url})")
            print(f"<{img_url}>")
        print("")

    print("--- End of Result ---")