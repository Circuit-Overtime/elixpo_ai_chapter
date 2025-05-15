from search_final_module import search_and_synthesize

query_simple = "what's 2+2? summrize me https://www.geeksforgeeks.org/bankers-algorithm-in-operating-system-2/ website... and what's the time in USA right now?" 
markdown_no_sources = search_and_synthesize(query_simple, show_sources=True)
print(markdown_no_sources)