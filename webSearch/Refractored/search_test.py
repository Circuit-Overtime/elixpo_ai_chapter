from search_module import search_and_synthesize

query_simple = "What's the current weather in kolkata india? and how's it different from the weather in delhi india right now?" 
markdown_no_sources = search_and_synthesize(query_simple, show_sources=True, scrape_images=False)
print(markdown_no_sources)