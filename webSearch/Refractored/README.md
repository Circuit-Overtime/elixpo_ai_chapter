# Web Search and Synthesis Module

This repository contains a Python-based web search and synthesis module designed to process user queries, perform web searches, scrape content, and synthesize detailed answers in Markdown format. The module is built with extensibility and error handling in mind, leveraging APIs and libraries for efficient information retrieval.

---

## Features

### 1. **Search and Synthesis**
- Accepts user queries and processes them using a combination of native knowledge, web search, and YouTube transcript analysis.
- Synthesizes a comprehensive Markdown response based on the retrieved information.
- Includes inline citations for transparency.

### 2. **Web Search**
- Uses the DuckDuckGo Search API to fetch search results.
- Filters and processes URLs to extract relevant content.

### 3. **Web Scraping**
- Scrapes text and images from websites while adhering to word count limits.
- Filters irrelevant images and avoids scraping search result pages.

### 4. **YouTube Integration**
- Extracts transcripts and metadata from YouTube videos.
- Handles common errors like unavailable transcripts or live streams.

### 5. **AI-Powered Planning and Synthesis**
- Uses AI models to plan query execution and synthesize final answers.
- Supports both classification and synthesis tasks with different AI models.

---

## File Structure

### 1. `search_module.py`
This file contains the core logic for the module, including:
- **Configuration**: Adjustable parameters for search results, scraping limits, and retry logic.
- **Helper Functions**: URL extraction, YouTube transcript fetching, and web scraping utilities.
- **AI Integration**: Functions to query AI models for planning and synthesis.
- **Main Functionality**: `search_and_synthesize` function that orchestrates the entire process.

### 2. `search_test.py`
This file demonstrates how to use the `search_module.py`:
- Imports the `search_and_synthesize` function.
- Provides a sample query to test the module.
- Prints the synthesized Markdown output.

---

## Usage

### Prerequisites
- Python 3.8 or higher
- Required libraries: `requests`, `beautifulsoup4`, `duckduckgo_search`, `pytube`, `youtube_transcript_api`, `tqdm`

Install dependencies using:
```bash
pip install -r requirements.txt
```

### Running the Module
1. Modify the query in `search_test.py` to your desired input.
2. Run the script:
    ```bash
    python search_test.py
    ```
3. View the synthesized Markdown output in the console.

---

## Configuration
You can adjust the following parameters in `search_module.py`:
- `MAX_SEARCH_RESULTS_PER_QUERY`: Number of search results to fetch.
- `MAX_SCRAPE_WORD_COUNT`: Maximum word count per scraped page.
- `MAX_IMAGES_TO_INCLUDE`: Number of images to include in the output.
- AI models for classification and synthesis.

---

## Example Query
```python
query_simple = "What's the current weather in Kolkata, India? How's it different from the weather in Delhi, India right now?"
markdown_no_sources = search_and_synthesize(query_simple, show_sources=True, scrape_images=False)
print(markdown_no_sources)
```

---

## Limitations
- Relies on external APIs and libraries, which may have rate limits or restrictions.
- Requires internet connectivity for web search and scraping.

---

## License
This project is licensed under the MIT License. See the `LICENSE` file for details.

---

## Contributing
Contributions are welcome! Feel free to open issues or submit pull requests to improve the module.
