# Web Search Automation

This repository contains a Python-based web search automation tool designed to perform intelligent searches, scrape relevant information, and synthesize answers using advanced techniques. The tool supports both normal and deep search modes, allowing users to choose the level of detail required for their queries.

---

## Features

- **Normal Search Mode**: Performs efficient web searches and scrapes relevant text and images from the results.
- **Deep Search Mode**: Provides a more comprehensive search and scraping process for detailed queries.
- **Markdown Streaming**: Displays results in a Markdown-like format for better readability.
- **Concurrent Execution**: Uses multithreading to perform searches and scraping tasks concurrently for faster results.
- **LLM Integration**: Leverages a language model to generate search queries and synthesize answers from scraped data.

---

## File Overview

### 1. `common_entry_point_search.py`
This is the main entry point for the application. It handles user input, manages the search mode (normal or deep), and displays the results in a Markdown-like format.

Key Functions:
- `main()`: Orchestrates the search process based on user input.
- `stream_markdown(text, delay)`: Streams Markdown-like text character by character for a smooth display.

---

### 2. `searching_automation_clean.py`
This module implements the **Normal Search Mode**. It performs web searches, scrapes relevant text and images, and synthesizes answers.

Key Features:
- Configurable parameters for search and scraping limits.
- Robust scraping with error handling and support for concurrent tasks.
- Integration with a language model to generate search queries and synthesize answers.

Key Functions:
- `smart_search_agent_pipeline(full_query)`: Executes the entire search pipeline for normal mode.
- `scrape_text_from_url(url, headers, timeout, max_chars)`: Scrapes text and images from a given URL.
- `generate_initial_queries(full_query)`: Generates concise search queries using a language model.

---

### 3. `searching_automation_deep_clean.py`
This module (not fully provided in the context) is expected to implement the **Deep Search Mode**. It likely extends the functionality of `searching_automation_clean.py` to provide more detailed and exhaustive search results.

---

## How to Use

1. Clone the repository:
    ```bash
    git clone https://github.com/your-repo/web-search-automation.git
    cd web-search-automation
    ```

2. Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3. Run the application:
    ```bash
    python common_entry_point_search.py
    ```

4. Follow the prompts:
    - Enter your query.
    - Choose whether to enable Deep Search (`true` or `false`).

---

## Example Output

### Normal Search Mode
```
Enter your query: What is the capital of France?
Enable Deep Search? (true/false): false

[*] Starting search...
[*] Using Normal Search mode.

--- Final Result ---

## Answer

The capital of France is Paris.

## Sources
1. <https://example.com/paris-info>
2. <https://example.com/france-capital>

## Relevant Images
![Relevant Image](https://example.com/paris.jpg)
<https://example.com/paris.jpg>

--- End of Result ---
```

---

## Configuration

You can customize the behavior of the search and scraping process by modifying the configuration parameters in `searching_automation_clean.py`:
- `MAX_RETRIES`: Number of retries for failed requests.
- `MAX_WORKERS`: Number of concurrent threads for search and scraping.
- `MAX_TOTAL_IMAGES`: Maximum number of images to collect.

---

## Dependencies

- `beautifulsoup4`: For HTML parsing and scraping.
- `duckduckgo_search`: For performing DuckDuckGo searches.
- `tqdm`: For progress bars during concurrent tasks.
- `rich`: For enhanced console output.

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

