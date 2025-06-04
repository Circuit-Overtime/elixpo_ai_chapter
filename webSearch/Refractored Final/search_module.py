import requests
import json
import datetime
import re
import time
from urllib.parse import urljoin, urlparse, parse_qs
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
from pytube import YouTube, exceptions
from duckduckgo_search import DDGS
from bs4 import BeautifulSoup
import math
import mimetypes
from tqdm import tqdm  
import random 
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# --- Configuration ---
MAX_SEARCH_RESULTS_PER_QUERY = 8
MAX_SCRAPE_WORD_COUNT = 2000
MAX_TOTAL_SCRAPE_WORD_COUNT = 8000
MIN_PAGES_TO_SCRAPE = 3
MAX_PAGES_TO_SCRAPE = 10 
MAX_IMAGES_TO_INCLUDE = 3
MAX_TRANSCRIPT_WORD_COUNT = 6000
DUCKDUCKGO_REQUEST_DELAY = 3 
REQUEST_RETRY_DELAY = 5
MAX_REQUEST_RETRIES = 3
MAX_DUCKDUCKGO_RETRIES = 5 
CLASSIFICATION_MODEL = "OpenAI GPT-4.1-nano" 
SYNTHESIS_MODEL = "openai-large"           



def exponential_backoff(attempt, base_delay=REQUEST_RETRY_DELAY, max_delay=60):
    """Calculates exponential backoff delay with jitter."""
    delay = min(max_delay, base_delay * (2 ** attempt))
    return delay + random.uniform(0, base_delay)

def query_pollinations_ai(messages, model=SYNTHESIS_MODEL, retries=MAX_REQUEST_RETRIES):
    for attempt in range(retries):
        payload = {
            "model": model,
            "messages": messages,
            "seed": 518450,
            "token" : "fEWo70t94146ZYgk",
            "referrer" : "elixpoart"
        }

        url = "https://text.pollinations.ai/openai"
        headers = {
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=30) # Added timeout
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            if e.response.status_code in [401, 403, 404]:
                print(f"Attempt {attempt + 1} failed: Client error {e.response.status_code} querying Pollinations AI ({model}). Not retrying.")
                return None # Don't retry on client errors
            print(f"Attempt {attempt + 1} failed: HTTP error {e.response.status_code} querying Pollinations AI ({model}): {e}. Retrying in {exponential_backoff(attempt):.2f} seconds.")
            time.sleep(exponential_backoff(attempt))
        except requests.exceptions.RequestException as e:
            print(f"Attempt {attempt + 1} failed: Error querying Pollinations AI ({model}): {e}. Retrying in {exponential_backoff(attempt):.2f} seconds.")
            time.sleep(exponential_backoff(attempt))
        except Exception as e:
             print(f"Attempt {attempt + 1} failed: Unexpected error querying Pollinations AI ({model}): {e}. Retrying in {exponential_backoff(attempt):.2f} seconds.")
             time.sleep(exponential_backoff(attempt))

    print(f"Failed to query Pollinations AI ({model}) after {retries} attempts.")
    return None


def extract_urls_from_query(query):
    """
    Extracts URLs from the user's query and categorizes them.
    """
    
    urls = re.findall(r'(https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+(?:[-\w.!~*\'()@;:$+,?&/=#%]*))', query)
    cleaned_query = re.sub(r'(https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+(?:[-\w.!~*\'()@;:$+,?&/=#%]*))', '', query).strip()

    website_urls = []
    youtube_urls = []

    for url in urls:
        
        url = url.rstrip('...') 
        parsed_url = urlparse(url)
        if "youtube.com" in parsed_url.netloc or "youtu.be" in parsed_url.netloc:
            youtube_urls.append(url)
        else:
            website_urls.append(url)

    return website_urls, youtube_urls, cleaned_query

def get_youtube_video_id(url):
    """
    Extracts the video ID from a YouTube URL.
    """
    parsed_url = urlparse(url)
    if "youtube.com" in parsed_url.netloc:
        video_id = parse_qs(parsed_url.query).get('v')
        if video_id:
            return video_id[0]
    elif "youtu.be" in parsed_url.netloc:
        if parsed_url.path and len(parsed_url.path) > 1:
            return parsed_url.path[1:]
    return None

def get_youtube_transcript(video_id):
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        transcript = transcript_list.find_transcript(['en', 'a.en']) 
        if transcript:
             full_transcript = " ".join([entry['text'] for entry in transcript.fetch()])
             
             return full_transcript[:MAX_TRANSCRIPT_WORD_COUNT] + ("..." if len(full_transcript) > MAX_TRANSCRIPT_WORD_COUNT else "")
        else:
             return None 

    except NoTranscriptFound:
        
        return None
    except TranscriptsDisabled:
        
        return None
    except Exception:
        
        return None

def get_youtube_video_metadata(url):
    try:
        yt = YouTube(url)
        _ = yt.streams.filter(progressive=True, file_extension='mp4').first() 
        metadata = {
            'title': yt.title,
            'author': yt.author,
            'publish_date': yt.publish_date.strftime("%Y-%m-%d %H:%M:%S") if yt.publish_date else "Date Unknown",
            'length': f"{yt.length // 60}m {yt.length % 60}s" if yt.length is not None else "Unknown Length",
            'views': f"{yt.views:,}" if yt.views is not None else "Unknown Views", # Format views nicely
            'description': yt.description[:500] + "..." if yt.description and len(yt.description) > 500 else yt.description
        }
        return metadata
    except exceptions.VideoUnavailable:
        # print(f"Pytube: VideoUnavailable for {url}.") # Handled by tqdm description
        return None
    except exceptions.LiveStreamError:
        # print(f"Pytube: LiveStreamError for {url}. Cannot get metadata for live streams.") # Handled by tqdm description
        return None
    except exceptions.RegexMatchError:
        # print(f"Pytube: RegexMatchError for {url}. URL format issue?") # Handled by tqdm description
        return None
    except Exception:
        # print(f"Pytube: Other error getting metadata for {url}: {e}") # Handled by tqdm description
        return None

def is_likely_search_result_url(url):
    if not url:
        return False
    parsed_url = urlparse(url)
    if any(domain in parsed_url.netloc for domain in ['google.com', 'duckduckgo.com', 'bing.com', 'yahoo.com']):
        # Check common search path patterns
        if parsed_url.path.startswith('/search') or parsed_url.path.startswith('/html') or parsed_url.path.startswith('/res') or parsed_url.path == '/':
             return True
        # Check for search query parameters
        if parsed_url.query:
            query_params = parse_qs(parsed_url.query)
            if any(param in query_params for param in ['q', 'query', 'p', 'wd']):
                 return True
    return False

def is_likely_image(url):
    """
    Basic check to see if a URL likely points to a relevant image based on heuristics.
    Avoids common icons, logos, and very small images.
    """
    if not url:
        return False

    if not url.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')):
        return False

    if any(keyword in url.lower() for keyword in ['icon', 'logo', 'loader', 'sprite', 'thumbnail', 'small', 'avatar', 'advert', 'ad_']):
        return False

    if re.search(r'/\d+x\d+/', url) or re.search(r'-\d+x\d+\.', url):
        return False

    # Attempt to head request (faster than GET) to check content type and size (optional but good)
    # Keeping this disabled by default as of now since it is adding latency and might be blocked region based
    #will update later overtime!
    # try:
    #     response = requests.head(url, timeout=3, headers={'User-Agent': 'Mozilla/5.0 (compatible; AcmeInc/1.0)'}) # Use a generic User-Agent
    #     if 'Content-Type' in response.headers and response.headers['Content-Type'].lower().startswith('image/'):
    #         # Could add size check here based on 'Content-Length' header if available
    #         # if 'Content-Length' in response.headers and int(response.headers['Content-Length']) < 2000: # e.g., less than 2KB
    #         #     return False
    #         return True
    # except requests.exceptions.RequestException:
    #     pass # Ignore errors, fall back to URL heuristics

    return True 
def scrape_website(url, scrape_images=True, total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT):
    """
    Scrapes text content and potentially relevant image URLs from a given URL with limits.
    Includes basic image filtering and improved retry logic that skips 403s.
    """
    text_content = ""
    image_urls = []
    retries = MAX_REQUEST_RETRIES
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; AcmeInc/1.0)'} 
    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=15, headers=headers) 
            response.raise_for_status() 
            soup = BeautifulSoup(response.content, 'html.parser')

            
            for script_or_style in soup(['script', 'style']):
                script_or_style.extract()

            temp_text = ''
            for tag in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'div', 'article', 'main']):
                 text = tag.get_text()
                 text = re.sub(r'\s+', ' ', text).strip() 
                 if text:
                     temp_text += text + '\n\n' 

            words = temp_text.split()
            page_word_limit = min(MAX_SCRAPE_WORD_COUNT, total_word_count_limit - len(text_content.split()))
            if page_word_limit <= 0:
                text_content = "" 
            elif len(words) > page_word_limit:
                text_content = ' '.join(words[:page_word_limit]) + '...'
            else:
                text_content = temp_text.strip()

            if scrape_images:
                img_tags = soup.find_all('img')
                for img in img_tags:
                    img_url = img.get('src') or img.get('data-src') 
                    if img_url:
                        img_url = urljoin(url, img_url)
                        
                        if urlparse(img_url).path.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg')):
                            if is_likely_image(img_url): 
                                image_urls.append(img_url)
                                if len(image_urls) >= MAX_IMAGES_TO_INCLUDE:
                                    break 

            return text_content, image_urls
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                # print(f"Attempt {attempt + 1}: Received 403 Forbidden for URL: {url}. Skipping this URL.") # Handled by tqdm description
                return "", [] # Do not retry on 403
            elif e.response.status_code == 404:
                 # print(f"Attempt {attempt + 1}: Received 404 Not Found for URL: {url}. Skipping this URL.") # Handled by tqdm description
                 return "", [] # Do not retry on 404
            else:
                # print(f"Attempt {attempt + 1}: HTTP error {e.response.status_code} for URL: {url}. Retrying in {exponential_backoff(attempt):.2f}s.") # Handled by tqdm description
                time.sleep(exponential_backoff(attempt))
        except requests.exceptions.RequestException as e:
            # print(f"Attempt {attempt + 1}: Error scraping {url}: {e}. Retrying in {exponential_backoff(attempt):.2f}s.") # Handled by tqdm description
            time.sleep(exponential_backoff(attempt))
        except Exception as e:
            # print(f"Attempt {attempt + 1}: Error parsing website {url}: {e}. Retrying in {exponential_backoff(attempt):.2f}s.") # Handled by tqdm description
            time.sleep(exponential_backoff(attempt))

    # print(f"Failed to scrape content after {retries} attempts for {url}.") # Handled by tqdm description
    return "", []

# --- Planning Function (Consolidated AI Analysis) ---
def plan_execution_llm(user_query, website_urls, youtube_urls, cleaned_query, current_time_utc, location):
    """
    Uses the LLM to analyze the query, determine necessary steps (native, search, scrape, youtube),
    and plan the execution.
    """
    
    effective_cleaned_query = cleaned_query if cleaned_query else user_query

    messages = [
        {"role": "system", "content": """You are an AI assistant that analyzes user queries to determine the best strategy for finding information using native knowledge, provided URLs (websites and YouTube), and web searches. Plan the execution steps and required resources.

        Analyze the original query, the provided URLs, and the cleaned query (without URLs). Determine:
        1.  What parts of the query can be answered using your native knowledge?
        2.  What specific search queries are needed for web search (text search)?
        3.  Whether the provided website URLs should be scraped for content (are they relevant to the query?).
        4.  Whether the provided YouTube URLs should be processed (transcripts/metadata - is the query about the videos?).
        5.  Estimate the number of web pages (from search results) to scrape (between 3 and 5).
        6.  Determine the primary focus of the query (Purely Native, YouTube Focused, Mixed, Other Web Focused).

        Respond in a structured, parseable JSON format:
        ```json
        {
          "native_parts": "String describing parts answerable natively, or 'None'",
          "search_queries": ["query 1", "query 2", ...],
          "scrape_provided_websites": true/false,
          "process_provided_youtube": true/false,
          "estimated_pages_to_scrape": 3, // Number between 3 and 5
          "query_focus": "Purely Native" | "YouTube Focused" | "Mixed" | "Other Web Focused"
        }
        ```
        Ensure the JSON is valid and nothing outside the JSON block.
        Be concise in descriptions.

        Context:
        Current Time UTC: """ + current_time_utc + """
        Location (approximated): """ + location + """

        Original User Query: """ + user_query + """
        Provided Website URLs: """ + ", ".join(website_urls) if website_urls else "None" + """
        Provided YouTube URLs: """ + ", ".join(youtube_urls) if youtube_urls else "None" + """
        Cleaned Query Text (no URLs): """ + effective_cleaned_query
        },
        {"role": "user", "content": "Plan the execution strategy in the specified JSON format."}
    ]

    
    response = query_pollinations_ai(messages, model=CLASSIFICATION_MODEL)

    default_plan = {
        "native_parts": "None",
        "search_queries": [effective_cleaned_query] if effective_cleaned_query else [],
        "scrape_provided_websites": len(website_urls) > 0,
        "process_provided_youtube": len(youtube_urls) > 0,
        "estimated_pages_to_scrape": MAX_PAGES_TO_SCRAPE,
        "query_focus": "Mixed"
    }

    if response and 'choices' in response and len(response['choices']) > 0:
        ai_output = response['choices'][0]['message']['content'].strip()
        # Attempt to extract and parse JSON
        json_match = re.search(r"```json\n(.*)\n```", ai_output, re.DOTALL)
        if json_match:
            try:
                plan = json.loads(json_match.group(1))
                # Validate and sanitize plan
                plan["native_parts"] = str(plan.get("native_parts", "None"))
                plan["search_queries"] = [str(q).strip() for q in plan.get("search_queries", []) if isinstance(q, str) and q.strip()]
                plan["scrape_provided_websites"] = bool(plan.get("scrape_provided_websites", len(website_urls) > 0))
                plan["process_provided_youtube"] = bool(plan.get("process_provided_youtube", len(youtube_urls) > 0))
                plan["estimated_pages_to_scrape"] = max(MIN_PAGES_TO_SCRAPE, min(MAX_PAGES_TO_SCRAPE, int(plan.get("estimated_pages_to_scrape", MAX_PAGES_TO_SCRAPE))))
                plan["query_focus"] = plan.get("query_focus", "Mixed") # Could add validation for focus types
                print("\n--- AI Execution Plan ---")
                print(json.dumps(plan, indent=2))
                print("-------------------------")
                return plan
            except (json.JSONDecodeError, ValueError, TypeError) as e:
                # print(f"Error parsing AI plan JSON: {e}. Using default plan.")
                # print(f"AI output: {ai_output}") # Log the problematic output
                return default_plan
        else:
            # print("AI response did not contain valid JSON plan. Using default plan.")
            # print(f"AI output: {ai_output}") # Log the problematic output
            return default_plan

    print("Could not get execution plan from AI. Using default plan.")
    return default_plan


def perform_duckduckgo_text_search(query, max_results, retries=MAX_DUCKDUCKGO_RETRIES):
    """
    Performs a text search using the DuckDuckGo Search API with exponential backoff.
    """
    results = []
    for attempt in range(retries):
        try:
            
            time.sleep(DUCKDUCKGO_REQUEST_DELAY + exponential_backoff(attempt, base_delay=1, max_delay=10)) # Extra backoff for search
            with DDGS() as ddgs:
                
                search_results = list(ddgs.text(query, max_results=max_results))
                if search_results:
                    return search_results
                else:
                     # Treat no results on a specific attempt as a soft failure, retry
                     print(f"DDGS Attempt {attempt + 1}: No results returned for query '{query}'. Retrying.")
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                print(f"DDGS Attempt {attempt + 1}: Received 403 Forbidden for query '{query}'. Not retrying.")
                return [] # Do not retry on 403
            print(f"DDGS Attempt {attempt + 1}: HTTP error {e.response.status_code} for query '{query}'. Retrying in {exponential_backoff(attempt):.2f}s.")
            time.sleep(exponential_backoff(attempt))
        except Exception as e:
            # Catch Ratelimit (often not a standard HTTP error status) and other exceptions
            print(f"DDGS Attempt {attempt + 1}: Error performing text search for query '{query}': {e}. Retrying in {exponential_backoff(attempt):.2f}s.")
            time.sleep(exponential_backoff(attempt))

    # print(f"Failed to get search results after {retries} attempts for query '{query}'.") # Handled by tqdm description
    return []


def search_and_synthesize(user_input_query, show_sources=True, scrape_images=True):
    website_urls, youtube_urls, cleaned_query = extract_urls_from_query(user_input_query)

    
    current_time_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    location = ""
    try:
        response = requests.get("https://ipinfo.io/json", timeout=5) # Added timeout
        response.raise_for_status()
        location_data = response.json()
        location = location_data.get("city", "")
    except requests.exceptions.RequestException:
        location = "" 

    
    plan = plan_execution_llm(user_input_query, website_urls, youtube_urls, cleaned_query, current_time_utc, location)

    
    native_answer_content = ""
    if plan.get("native_parts") and plan["native_parts"] != "None":
        with tqdm(total=1, desc="Getting Native Answer", unit="step") as pbar:
            native_answer_messages = [
                {"role": "system", "content": f"Answer the following question based on your native knowledge: {plan['native_parts']}"},
                {"role": "user", "content": cleaned_query} 
            ]
            native_answer_response = query_pollinations_ai(native_answer_messages, model=SYNTHESIS_MODEL)
            if native_answer_response and 'choices' in native_answer_response and len(native_answer_response['choices']) > 0:
                native_answer_content = native_answer_response['choices'][0]['message']['content']
                pbar.set_postfix_str("Success")
            else:
                pbar.set_postfix_str("Failed")
                print("Warning: Could not get native answer.")
            pbar.update(1)

    youtube_transcripts_content = ""
    processed_youtube_urls = []
    if plan.get("process_provided_youtube") and youtube_urls:
        print("\nProcessing YouTube URLs...")
        with tqdm(total=len(youtube_urls), desc="Processing YouTube URLs", unit="video") as pbar:
            for url in youtube_urls:
                video_id = get_youtube_video_id(url)
                if video_id:
                    pbar.set_postfix_str(f"Fetching transcript for {video_id}")
                    transcript = get_youtube_transcript(video_id)
                    metadata = get_youtube_video_metadata(url) 
                    if transcript or metadata: #
                        youtube_transcripts_content += f"\n\n--- Content from YouTube: {url} ---\n"
                        if metadata:
                            youtube_transcripts_content += f"Title: {metadata.get('title', 'N/A')}\n"
                            youtube_transcripts_content += f"Author: {metadata.get('author', 'N/A')}\n"
                            youtube_transcripts_content += f"Published: {metadata.get('publish_date', 'N/A')}\n"
                            youtube_transcripts_content += f"Length: {metadata.get('length', 'N/A')}\n"
                            youtube_transcripts_content += f"Views: {metadata.get('views', 'N/A')}\n"
                            youtube_transcripts_content += f"Description: {metadata.get('description', 'N/A')}\n\n"
                        if transcript:
                            youtube_transcripts_content += transcript
                            pbar.set_postfix_str(f"Processed transcript for {video_id}")
                        else:
                            youtube_transcripts_content += "Transcript not available.\n"
                            pbar.set_postfix_str(f"Processed metadata (no transcript) for {video_id}")

                        processed_youtube_urls.append(url)
                    else:
                         pbar.set_postfix_str(f"Failed for {video_id}")

                else:
                    pbar.set_postfix_str(f"Invalid URL: {url}")
                pbar.update(1)


    scraped_text_content = ""
    total_scraped_words = 0
    scraped_website_urls = []
    found_image_urls = []
    urls_to_scrape = []

    # Add provided website URLs if the plan says to scrape them
    if plan.get("scrape_provided_websites") and website_urls:
         urls_to_scrape.extend(website_urls)

    # Add URLs from search results if search queries are needed
    search_urls = []
    if plan.get("search_queries"):
         print("\nPerforming Web Search...")
         for query in tqdm(plan["search_queries"], desc="Performing Web Searches", unit="query"):
              search_urls.extend([result.get('href') for result in perform_duckduckgo_text_search(query, max_results=MAX_SEARCH_RESULTS_PER_QUERY)])

         urls_to_scrape.extend(search_urls)

    unique_urls_to_scrape = []
    for url in urls_to_scrape:
        if url and url not in unique_urls_to_scrape and not is_likely_search_result_url(url):
            unique_urls_to_scrape.append(url)

    if unique_urls_to_scrape and total_scraped_words < MAX_TOTAL_SCRAPE_WORD_COUNT:
        print("\nScraping Web Content...")
        urls_for_scraping = unique_urls_to_scrape[:plan.get("estimated_pages_to_scrape", MAX_PAGES_TO_SCRAPE)]

        with tqdm(total=len(urls_for_scraping), desc="Scraping Websites", unit="page") as pbar:
            for url in urls_for_scraping:
                if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                    pbar.set_postfix_str("Total word limit reached")
                    break 

                pbar.set_postfix_str(f"Scraping {urlparse(url).hostname}")
                content, images = scrape_website(url, scrape_images=scrape_images, total_word_count_limit=MAX_TOTAL_SCRAPE_WORD_COUNT - total_scraped_words)

                if content:
                    scraped_text_content += f"\n\n--- Content from {url} ---\n{content}"
                    total_scraped_words += len(content.split())
                    scraped_website_urls.append(url)

                    if scrape_images:
                         for img_url in images:
                            if len(found_image_urls) < MAX_IMAGES_TO_INCLUDE and img_url not in found_image_urls:
                                found_image_urls.append(img_url)
                            elif len(found_image_urls) >= MAX_IMAGES_TO_INCLUDE:
                                 break 

                    pbar.set_postfix_str(f"Scraped {len(content.split())} words from {urlparse(url).hostname}")
                else:
                    pbar.set_postfix_str(f"Failed to scrape {urlparse(url).hostname}")

                pbar.update(1)
            if total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                 print("Reached total scraped word limit.")
    elif not unique_urls_to_scrape:
         print("\nNo unique URLs found for scraping.")


    print("\nSending Information to AI for Synthesis...")

    synthesis_prompt = """You are a helpful assistant. Synthesize a comprehensive, detailed, and confident answer to the user's original query based *only* on the provided information from native knowledge, scraped web pages, and YouTube transcripts.

    Present the answer in Markdown format.

    Incorporate the information logically and provide the required answer contextually.
    Include dates, times, and specific details from the provided content where relevant to make the information more lively and grounded in the sources. Pay close attention to time zones when dealing with time-related queries and convert times to be relative to the provided Current Time UTC if necessary based on the scraped data.

    **Important:** When citing information derived directly from a scraped URL (website or YouTube), include a brief inline citation or reference to the source URL where appropriate within the synthesized answer. For example: "According to [Source URL], ..." or "The video at [YouTube URL] explains that...". Aim for a natural flow, not excessive citations.

    If the provided information from all sources is insufficient to answer *any* part of the query, state that you could not find a definitive answer based on the available data.

    Avoid mentioning the web search, scraping, or transcript fetching process explicitly in the final answer (except for the inline citations).

    User Query: """ + user_input_query + """

    Current Time UTC: """ + current_time_utc + """

    Provided Information:
    """

    if native_answer_content:
        synthesis_prompt += f"--- Native Knowledge ---\n{native_answer_content}\n\n"
    else:
        synthesis_prompt += "--- Native Knowledge ---\nNone available or requested.\n\n"


    if youtube_transcripts_content:
         synthesis_prompt += f"--- YouTube Transcript and Metadata Content ---\n{youtube_transcripts_content}\n\n"
    else:
         synthesis_prompt += "--- YouTube Transcript and Metadata Content ---\nNone available or processed.\n\n"

    if scraped_text_content:
        synthesis_prompt += f"--- Scraped Web Page Content ---\n{scraped_text_content}\n"
    else:
         synthesis_prompt += "--- Scraped Web Page Content ---\nNone available or processed.\n\n"


    final_answer_messages = [
        {"role": "system", "content": synthesis_prompt},
        {"role": "user", "content": "Synthesize the final answer in Markdown based on the provided information, including inline citations."}
    ]

    final_markdown_output = ""

    with tqdm(total=1, desc="Synthesizing Answer", unit="step") as pbar:
        final_answer_response = query_pollinations_ai(final_answer_messages, model=SYNTHESIS_MODEL) # Use the larger model
        if final_answer_response and 'choices' in final_answer_response and len(final_answer_response['choices']) > 0:
            final_markdown_output += final_answer_response['choices'][0]['message']['content']
            pbar.set_postfix_str("Success")
        else:
            pbar.set_postfix_str("Failed")
            if not native_answer_content and not scraped_text_content and not youtube_transcripts_content:
                final_markdown_output = "--- No Information Found ---\nCould not find enough information (either natively, from web searches/provided URLs, or YouTube transcripts) to answer the query.\n---------------------------"
            else:
                final_markdown_output = "--- Synthesis Failed ---\nAn error occurred during the synthesis process, but some information was gathered:\n\n"
                if native_answer_content: final_markdown_output += "**Native Knowledge:** Available\n"
                if youtube_transcripts_content: final_markdown_output += "**YouTube Content:** Available\n"
                if scraped_text_content: final_markdown_output += "**Scraped Web Content:** Available\n"
                final_markdown_output += "\nConsider retrying the query."
        pbar.update(1)

    if show_sources and (scraped_website_urls or processed_youtube_urls or found_image_urls or (native_answer_content and plan.get("native_parts") != "None")):
        final_markdown_output += "\n\n## Sources\n"
        if native_answer_content and plan.get("native_parts") != "None":
             final_markdown_output += "### Answered Natively\n"
             final_markdown_output += f"Parts of the query related to: {plan.get('native_parts', 'Native knowledge')}\n"
        if scraped_website_urls:
            final_markdown_output += "### Text Sources (Scraped Websites)\n"
            for url in scraped_website_urls:
                final_markdown_output += f"- {url}\n"
        if processed_youtube_urls:
             final_markdown_output += "### Transcript Sources (YouTube Videos)\n"
             for url in processed_youtube_urls:
                 final_markdown_output += f"- {url}\n"
        if scrape_images and found_image_urls:
            final_markdown_output += "### Images Found on Scraped Pages\n"
            for url in found_image_urls:
                final_markdown_output += f"- {url}\n"
        elif scrape_images and (scraped_website_urls or processed_youtube_urls): 
             final_markdown_output += "### Images Found on Scraped Pages\n"
             final_markdown_output += "No relevant images found on scraped pages within limits.\n"

        final_markdown_output += "---\n"

    return final_markdown_output

# Script based usage
if __name__ == "__main__":
    user_input_query = input("Enter your query: ")
    final_output = search_and_synthesize(user_input_query, show_sources=True, scrape_images=True)
    print("\n" + "="*50)
    print("Final Output:")
    print("="*50)
    print(final_output)
    print("="*50)