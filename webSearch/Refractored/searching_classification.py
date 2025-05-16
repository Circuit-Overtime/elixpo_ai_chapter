import requests
import json
import datetime
import re
from duckduckgo_search import DDGS
from bs4 import BeautifulSoup
import math
import mimetypes
import time
from urllib.parse import urljoin, urlparse

# --- Configuration ---
MAX_SEARCH_RESULTS_PER_QUERY = 5
MAX_SCRAPE_WORD_COUNT = 1000
MAX_TOTAL_SCRAPE_WORD_COUNT = 5000
MIN_PAGES_TO_SCRAPE = 3
MAX_PAGES_TO_SCRAPE = 5
MAX_IMAGES_TO_INCLUDE = 3

# --- Rate Limiting ---
DUCKDUCKGO_REQUEST_DELAY = 1

def query_pollinations_ai(messages):
    """
    Sends a message list to the Pollinations AI API.
    """
    payload = {
        "model": "openai-large",
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
        print(f"Error querying Pollinations AI: {e}")
        return None

def extract_urls_from_query(query):
    """
    Extracts URLs from the user's query.
    """
    urls = re.findall(r'https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+', query)
    cleaned_query = re.sub(r'https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+', '', query).strip()
    return urls, cleaned_query

def perform_duckduckgo_text_search(query, max_results):
    """
    Performs a text search using the DuckDuckGo Search API with a specified max number of results.
    Includes rate limiting.
    """
    results = []
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append(r)
        time.sleep(DUCKDUCKGO_REQUEST_DELAY)
        return results
    except Exception as e:
        print(f"Error performing DuckDuckGo text search: {e}")
        return []

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

def scrape_website(url):
    """
    Scrapes text content and relevant image URLs from a given URL with limits.
    Includes basic image filtering.
    """
    text_content = ""
    image_urls = []
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

        img_tags = soup.find_all('img')
        for img in img_tags:
            img_url = img.get('src')
            if img_url:
                img_url = urljoin(url, img_url)
                if is_likely_image(img_url):
                   image_urls.append(img_url)

    except requests.exceptions.RequestException as e:
        print(f"Error scraping {url}: {e}")
    except Exception as e:
        print(f"Error parsing website {url}: {e}")

    return text_content, image_urls

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

    response = query_pollinations_ai(messages)

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
    return MIN_PAGES_TO_SCRAPE

if __name__ == "__main__":
    user_input_query = input("Enter your query: ")

    # --- Step 0: Extract URLs from the query ---
    query_urls, cleaned_query = extract_urls_from_query(user_input_query)
    print(f"\n--- Extracted URLs from Query: {query_urls} ---")
    print(f"--- Cleaned Query for Analysis: {cleaned_query} ---")

    # --- Step 1: Initial AI analysis to identify native vs. search parts and estimate complexity ---
    current_time_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    try:
        response = requests.get("https://ipinfo.io/json")
        response.raise_for_status()
        location_data = response.json()
        location = location_data.get("city", "")
    except requests.exceptions.RequestException as e:
        print(f"Error fetching location: {e}")
        location = ""

    initial_analysis_messages = [
        {"role": "system", "content": """You are a helpful assistant. Analyze the user's query and determine which parts can be answered using your native knowledge and which parts require a web search.

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
        {"role": "user", "content": cleaned_query} # Use the cleaned query for analysis
    ]

    analysis_response = query_pollinations_ai(initial_analysis_messages)

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

        print("\n--- Initial AI Analysis ---")
        print(f"Native Parts Identified: {native_parts}")
        print(f"Text Search Queries Identified: {text_search_queries_list}")
        print("---------------------------")
    else:
        print("Could not perform initial analysis.")
        pass

    # --- Step 2: Determine the number of pages to scrape dynamically using LLM ---
    pages_to_scrape = determine_pages_to_scrape_llm(cleaned_query, current_time_utc, location)
    print(f"AI estimated complexity, will attempt to scrape content from up to {pages_to_scrape} pages (including provided URLs).")

    # --- Step 3: Answer native parts directly (if any) and prepare for final synthesis ---
    native_answer_content = ""
    if native_parts != "None":
        print("\n--- Attempting Native Answer ---")
        native_answer_messages = [
            {"role": "system", "content": f"Answer the following question based on your native knowledge: {native_parts}"},
            {"role": "user", "content": cleaned_query}
        ]
        native_answer_response = query_pollinations_ai(native_answer_messages)
        if native_answer_response and 'choices' in native_answer_response and len(native_answer_response['choices']) > 0:
            native_answer_content = native_answer_response['choices'][0]['message']['content']
            print("--- Native Answer Content Captured ---")
        else:
            print(f"Could not get native answer for: {native_parts}")
        # print("---------------------") # Removed this to clean up interim output

    # --- Step 4: Perform web text search and scrape (including images found on pages) ---
    scraped_text_content = ""
    total_scraped_words = 0
    scraped_urls = []
    found_image_urls = []

    # Combine provided URLs and search result URLs
    urls_from_search = [result.get('href') for query in text_search_queries_list for result in perform_duckduckgo_text_search(query, max_results=MAX_SEARCH_RESULTS_PER_QUERY * 2)]
    urls_to_scrape = query_urls + urls_from_search

    # Remove duplicates while preserving order for provided URLs
    unique_urls_to_scrape = []
    for url in urls_to_scrape:
        if url and url not in unique_urls_to_scrape:
            unique_urls_to_scrape.append(url)


    if unique_urls_to_scrape:
        print("\n--- Performing Web Text Search and Scraping ---")
        pages_scraped_count = 0

        for url in unique_urls_to_scrape:
            if pages_scraped_count >= pages_to_scrape or total_scraped_words >= MAX_TOTAL_SCRAPE_WORD_COUNT:
                print("Maximum pages or total scrape word count reached. Stopping text scraping.")
                break

            print(f"  Scraping text and images from: {url}")
            content, images = scrape_website(url)
            if content:
                scraped_text_content += f"\n\n--- Content from {url} ---\n{content}"
                total_scraped_words += len(content.split())
                scraped_urls.append(url)
                pages_scraped_count += 1
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
         print("\n--- No URLs to Scrape ---")


    # --- Step 5: Feed scraped content (and native answer) back to AI and get final answer in Markdown ---
    print("\n--- Sending Information to AI for Synthesis ---")

    synthesis_prompt = """You are a helpful assistant. Synthesize a comprehensive, detailed, and confident answer to the user's original query based *only* on the provided information from the scraped web pages and any native knowledge provided.

    Present the answer in Markdown format.

    Incorporate the information logically and provide the required answer contextually.
    Include dates, times, and specific details from the scraped content where relevant to make the information more lively and grounded in the sources. Pay close attention to time zones when dealing with time-related queries and convert times to be relative to the provided Current Time UTC if necessary based on the scraped data.

    **Important:** When citing information derived directly from a scraped URL, include a brief inline citation or reference to the source URL where appropriate within the synthesized answer. For example: "According to [Source URL], ..." or "The data from [Source URL] indicates that...". Aim for a natural flow, not excessive citations.

    If the information from the scraped content is insufficient, you may integrate relevant information from the native answer if provided. If both sources are insufficient, state that you could not find a definitive answer based on the available data.

    Avoid mentioning the web search or scraping process explicitly in the final answer (except for the inline citations).

    User Query: """ + user_input_query + """

    Current Time UTC: """ + current_time_utc + """

    """

    if native_answer_content:
        synthesis_prompt += f"Native Knowledge Provided:\n{native_answer_content}\n\n"

    if scraped_text_content:
        synthesis_prompt += f"Web Search Results (scraped text content):\n{scraped_text_content}\n"

    final_answer_messages = [
        {"role": "system", "content": synthesis_prompt},
        {"role": "user", "content": "Synthesize the answer based on the provided information in Markdown, including inline citations from the scraped content."}
    ]

    final_answer_response = query_pollinations_ai(final_answer_messages)

    if final_answer_response and 'choices' in final_answer_response and len(final_answer_response['choices']) > 0:
        print("\n--- Final Answer (Markdown) ---")
        print(final_answer_response['choices'][0]['message']['content'])
        print("--------------------")

        # --- Step 6: Mention Source Links and Image URLs ---
        if scraped_urls or found_image_urls:
            print("\n--- Sources ---")
            if scraped_urls:
                print("Text Sources:")
                for url in scraped_urls:
                    print(f"- {url}")
            if found_image_urls:
                print("\nImages Found on Scraped Pages:")
                if found_image_urls:
                     for url in found_image_urls:
                         print(f"- {url}")
                else:
                    print("No relevant images found on scraped pages.")
            print("--------------------")

    elif not native_answer_content and not scraped_text_content:
        print("\n--- No Information Found ---")
        print("Could not find enough information (either natively or from web searches/provided URLs) to answer the query.")
        print("---------------------------")
    else:
        # This case should ideally not be hit if either native or scraped content exists,
        # but as a fallback:
         print("\n--- Synthesis Failed ---")
         print("An error occurred during the synthesis process.")
         print("------------------------")