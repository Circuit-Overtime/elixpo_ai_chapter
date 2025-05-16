import requests
import json
import datetime
import re
from duckduckgo_search import DDGS
from bs4 import BeautifulSoup
import math
import mimetypes
import time
from urllib.parse import urljoin, urlparse, parse_qs
from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound, TranscriptsDisabled
from pytube import YouTube, exceptions

# --- Configuration ---
MAX_SEARCH_RESULTS_PER_QUERY = 5
MAX_SCRAPE_WORD_COUNT = 1000
MAX_TOTAL_SCRAPE_WORD_COUNT = 5000
MIN_PAGES_TO_SCRAPE = 3
MAX_PAGES_TO_SCRAPE = 5
MAX_IMAGES_TO_INCLUDE = 3
MAX_TRANSCRIPT_WORD_COUNT = 3000

# --- Rate Limiting ---
DUCKDUCKGO_REQUEST_DELAY = 2
REQUEST_RETRY_DELAY = 5

# Define models to use for different tasks
CLASSIFICATION_MODEL = "OpenAI GPT-4.1-nano" 
SYNTHESIS_MODEL = "openai-large"           

def query_pollinations_ai(messages, model=SYNTHESIS_MODEL):
    retries = 3
    for attempt in range(retries):
        payload = {
            "model": model,
            "messages": messages,
            "seed": 518450
        }

        url = "https://text.pollinations.ai/openai"
        headers = {
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(url, headers=headers, data=json.dumps(payload))
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Attempt {attempt + 1} failed: Error querying Pollinations AI ({model}): {e}. Retrying in {REQUEST_RETRY_DELAY} seconds.")
            time.sleep(REQUEST_RETRY_DELAY)

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
    """
    Fetches the transcript for a given YouTube video ID.
    Returns the transcript text or None if unavailable.
    """
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        transcript = transcript_list.find_transcript(['en', 'a.en'])
        if transcript:
             full_transcript = " ".join([entry['text'] for entry in transcript.fetch()])
             return full_transcript[:MAX_TRANSCRIPT_WORD_COUNT] + "..." if len(full_transcript) > MAX_TRANSCRIPT_WORD_COUNT else full_transcript
        else:
             return None

    except NoTranscriptFound:
        print(f"No transcript found for video ID: {video_id}")
        return None
    except TranscriptsDisabled:
        print(f"Transcripts are disabled for video ID: {video_id}")
        return None
    except Exception as e:
        print(f"Error fetching transcript for video ID {video_id}: {e}")
        return None

def get_youtube_video_metadata(url):
    """
    Fetches basic video metadata using pytube.
    Returns a dictionary of details or None if unavailable.
    """
    try:
        yt = YouTube(url)
        try:
            _ = yt.streams.first()
        except exceptions.RegexMatchError:
             print(f"Pytube RegexMatchError for {url}. Metadata might be incomplete.")
        except exceptions.LiveStreamError:
             print(f"Pytube LiveStreamError for {url}. Cannot get metadata for live streams.")
        except Exception as e:
             print(f"Other Pytube error during metadata fetching for {url}: {e}")

        return {
            'title': yt.title,
            'author': yt.author,
            'publish_date': yt.publish_date.strftime("%Y-%m-%d %H:%M:%S") if yt.publish_date else "Date Unknown",
            'length': f"{yt.length // 60}m {yt.length % 60}s",
            'views': yt.views,
            'description': yt.description[:500] + "..." if yt.description and len(yt.description) > 500 else yt.description
        }
    except Exception as e:
        print(f"Error fetching YouTube metadata for {url}: {e}")
        return None

def perform_duckduckgo_text_search(query, max_results):
    """
    Performs a text search using the DuckDuckGo Search API with a specified max number of results.
    Includes rate limiting and retries.
    """
    results = []
    retries = 3
    for attempt in range(retries):
        try:
            with DDGS() as ddgs:
                search_results = ddgs.text(query, max_results=max_results)
                results = list(search_results)
                if results:
                    time.sleep(DUCKDUCKGO_REQUEST_DELAY)
                    return results
                else:
                    print(f"Attempt {attempt + 1} failed: No results from DuckDuckGo for query '{query}'. Retrying in {REQUEST_RETRY_DELAY} seconds.")
                    time.sleep(REQUEST_RETRY_DELAY)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 403:
                print(f"Attempt {attempt + 1} failed: Received 403 Forbidden for query '{query}'. Not retrying.")
                break
            else:
                print(f"Attempt {attempt + 1} failed: HTTP error {e.response.status_code} for query '{query}'. Retrying in {REQUEST_RETRY_DELAY} seconds.")
                time.sleep(REQUEST_RETRY_DELAY)
        except Exception as e:
            print(f"Attempt {attempt + 1} failed: Error performing DuckDuckGo text search for query '{query}': {e}. Retrying in {REQUEST_RETRY_DELAY} seconds.")
            time.sleep(REQUEST_RETRY_DELAY)

    print(f"Failed to get search results after {retries} attempts for query '{query}'.")
    return []

def is_likely_search_result_url(url):
    """
    Checks if a URL is likely a search results page.
    """
    if not url:
        return False
    parsed_url = urlparse(url)
    if any(domain in parsed_url.netloc for domain in ['google.com', 'duckduckgo.com', 'bing.com', 'yahoo.com']):
        if parsed_url.path.startswith('/search') or parsed_url.path.startswith('/html') or parsed_url.path.startswith('/res'):
             return True
    return False

def is_likely_image(url):
    """
    Basic check to see if a URL likely points to a relevant image based on heuristics.
    Avoids common icons, logos, and very small images.
    """
    if not url:
        return False

    if not url.lower().endswith(('.png', '.jpg', '.jpeg','.bmp', '.webp')):
        return False

    if any(keyword in url.lower() for keyword in ['icon', 'logo', 'loader', 'sprite', 'thumbnail']):
        return False

    if re.search(r'\d+x\d+', url):
        return False

    try:
        response = requests.head(url, timeout=3)
        if 'Content-Type' in response.headers and response.headers['Content-Type'].lower().startswith('image/'):
             return True
    except requests.exceptions.RequestException:
        pass

    return False

def scrape_website(url, scrape_images=True):
    """
    Scrapes text content and potentially relevant image URLs from a given URL with limits.
    Includes basic image filtering and retries.
    """
    text_content = ""
    image_urls = []
    retries = 3
    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')

            temp_text = ''
            for tag in soup.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']):
                temp_text += tag.get_text() + ' '

            words = temp_text.split()
            if len(words) > MAX_SCRAPE_WORD_COUNT:
                text_content = ' '.join(words[:MAX_SCRAPE_WORD_COUNT]) + '...'
            else:
                text_content = temp_text.strip()

            if scrape_images:
                img_tags = soup.find_all('img')
                for img in img_tags:
                    img_url = img.get('src')
                    if img_url:
                        img_url = urljoin(url, img_url)
                        if is_likely_image(img_url):
                           image_urls.append(img_url)

            return text_content, image_urls
        except requests.exceptions.RequestException as e:
            if e.response and e.response.status_code == 403:
                print(f"Attempt {attempt + 1} failed: Received 403 Forbidden for URL: {url}. Not retrying.")
                continue
            print(f"Attempt {attempt + 1} failed: Error scraping {url}: {e}. Retrying in {REQUEST_RETRY_DELAY} seconds.")
            time.sleep(REQUEST_RETRY_DELAY)
        except Exception as e:
            if e.response and e.response.status_code == 403:
                print(f"Attempt {attempt + 1} failed: Received 403 Forbidden for URL: {url}. Not retrying.")
                continue
            print(f"Attempt {attempt + 1} failed: Error parsing website {url}: {e}. Retrying in {REQUEST_RETRY_DELAY} seconds.")
            time.sleep(REQUEST_RETRY_DELAY)

    print(f"Failed to scrape content after {retries} attempts for {url}.")
    return "", []

def determine_pages_to_scrape_llm(user_query, current_time_utc, location):
    """
    Uses the LLM to determine the number of pages to scrape based on query complexity.
    """
    messages = [
        {"role": "system", "content": """You are an AI assistant that analyzes user queries to estimate their complexity and the amount of information likely needed from web searches. Your task is to determine a suitable number of web pages (between 3 and 10) to scrape for a given query.

        Consider the subject matter, specificity, and potential need for recent or detailed information. A simple factual question might need only a few pages, while a broad or rapidly changing topic might require more.

        Respond with a single number representing the estimated number of pages to scrape (between 3 and 10), followed by a brief explanation.

        Examples:
        Query: What is the capital of France?
        Response: 3 - Simple factual query.

        Query: What are the latest developments in AI ethics in 2024?
        Response: 8 - Complex, rapidly changing topic requiring recent information.

        Query: How to bake a chocolate cake?
        Response: 5 - Requires detailed instructions and variations.

        Context:
        Current Time UTC: """ + current_time_utc + """
        Location (approximated): """ + location + """
        """
        },
        {"role": "user", "content": user_query}
    ]

    # Use the smaller model for this classification task
    response = query_pollinations_ai(messages, model=CLASSIFICATION_MODEL)

    if response and 'choices' in response and len(response['choices']) > 0:
        ai_output = response['choices'][0]['message']['content'].strip()
        match = re.match(r'(\d+)', ai_output)
        if match:
            try:
                pages = int(match.group(1))
                return max(MIN_PAGES_TO_SCRAPE, min(MAX_PAGES_TO_SCRAPE, pages))
            except ValueError:
                pass

    print("Could not get dynamic page estimate from AI. Using default.")
    return MAX_PAGES_TO_SCRAPE

def analyze_query_focus(user_query, youtube_urls, cleaned_query):
    """
    Uses the LLM to analyze the query and determine if it's primarily focused on YouTube content.
    """
    messages = [
        {"role": "system", "content": """You are an AI assistant that analyzes user queries to determine their primary focus. Given a query that may contain YouTube URLs and additional text, decide if the core request is primarily about the content of the provided YouTube videos.

        Respond with one of the following:
        Focus: YouTube (if the query is clearly asking about the video content, e.g., summarize, what does this video say)
        Focus: Mixed (if the query includes a YouTube URL but also asks unrelated questions or provides other links)
        Focus: Other (if no YouTube URLs are present or the query ignores them)

        Original User Query: """ + user_query + """
        Provided YouTube URLs: """ + ", ".join(youtube_urls) if youtube_urls else "None" + """
        Other Query Text: """ + cleaned_query
        },
        {"role": "user", "content": "Analyze the primary focus of the query and categorize it."}
    ]

    # Use the smaller model for this classification task
    response = query_pollinations_ai(messages, model=CLASSIFICATION_MODEL)

    if response and 'choices' in response and len(response['choices']) > 0:
        ai_output = response['choices'][0]['message']['content'].strip()
        if "Focus: YouTube" in ai_output:
            return "YouTube"
        elif "Focus: Mixed" in ai_output:
            return "Mixed"
        else:
            return "Other"

    print("Could not determine query focus from AI. Assuming Mixed.")
    return "Mixed"

def search_and_synthesize(user_input_query, show_sources=True, scrape_images=True):
    """
    Performs the complete search and synthesis process for a user query.
    Returns the final markdown output.
    """
    # --- Step 0: Extract and categorize URLs from the query ---
    website_urls, youtube_urls, cleaned_query = extract_urls_from_query(user_input_query)
    print(f"\n--- Extracted Website URLs: {website_urls} ---")
    print(f"--- Extracted YouTube URLs: {youtube_urls} ---")
    print(f"--- Cleaned Query for Analysis: {cleaned_query} ---")

    # --- Determine Query Focus ---
    # Use the smaller model for query focus analysis
    query_focus = analyze_query_focus(user_input_query, youtube_urls, cleaned_query)
    print(f"--- Query Focus Determined: {query_focus} ---")

    # --- Step 1: Initial AI analysis for non-YouTube parts ---
    current_time_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    try:
        response = requests.get("https://ipinfo.io/json")
        response.raise_for_status()
        location_data = response.json()
        location = location_data.get("city", "")
    except requests.exceptions.RequestException as e:
        print(f"Error fetching location: {e}")
        location = ""

    # Perform initial analysis only on the cleaned query (non-YouTube parts)
    # Use the smaller model for this initial analysis
    initial_analysis_messages = [
        {"role": "system", "content": """You are a helpful assistant. Analyze the user's query (excluding any provided URLs) and determine which parts can be answered using your native knowledge and which parts require a web search.

        Output Format:
        Native Parts: [Parts of the query answerable natively, or "None"]
        Search Queries:
        - [Reformulated search query 1 for web text search, including relevant context like time and location if applicable to the original query. *Ensure the query is focused on finding information, not expecting the AI to perform real-time actions.*]
        - [Reformulated search query 2, if applicable]
        ...

        Context:
        Current Time UTC: """ + current_time_utc + """
        Location (approximated): """ + location + """
        """
        },
        {"role": "user", "content": cleaned_query}
    ]

    # Use the smaller model for the classification response
    analysis_response = query_pollinations_ai(initial_analysis_messages, model=CLASSIFICATION_MODEL)

    native_parts = "None"
    text_search_queries_list = []

    if analysis_response and 'choices' in analysis_response and len(analysis_response['choices']) > 0:
        analysis_output = analysis_response['choices'][0]['message']['content']

        native_match = re.search(r"Native Parts: (.*?)(?:Search Queries:|$)", analysis_output, re.DOTALL)
        text_search_match = re.search(r"Search Queries:(.*)", analysis_output, re.DOTALL)

        native_parts = native_match.group(1).strip() if native_match else "None"
        if text_search_match:
            text_search_queries_text = text_search_match.group(1).strip()
            text_search_queries_list = [query.strip() for query in text_search_queries_text.split('\n- ') if query.strip()]

        print("\n--- Initial AI Analysis (Non-YouTube Parts) ---")
        print(f"Native Parts Identified: {native_parts}")
        print(f"Text Search Queries Identified: {text_search_queries_list}")
        print("-----------------------------------------------")
    else:
        print("Could not perform initial analysis for non-YouTube parts.")
        # If analysis fails, assume no native parts and no search queries to proceed as a fallback
        native_parts = "None"
        text_search_queries_list = []

    # --- Step 3 (Optimized): Handle Pure Native Queries Directly and Fast ---
    # Filter out potential "None" from text_search_queries_list
    filtered_text_search_queries = [q for q in text_search_queries_list if q != '- None' and q.strip()]

    # Check if the query appears to be purely native based on analysis and lack of external sources
    if native_parts != "None" and query_focus == "Other" and not website_urls and not youtube_urls and not filtered_text_search_queries:
         print("\n--- Query identified as purely native. Getting answer directly. ---")
         # Since the classification model already identified the native part,
         # we can potentially use its output directly if it's a simple answer.
         # However, for more complex native answers or consistent style,
         # it's better to ask the larger synthesis model to answer just the native part.
         # Let's ask the larger model for a polished native answer.
         native_answer_messages = [
             {"role": "system", "content": f"Answer the following question based on your native knowledge: {native_parts}"},
             {"role": "user", "content": cleaned_query}
         ]
         native_answer_response = query_pollinations_ai(native_answer_messages, model=SYNTHESIS_MODEL)

         if native_answer_response and 'choices' in native_answer_response and len(native_answer_response['choices']) > 0:
             native_answer_content = native_answer_response['choices'][0]['message']['content']
             print("--- Native Answer Content Captured ---")
             # Construct and return the final output immediately
             final_markdown_output = native_answer_content
             if show_sources:
                 final_markdown_output += "\n\n## Sources\n"
                 final_markdown_output += "### Answered Natively\n"
                 final_markdown_output += "This query was answered using the AI's internal knowledge.\n"
                 final_markdown_output += "---\n"
             return final_markdown_output
         else:
             print(f"Could not get native answer for: {native_parts}")
             # If the attempt to get a native answer fails, log it and proceed to synthesis as a fallback
             native_answer_content = "Could not retrieve a native answer."
             print("--- Native answer retrieval failed, proceeding to full synthesis. ---")


    # If not a purely native query (or if native answer retrieval failed), continue with the full process

    # --- Step 3 (Continued): Attempt to get native answer for synthesis later if not handled purely ---
    native_answer_content = "" # Reset in case it was set in the failed direct attempt
    if native_parts != "None":
        print("\n--- Attempting Native Answer for Synthesis ---")
        native_answer_messages = [
            {"role": "system", "content": f"Answer the following question based on your native knowledge: {native_parts}"},
            {"role": "user", "content": cleaned_query}
        ]
        native_answer_response = query_pollinations_ai(native_answer_messages, model=SYNTHESIS_MODEL)
        if native_answer_response and 'choices' in native_answer_response and len(native_answer_response['choices']) > 0:
            native_answer_content = native_answer_response['choices'][0]['message']['content']
            print("--- Native Answer Content Captured ---")
        else:
            print(f"Could not get native answer for: {native_parts}")

    # --- Step 4: Process YouTube URLs (if any) ---
    youtube_transcripts_content = ""
    processed_youtube_urls = []
    if youtube_urls:
        print("\n--- Processing YouTube URLs ---")
        for url in youtube_urls:
            video_id = get_youtube_video_id(url)
            if video_id:
                print(f"  Fetching transcript for video ID: {video_id}")
                transcript = get_youtube_transcript(video_id)
                if transcript:
                    metadata = get_youtube_video_metadata(url)
                    youtube_transcripts_content += f"\n\n--- Transcript and Metadata from YouTube: {url} ---\n"
                    if metadata:
                        youtube_transcripts_content += f"Title: {metadata.get('title', 'N/A')}\n"
                        youtube_transcripts_content += f"Author: {metadata.get('author', 'N/A')}\n"
                        youtube_transcripts_content += f"Published: {metadata.get('publish_date', 'N/A')}\n"
                        youtube_transcripts_content += f"Length: {metadata.get('length', 'N/A')}\n"
                        youtube_transcripts_content += f"Views: {metadata.get('views', 'N/A')}\n"
                        youtube_transcripts_content += f"Description: {metadata.get('description', 'N/A')}\n\n"
                    youtube_transcripts_content += transcript
                    processed_youtube_urls.append(url)
                else:
                    print(f"  Could not get transcript for {url}")
            else:
                print(f"  Could not extract video ID from {url}")
        print("--- YouTube Processing Complete ---")

    # --- Step 5: Determine if web search is needed based on query focus and available content ---
    needs_web_search = False
    # Filter out potential "None" from text_search_queries_list again before using it
    filtered_text_search_queries = [q for q in text_search_queries_list if q != '- None' and q.strip()]

    if query_focus == "Other" or query_focus == "Mixed":
        if filtered_text_search_queries or website_urls:
            needs_web_search = True
            text_search_queries_list = filtered_text_search_queries # Use the filtered list
            print("\n--- Web search is needed for non-YouTube parts. ---")
        elif native_parts == "None" and not youtube_transcripts_content:
             needs_web_search = True
             text_search_queries_list = [cleaned_query]
             print("\n--- No specific sources found, defaulting to web search for the cleaned query. ---")
        elif native_parts != "None" and not youtube_transcripts_content and not filtered_text_search_queries and not website_urls:
            print("\n--- Native answer is available, no web search needed based on other sources. ---")
            needs_web_search = False

    elif query_focus == "YouTube" and not youtube_transcripts_content:
         needs_web_search = True
         if not filtered_text_search_queries and youtube_urls:
             text_search_queries_list = [f"summary of {url}" for url in youtube_urls]
         elif not filtered_text_search_queries and not youtube_urls and cleaned_query:
              text_search_queries_list = [f"summary of YouTube video about {cleaned_query}"]
         else:
              text_search_queries_list = filtered_text_search_queries


         print("\n--- Focused on YouTube but no transcript found, performing web search for summary. ---")

    # --- Step 6: Perform web text search and scrape (including images found on pages) if needed ---
    scraped_text_content = ""
    total_scraped_words = 0
    scraped_website_urls = []
    found_image_urls = []

    if needs_web_search and text_search_queries_list:
        urls_from_search = []
        for query in text_search_queries_list:
             urls_from_search.extend([result.get('href') for result in perform_duckduckgo_text_search(query, max_results=MAX_SEARCH_RESULTS_PER_QUERY * 2)])

        urls_to_scrape = website_urls + urls_from_search

        unique_urls_to_scrape = []
        for url in urls_to_scrape:
            if url and url not in unique_urls_to_scrape and not is_likely_search_result_url(url):
                unique_urls_to_scrape.append(url)

        if unique_urls_to_scrape:
            print("\n--- Performing Web Text Search and Scraping ---")
            pages_scraped_count = 0

            for url in unique_urls_to_scrape:
                if pages_scraped_count >= MAX_PAGES_TO_SCRAPE or total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                    print("Maximum pages or total scrape word count reached. Stopping text scraping.")
                    break

                print(f"  Scraping text and images from: {url}")
                content, images = scrape_website(url, scrape_images=scrape_images)
                if content:
                    scraped_text_content += f"\n\n--- Content from {url} ---\n{content}"
                    total_scraped_words += len(content.split())
                    scraped_website_urls.append(url)
                    pages_scraped_count += 1
                    if scrape_images:
                         for img_url in images:
                            if len(found_image_urls) < MAX_IMAGES_TO_INCLUDE and img_url not in found_image_urls:
                                found_image_urls.append(img_url)
                                print(f"    Found relevant image on page: {img_url}")
                            elif len(found_image_urls) >= MAX_IMAGES_TO_INCLUDE:
                                 pass

                else:
                    print(f"  Could not scrape content from {url}")
            print("--- Web Text Search and Scraping Complete ---")
        else:
             print("\n--- No Website URLs to Scrape found by search or provided. ---")
    elif needs_web_search and not text_search_queries_list:
         print("\n--- Web search needed, but no search queries generated. Skipping search. ---")


    else:
        print("\n--- Web search is not needed based on query analysis and available content. ---")


    # --- Step 7: Feed all relevant content to AI for final synthesis in Markdown ---
    print("\n--- Sending Information to AI for Synthesis ---")

    synthesis_prompt = """You are a helpful assistant. Synthesize a comprehensive, detailed, and confident answer to the user's original query based *only* on the provided information from native knowledge, scraped web pages, and YouTube transcripts.

    Present the answer in Markdown format.

    Incorporate the information logically and provide the required answer contextually.
    Include dates, times, and specific details from the provided content where relevant to make the information more lively and grounded in the sources. Pay close attention to time zones when dealing with time-related queries and convert times to be relative to the provided Current Time UTC if necessary based on the scraped data.

    **Important:** When citing information derived directly from a scraped URL (website or YouTube), include a brief inline citation or reference to the source URL where appropriate within the synthesized answer. For example: "According to [Source URL], ..." or "The video at [YouTube URL] explains that...". Aim for a natural flow, not excessive citations.

    If the provided information from all sources is insufficient, state that you could not find a definitive answer based on the available data.

    Avoid mentioning the web search, scraping, or transcript fetching process explicitly in the final answer (except for the inline citations).

    User Query: """ + user_input_query + """

    Current Time UTC: """ + current_time_utc + """

    """

    if native_answer_content:
        synthesis_prompt += f"Native Knowledge Provided:\n{native_answer_content}\n\n"

    if youtube_transcripts_content:
         synthesis_prompt += f"YouTube Transcript Content:\n{youtube_transcripts_content}\n\n"

    if scraped_text_content:
        synthesis_prompt += f"Web Search Results (scraped text content):\n{scraped_text_content}\n"


    final_answer_messages = [
        {"role": "system", "content": synthesis_prompt},
        {"role": "user", "content": "Synthesize the answer based on the provided information in Markdown, including inline citations from the scraped content and YouTube transcripts."}
    ]

    final_answer_response = query_pollinations_ai(final_answer_messages, model=SYNTHESIS_MODEL) # Use the larger model for final synthesis

    final_markdown_output = ""

    if final_answer_response and 'choices' in final_answer_response and len(final_answer_response['choices']) > 0:
        final_markdown_output += final_answer_response['choices'][0]['message']['content']

        if show_sources and (scraped_website_urls or processed_youtube_urls or found_image_urls):
            final_markdown_output += "\n\n## Sources\n"
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
            elif scrape_images and not found_image_urls:
                 final_markdown_output += "### Images Found on Scraped Pages\n"
                 final_markdown_output += "No relevant images found on scraped pages.\n"

            final_markdown_output += "---\n"


    elif not native_answer_content and not scraped_text_content and not youtube_transcripts_content:
        final_markdown_output = "--- No Information Found ---\nCould not find enough information (either natively, from web searches/provided URLs, or YouTube transcripts) to answer the query.\n---------------------------"
    else:
         final_markdown_output = "--- Synthesis Failed ---\nAn error occurred during the synthesis process."

    return final_markdown_output

# --- Main execution block (only runs if the script is executed directly) ---
if __name__ == "__main__":
    user_input_query = input("Enter your query: ")
    final_output = search_and_synthesize(user_input_query, show_sources=True, scrape_images=True)
    print(final_output)