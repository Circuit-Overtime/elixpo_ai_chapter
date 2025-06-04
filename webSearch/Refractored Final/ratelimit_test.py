import time
from duckduckgo_search import DDGS

DUCKDUCKGO_REQUEST_DELAY = 3  # seconds
REQUESTS_PER_MINUTE = 23
TOTAL_REQUESTS = 23  # 1 minute test
QUERIES = [
    "What is the capital of France?",
    "How does photosynthesis work?",
    "Latest news on artificial intelligence",
    "Python vs Java performance",
    "Best practices for remote work",
    "How to bake sourdough bread?",
    "What is quantum computing?",
    "Top 10 movies of 2023",
    "How to learn guitar fast?",
    "Symptoms of vitamin D deficiency",
    "What is blockchain technology?",
    "Travel tips for Japan",
    "How to improve memory?",
    "Benefits of meditation",
    "What is the stock market?",
    "How to start a blog?",
    "Best programming languages in 2024",
    "How to invest in real estate?",
    "What is machine learning?",
    "Healthy breakfast ideas",
    "How to fix a flat tire?",
    "What is the Internet of Things?",
    "Tips for effective public speaking"
]
def main():
    print(f"Sending {TOTAL_REQUESTS} requests to DuckDuckGo (about {REQUESTS_PER_MINUTE} per minute)...")
    for i in range(TOTAL_REQUESTS):
        query = QUERIES[i % len(QUERIES)]
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=1))
                print(f"Request {i+1}: '{query}' - Success, got {len(results)} results")
        except Exception as e:
            print(f"Request {i+1}: '{query}' - FAILED - {e}")
        if i < TOTAL_REQUESTS - 1:
            time.sleep(DUCKDUCKGO_REQUEST_DELAY)  # Wait between requests

if __name__ == "__main__":
    main()