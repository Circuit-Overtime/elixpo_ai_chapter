"""Types for OpenAI-compatible chat completion API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class FunctionDef(BaseModel):
    name: str
    description: str
    parameters: dict[str, Any]


class ToolDef(BaseModel):
    type: str = "function"
    function: FunctionDef


class FunctionCall(BaseModel):
    name: str
    arguments: str  # JSON string


class ToolCall(BaseModel):
    id: str
    type: str = "function"
    function: FunctionCall


class Message(BaseModel):
    role: str  # system | user | assistant | tool
    content: str | None = None
    tool_calls: list[ToolCall] | None = None
    tool_call_id: str | None = None


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[Message]
    tools: list[ToolDef] | None = None
    tool_choice: str | dict | None = None
    temperature: float = 0.0
    max_tokens: int | None = None
    stream: bool = False


class Choice(BaseModel):
    index: int
    message: Message
    finish_reason: str | None = None


class PromptTokensDetails(BaseModel):
    cached_tokens: int = 0


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    prompt_tokens_details: PromptTokensDetails | None = None

    @property
    def cached_tokens(self) -> int:
        return self.prompt_tokens_details.cached_tokens if self.prompt_tokens_details else 0


class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    choices: list[Choice]
    usage: Usage = Usage()


# Streaming types

class DeltaMessage(BaseModel):
    role: str | None = None
    content: str | None = None
    tool_calls: list[ToolCall] | None = None


class StreamChoice(BaseModel):
    index: int
    delta: DeltaMessage
    finish_reason: str | None = None


class ChatCompletionChunk(BaseModel):
    id: str
    object: str = "chat.completion.chunk"
    choices: list[StreamChoice]
    usage: Usage | None = None
