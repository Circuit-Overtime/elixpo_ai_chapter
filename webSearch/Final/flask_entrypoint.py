from flask import Flask, request, jsonify, Response, stream_with_context
from searching_automation_clean import smart_search_agent_pipeline as clean_search
from searching_automation_deep_clean import smart_search_agent_pipeline as deep_clean_search
from flask_cors import CORS
import time
import json

app = Flask(__name__)
CORS(app)

@app.route('/search', methods=['GET', 'POST'])
def search():
    if request.method == 'POST':
        data = request.get_json()
        if not data or 'query' not in data:
            return jsonify({"error": "Missing 'query' in request body"}), 400

        query = data['query']
        deep_search = data.get('deep_search', False)
        streaming = data.get('streaming', False)

        if streaming:
            return jsonify({"error": "Use GET request with streaming=true"}), 400

        search_func = deep_clean_search if deep_search else clean_search
        result = search_func(query)

        return jsonify({
            "answer": result.get("answer", "Could not find a relevant answer."),
            "sources": result.get("sources", []),
            "images": result.get("images", [])
        })

    elif request.method == 'GET':
        query = request.args.get('query')
        deep_search = request.args.get('deep_search', 'false').lower() == 'true'

        if not query:
            return jsonify({"error": "Missing 'query' parameter"}), 400

        search_func = deep_clean_search if deep_search else clean_search
        result = search_func(query)
        print(result)

        def generate_stream():
            # Prepare full Markdown content as a block
            markdown_parts = []

            # Answer
            markdown_parts.append("## Answer\n\n" + result.get("answer", "No answer found.") + "\n")

            # Sources
            sources = result.get("sources", [])
            if sources:
                markdown_parts.append("## Sources")
                for i, src in enumerate(sorted(set(sources))):
                    markdown_parts.append(f"{i+1}. <{src}>")

            # Images
            images = result.get("images", [])
            if images:
                markdown_parts.append("## Relevant Images")
                for img in images:
                    markdown_parts.append(f"![Relevant Image]({img})")
                    markdown_parts.append(f"<{img}>")

            final_markdown = "\n\n".join(markdown_parts)

            # Stream each paragraph or block preserving markdown
            for block in final_markdown.split("\n\n"):
                yield f"data: {block}\n\n"
                time.sleep(0.3)

        return Response(stream_with_context(generate_stream()), content_type='text/event-stream')

if __name__ == '__main__':
    app.run(host="10.42.0.56", port=3000, debug=False)
