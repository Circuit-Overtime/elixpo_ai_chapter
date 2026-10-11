from __future__ import annotations

import json
import math
import struct
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path
from typing import Any

MAGIC = b"QFAB"
PROTOCOL_VERSION = 1
HEADER = struct.Struct(">4sBBBBIQIIIHH")
HEADER_SIZE = HEADER.size
MAX_MESSAGE_BYTES = 1024
MAX_PAYLOAD_BYTES = MAX_MESSAGE_BYTES - HEADER_SIZE


class MessageType(IntEnum):
    REQUEST = 1
    RESPONSE = 2


class Effect(IntEnum):
    PURE = 1
    IDEMPOTENT = 2
    STATEFUL = 3
    ACTUATING = 4


class Status(IntEnum):
    OK = 0
    MALFORMED = 1
    OVERSIZED = 2
    VERSION_MISMATCH = 3
    UNKNOWN_TASK = 4
    STALE = 5
    DUPLICATE = 6
    EXECUTION_ERROR = 7


class ABIError(ValueError):
    def __init__(self, status: Status, message: str):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class Metadata:
    message_type: MessageType
    effect: Effect
    status: Status
    task_id: int
    invocation_id: int
    epoch: int
    contract_id: int = 0
    relative_deadline_us: int = 0


@dataclass(frozen=True)
class Frame:
    metadata: Metadata
    payload: bytes


@dataclass(frozen=True)
class Task:
    name: str
    task_id: int
    effect: Effect
    request: str
    response: str
    transition_hooks: bool


SCALAR_FORMATS = {
    "i8": "b",
    "u8": "B",
    "i16": "h",
    "u16": "H",
    "i32": "i",
    "u32": "I",
    "i64": "q",
    "u64": "Q",
    "f32": "f",
    "f64": "d",
}


def _bounded_integer(value: object, bits: int, signed: bool, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ABIError(Status.MALFORMED, f"{label} must be an integer")
    minimum = -(1 << (bits - 1)) if signed else 0
    maximum = (1 << (bits - (1 if signed else 0))) - 1
    if not minimum <= value <= maximum:
        raise ABIError(Status.MALFORMED, f"{label} is outside its {bits}-bit range")
    return value


def _enum_value(enum_type: type[IntEnum], value: int, label: str) -> IntEnum:
    try:
        return enum_type(value)
    except ValueError as error:
        raise ABIError(Status.MALFORMED, f"unknown {label}: {value}") from error


def encode_frame(frame: Frame) -> bytes:
    payload = bytes(frame.payload)
    if len(payload) > MAX_PAYLOAD_BYTES:
        raise ABIError(Status.OVERSIZED, f"payload exceeds {MAX_PAYLOAD_BYTES} bytes")
    metadata = frame.metadata
    task_id = _bounded_integer(metadata.task_id, 32, False, "task_id")
    invocation_id = _bounded_integer(metadata.invocation_id, 64, False, "invocation_id")
    epoch = _bounded_integer(metadata.epoch, 32, False, "epoch")
    contract_id = _bounded_integer(metadata.contract_id, 32, False, "contract_id")
    deadline = _bounded_integer(
        metadata.relative_deadline_us, 32, False, "relative_deadline_us"
    )
    if metadata.message_type is MessageType.REQUEST and metadata.status is not Status.OK:
        raise ABIError(Status.MALFORMED, "request status must be OK")
    header = HEADER.pack(
        MAGIC,
        PROTOCOL_VERSION,
        int(metadata.message_type),
        int(metadata.effect),
        int(metadata.status),
        task_id,
        invocation_id,
        epoch,
        contract_id,
        deadline,
        len(payload),
        0,
    )
    return header + payload


def decode_frame(data: bytes) -> Frame:
    if len(data) > MAX_MESSAGE_BYTES:
        raise ABIError(Status.OVERSIZED, f"message exceeds {MAX_MESSAGE_BYTES} bytes")
    if len(data) < HEADER_SIZE:
        raise ABIError(Status.MALFORMED, "message is shorter than the ABI header")
    (
        magic,
        version,
        message_type_value,
        effect_value,
        status_value,
        task_id,
        invocation_id,
        epoch,
        contract_id,
        deadline,
        payload_length,
        flags,
    ) = HEADER.unpack_from(data)
    if magic != MAGIC:
        raise ABIError(Status.MALFORMED, "invalid QFabric ABI magic")
    if version != PROTOCOL_VERSION:
        raise ABIError(
            Status.VERSION_MISMATCH,
            f"unsupported ABI version {version}; expected {PROTOCOL_VERSION}",
        )
    if flags != 0:
        raise ABIError(Status.MALFORMED, "reserved ABI flags must be zero")
    if payload_length != len(data) - HEADER_SIZE:
        raise ABIError(Status.MALFORMED, "payload length does not match the message size")
    message_type = _enum_value(MessageType, message_type_value, "message type")
    effect = _enum_value(Effect, effect_value, "effect class")
    status = _enum_value(Status, status_value, "status")
    if message_type is MessageType.REQUEST and status is not Status.OK:
        raise ABIError(Status.MALFORMED, "request status must be OK")
    return Frame(
        Metadata(
            message_type=message_type,
            effect=effect,
            status=status,
            task_id=task_id,
            invocation_id=invocation_id,
            epoch=epoch,
            contract_id=contract_id,
            relative_deadline_us=deadline,
        ),
        data[HEADER_SIZE:],
    )


class Schema:
    def __init__(self, document: dict[str, Any]):
        if document.get("protocol_version") != PROTOCOL_VERSION:
            raise ValueError(f"schema protocol_version must be {PROTOCOL_VERSION}")
        types = document.get("types")
        tasks = document.get("tasks")
        if not isinstance(types, dict) or not isinstance(tasks, list):
            raise ValueError("schema requires object 'types' and array 'tasks'")
        self.types: dict[str, dict[str, Any]] = types
        for type_name in self.types:
            if not isinstance(type_name, str) or not type_name.isidentifier():
                raise ValueError(f"invalid ABI type name: {type_name!r}")
            self._size_of(type_name, ())
        self.tasks: dict[str, Task] = {}
        task_ids: set[int] = set()
        for raw_task in tasks:
            try:
                name = raw_task["name"]
                task_id = raw_task["task_id"]
                request = raw_task["request"]
                response = raw_task["response"]
                effect_name = raw_task.get("effect", "stateful").upper()
                effect = Effect[effect_name]
            except (KeyError, TypeError) as error:
                raise ValueError(f"invalid task declaration: {raw_task!r}") from error
            if not isinstance(name, str) or not name.isidentifier():
                raise ValueError(f"invalid task name: {name!r}")
            _bounded_integer(task_id, 32, False, f"task_id for {name}")
            if name in self.tasks or task_id in task_ids:
                raise ValueError(f"duplicate task name or id: {name}")
            transition_hooks = raw_task.get("transition_hooks", False)
            if not isinstance(transition_hooks, bool):
                raise ValueError(f"transition_hooks for {name} must be boolean")
            request_size = self._size_of(request, ())
            response_size = self._size_of(response, ())
            if request_size > MAX_PAYLOAD_BYTES or response_size > MAX_PAYLOAD_BYTES:
                raise ValueError(f"task {name} exceeds the {MAX_PAYLOAD_BYTES}-byte payload limit")
            task = Task(name, task_id, effect, request, response, transition_hooks)
            self.tasks[name] = task
            task_ids.add(task_id)

    @classmethod
    def load(cls, path: Path) -> Schema:
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def _size_of(self, type_name: str, trail: tuple[str, ...]) -> int:
        if type_name in SCALAR_FORMATS:
            return struct.calcsize(">" + SCALAR_FORMATS[type_name])
        if type_name == "bool":
            return 1
        if type_name in trail:
            raise ValueError(f"recursive type is unsupported: {' -> '.join((*trail, type_name))}")
        try:
            declaration = self.types[type_name]
        except KeyError as error:
            raise ValueError(f"unknown ABI type: {type_name}") from error
        kind = declaration.get("kind")
        if kind == "array":
            length = declaration.get("length")
            if not isinstance(length, int) or isinstance(length, bool) or not 1 <= length <= 65535:
                raise ValueError(f"array {type_name} has an invalid fixed length")
            return length * self._size_of(declaration.get("element"), (*trail, type_name))
        if kind == "struct":
            fields = declaration.get("fields")
            if not isinstance(fields, list) or not fields:
                raise ValueError(f"struct {type_name} requires fields")
            names: set[str] = set()
            size = 0
            for field in fields:
                field_name = field.get("name")
                if not isinstance(field_name, str) or not field_name.isidentifier():
                    raise ValueError(f"struct {type_name} has an invalid field name")
                if field_name in names:
                    raise ValueError(f"struct {type_name} repeats field {field_name}")
                names.add(field_name)
                size += self._size_of(field.get("type"), (*trail, type_name))
            return size
        raise ValueError(f"type {type_name} has unsupported kind: {kind!r}")

    def size_of(self, type_name: str) -> int:
        return self._size_of(type_name, ())

    def encode(self, type_name: str, value: object) -> bytes:
        encoded = self._encode(type_name, value)
        if len(encoded) > MAX_PAYLOAD_BYTES:
            raise ABIError(Status.OVERSIZED, f"encoded value exceeds {MAX_PAYLOAD_BYTES} bytes")
        return encoded

    def _encode(self, type_name: str, value: object) -> bytes:
        if type_name == "bool":
            if not isinstance(value, bool):
                raise ABIError(Status.MALFORMED, "bool value must be true or false")
            return bytes((int(value),))
        if type_name in SCALAR_FORMATS:
            if type_name.startswith(("i", "u")):
                bits = int(type_name[1:])
                value = _bounded_integer(value, bits, type_name.startswith("i"), type_name)
            elif not isinstance(value, (int, float)) or isinstance(value, bool):
                raise ABIError(Status.MALFORMED, f"{type_name} value must be numeric")
            elif not math.isfinite(value):
                raise ABIError(Status.MALFORMED, f"{type_name} value must be finite")
            try:
                return struct.pack(">" + SCALAR_FORMATS[type_name], value)
            except (OverflowError, struct.error) as error:
                raise ABIError(Status.MALFORMED, f"{type_name} value is out of range") from error
        declaration = self.types[type_name]
        if declaration["kind"] == "array":
            length = declaration["length"]
            if not isinstance(value, (list, tuple)) or len(value) != length:
                raise ABIError(Status.MALFORMED, f"{type_name} requires exactly {length} elements")
            return b"".join(self._encode(declaration["element"], item) for item in value)
        if not isinstance(value, dict):
            raise ABIError(Status.MALFORMED, f"{type_name} must be an object")
        expected = {field["name"] for field in declaration["fields"]}
        if set(value) != expected:
            raise ABIError(Status.MALFORMED, f"{type_name} fields must be {sorted(expected)}")
        return b"".join(
            self._encode(field["type"], value[field["name"]])
            for field in declaration["fields"]
        )

    def decode(self, type_name: str, payload: bytes) -> object:
        expected = self.size_of(type_name)
        if len(payload) != expected:
            raise ABIError(
                Status.MALFORMED,
                f"{type_name} requires {expected} bytes but received {len(payload)}",
            )
        value, offset = self._decode(type_name, payload, 0)
        if offset != len(payload):
            raise ABIError(Status.MALFORMED, "decoder did not consume the complete payload")
        return value

    def _decode(self, type_name: str, payload: bytes, offset: int) -> tuple[object, int]:
        if type_name == "bool":
            raw = payload[offset]
            if raw not in (0, 1):
                raise ABIError(Status.MALFORMED, "boolean wire value must be zero or one")
            return bool(raw), offset + 1
        if type_name in SCALAR_FORMATS:
            scalar = struct.Struct(">" + SCALAR_FORMATS[type_name])
            value = scalar.unpack_from(payload, offset)[0]
            if type_name.startswith("f") and not math.isfinite(value):
                raise ABIError(Status.MALFORMED, f"{type_name} wire value must be finite")
            return value, offset + scalar.size
        declaration = self.types[type_name]
        if declaration["kind"] == "array":
            values = []
            for _ in range(declaration["length"]):
                value, offset = self._decode(declaration["element"], payload, offset)
                values.append(value)
            return values, offset
        values = {}
        for field in declaration["fields"]:
            values[field["name"]], offset = self._decode(field["type"], payload, offset)
        return values, offset


class ReplayGuard:
    def __init__(self, capacity: int = 64):
        if capacity < 1:
            raise ValueError("replay capacity must be positive")
        self.capacity = capacity
        self.epoch: int | None = None
        self._seen: list[int] = []

    def accept(self, epoch: int, invocation_id: int) -> None:
        _bounded_integer(epoch, 32, False, "epoch")
        _bounded_integer(invocation_id, 64, False, "invocation_id")
        if self.epoch is not None and epoch < self.epoch:
            raise ABIError(Status.STALE, f"epoch {epoch} is older than current epoch {self.epoch}")
        if self.epoch is None or epoch > self.epoch:
            self.epoch = epoch
            self._seen.clear()
        if invocation_id in self._seen:
            raise ABIError(Status.DUPLICATE, f"invocation {invocation_id} is a duplicate")
        self._seen.append(invocation_id)
        if len(self._seen) > self.capacity:
            self._seen.pop(0)


def canary_eligible(effect: Effect) -> bool:
    return effect is Effect.PURE


def transition_pinned(effect: Effect, transition_hooks: bool) -> bool:
    return effect in {Effect.STATEFUL, Effect.ACTUATING} and not transition_hooks
