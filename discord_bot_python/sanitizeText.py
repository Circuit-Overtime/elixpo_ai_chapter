import re
def sanitize_text(text):
    """Sanitizes text to prevent unwanted Discord markdown/elements."""
    if not text:
        return ''
    sanitized = str(text) 

    sanitized = re.sub(r'(https?://[^\s]+)', '', sanitized) 
    sanitized = re.sub(r'```.*?```', '', sanitized, flags=re.DOTALL) 
    sanitized = re.sub(r'`.*?`', '', sanitized) 
    sanitized = re.sub(r'^>.*$', '', sanitized, flags=re.MULTILINE) 
    sanitized = re.sub(r'^[\s]*[-+*][\s]+', '', sanitized, flags=re.MULTILINE) 
    sanitized = re.sub(r'([^\s\*\_])\*\*([^\s\*\_])', r'\1\2', sanitized) 
    sanitized = re.sub(r'\*\*([^\s\*\_])', r'\1', sanitized)
    sanitized = re.sub(r'([^\s\*\_])\*\*', r'\1', sanitized)
    sanitized = re.sub(r'([^\s\*\_])\*([^\s\*\_])', r'\1\2', sanitized) 
    sanitized = re.sub(r'\*([^\s\*\_])', r'\1', sanitized)
    sanitized = re.sub(r'([^\s\*\_])\*', r'\1', sanitized)

    sanitized = sanitized.replace('<', '<').replace('>', '>') 
    sanitized = sanitized.strip()
    sanitized = re.sub(r'\n{3,}', '\n\n', sanitized)
    return sanitized