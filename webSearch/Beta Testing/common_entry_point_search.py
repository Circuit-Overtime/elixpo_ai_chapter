import sys
import time
from rich.console import Console
from searching_automation_clean import smart_search_agent_pipeline as clean_search
from searching_automation_deep_clean import smart_search_agent_pipeline as deep_clean_search

console = Console()

def stream_markdown(text, delay=0.05):
    """Stream Markdown-like text line by line while preserving formatting."""
    lines = text.splitlines()
    for line in lines:
        console.print(line, markup=False, highlight=False, soft_wrap=True)
        time.sleep(delay)
    print()

def main():
    user_query = input("Enter your query: ").strip()
    deep_search_flag = input("Enable Deep Search? (true/false): ").strip().lower()

    if deep_search_flag not in ["true", "false"]:
        console.print("[!] Invalid input for Deep Search flag. Please enter 'true' or 'false'.", style="bold red")
        return

    use_deep_search = deep_search_flag == "true"

    console.print("\n[*] Starting search...", style="bold yellow")
    if use_deep_search:
        console.print("[*] Using Deep Search mode.", style="bold cyan")
        result = deep_clean_search(user_query)
    else:
        console.print("[*] Using Normal Search mode.", style="bold green")
        result = clean_search(user_query)

    markdown_parts = []

    answer = result.get("answer", "Could not find a relevant answer.")
    markdown_parts.append("## Answer\n")
    markdown_parts.append(answer + "\n")

    sources = result.get("sources", [])
    if sources:
        markdown_parts.append("## Sources")
        for i, src in enumerate(sorted(set(sources))):
            markdown_parts.append(f"{i+1}. <{src}>")
        markdown_parts.append("")

    images = result.get("images", [])
    if images:
        markdown_parts.append("## Relevant Images")
        for img_url in images:
            markdown_parts.append(f"![Relevant Image]({img_url})")
            markdown_parts.append(f"<{img_url}>")
        markdown_parts.append("")

    final_markdown = "\n".join(markdown_parts)

    console.print("\n[bold green]--- Final Result ---[/bold green]\n")
    stream_markdown(final_markdown, delay=0.05)
    console.print("\n[bold green]--- End of Result ---[/bold green]")

    # Optional: return or print raw markdown string
    # print("\n[Raw Markdown Output]")
    # print(final_markdown)

if __name__ == "__main__":
    main()
