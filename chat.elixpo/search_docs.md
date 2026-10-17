the v3.0.0
OAS 3.1.0
lixSearch API
Elixpo
MIT

Download OpenAPI Document

Download OpenAPI Document
lixSearch is an intelligent search assistant that searches the web, fetches content, and synthesizes answers with cited sources.

Authentication
All endpoints (except /api/health, /docs, /v1/models) require an API key:

Method	Example
Bearer token (recommended)	Authorization: Bearer <key>
Header	X-API-Key: <key>
Query param (GET only)	?key=<key>
Missing key returns 401. Invalid key returns 403.

Quick Start
# Simple search (POST)
curl -X POST https://search.elixpo.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What is quantum computing?"}]}'

# Simple search (GET)
curl "https://search.elixpo.com/api/search?query=quantum+computing&key=YOUR_API_KEY"

# With image
curl -X POST https://search.elixpo.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": [
        {"type": "text", "text": "What is this?"},
        {"type": "image_url", "image_url": {"url": "https://example.com/photo.jpg"}}
      ]}]}'

# Streaming
curl -X POST https://search.elixpo.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Latest AI news"}], "stream": true}'
Sessions
Pass session_id to persist conversation context across requests. Without it, each request is stateless (ephemeral session, no history saved).

Images
Pass images in the content array using OpenAI vision format:

URL: {"type": "image_url", "image_url": {"url": "https://..."}}
Base64: {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
Base64 images are auto-hosted on the server. Up to 3 images per request.

Deep Search
Complex queries automatically trigger deep research mode — no flag needed. The pipeline decomposes the query into sub-topics and synthesizes a comprehensive answer.

Server
Server:
https://search.elixpo.com
Production


Authentication
Required
Selected Auth Type:BearerAuth
Authorization: Bearer <key>
Bearer Token
:
Token
Show Password
Client Libraries
Shell Curl
Chat ​Copy link
Search and chat — text, images, streaming, multi-turn conversations

ChatOperations
get
/api/search
post
/v1/chat/completions
Search (GET)​Copy link
Simple GET endpoint for quick searches. Returns the same quality results as the POST endpoint.

Use stream=true for SSE streaming, or omit for a single JSON response. Pass session_id for multi-turn context.

Query Parameters
queryCopy link to query
Type:string
required
Example
Search query

streamCopy link to stream
Type:boolean
Default
Enable SSE streaming

session_idCopy link to session_id
Type:string
Session ID for multi-turn context (optional)

imageCopy link to image
Type:string
Format:uri
Image URL to analyze alongside the query

keyCopy link to key
Type:string
API key (alternative to Authorization header)

Responses

200
Search response
Selected Content Type:
application/json

400
Invalid request
application/json

401
API key required
application/json

403
Invalid API key
application/json
Request Example forget/api/search
Shell Curl
curl 'https://search.elixpo.com/api/search?query=latest%20AI%20news&stream=false&session_id=&image=&key=' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'


Test Request
(get /api/search)
Status:200
Status:400
Status:401
Status:403
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 1,
      "message": {
        "content": "string",
        "role": "assistant"
      }
    }
  ],
  "created": 1,
  "id": "elixpo-abc123",
  "model": "lixsearch",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 1,
    "prompt_tokens": 1,
    "total_tokens": 1
  }
}

Search response

Chat (POST)​Copy link
Primary endpoint. OpenAI-compatible — works with any OpenAI SDK client.

Last user message is used as the search query
Earlier messages provide conversation context
stream defaults to false
session_id is optional (omit for stateless usage)
Body
·ChatRequest
required
application/json
messagesCopy link to messages
Type:array object[] · ChatMessage[]
1…
required
Conversation messages. Last user message = search query.

Show Child Attributesfor messages
max_tokensCopy link to max_tokens
Type:integer
Accepted for compatibility, not used

modelCopy link to model
Type:string
Default
Ignored — always uses lixsearch

session_idCopy link to session_id
Type:string
Session ID for multi-turn context persistence. Omit for stateless (ephemeral) requests.

streamCopy link to stream
Type:boolean
Default
Enable SSE streaming

temperatureCopy link to temperature
Type:number
Accepted for compatibility, not used

Responses

200
Chat response
Selected Content Type:
application/json

400
Invalid request
application/json

401
API key required
application/json

403
Invalid API key
application/json

503
Server not ready
application/json
Request Example forpost/v1/chat/completions
Shell Curl
curl https://search.elixpo.com/v1/chat/completions \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
  "messages": [
    {
      "content": [
        {
          "text": "Describe this image",
          "type": "text"
        },
        {
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQ..."
          },
          "type": "image_url"
        }
      ],
      "role": "user"
    }
  ]
}'


Image input (base64)

Test Request
(post /v1/chat/completions)
Status:200
Status:400
Status:401
Status:403
Status:503
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 1,
      "message": {
        "content": "string",
        "role": "assistant"
      }
    }
  ],
  "created": 1,
  "id": "elixpo-abc123",
  "model": "lixsearch",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 1,
    "prompt_tokens": 1,
    "total_tokens": 1
  }
}

Chat response

Surf (Collapsed)​Copy link
Lightweight search — raw URLs and images, no LLM synthesis

SurfOperations
get
/api/surf
Show More
Sessions (Collapsed)​Copy link
Session lifecycle — create, read, delete conversation sessions

SessionsOperations
get
/api/session/create
delete
/api/session/{session_id}
get
/api/session/{session_id}
Show More
Media (Collapsed)​Copy link
Hosted files — images and PDFs referenced in chat responses

MediaOperations
get
/api/content/{content_id}
get
/api/image/{image_id}
Show More
System ​Copy link
Health and models

SystemOperations
get
/api/health
get
/api/models
Health check​Copy link
Returns service status. No auth required.

Responses

200
Healthy
application/json
Request Example forget/api/health
Shell Curl
curl https://search.elixpo.com/api/health


Test Request
(get /api/health)
Status:200
{
  "status": "ok"
}

Healthy

List models​Copy link
Returns available models. Currently returns lixsearch. Also available at /v1/models for OpenAI SDK compatibility.

Responses

200
Model list
application/json
Request Example forget/api/models
Shell Curl
curl https://search.elixpo.com/api/models


Test Request
(get /api/models)
Status:200
{
  "data": [
    {
      "id": "lixsearch",
      "object": "model",
      "owned_by": "elixpo"
    }
  ],
  "object": "list"
}

Model list

Models