import aiohttp
async def fetch_image_bytes(image_url):
    """Fetches image data as bytes from a URL."""
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(image_url) as response:
                if response.status != 200:
                    print(f"Error fetching image (status {response.status}): {response.reason}")
                    return None
                # Basic check for content type
                content_type = response.headers.get('Content-Type', '')
                if not content_type.startswith('image/'):
                    print(f"Fetched data is not an image. Content-Type: {content_type}")
                    return None
                # Read bytes
                image_bytes = await response.read()
                if len(image_bytes) < 100: # Basic size check
                     print(f"Fetched image data is too small ({len(image_bytes)} bytes), likely an error response.")
                     return None
                return image_bytes
        except aiohttp.ClientError as e:
            print(f"Network error fetching image: {e}")
            return None