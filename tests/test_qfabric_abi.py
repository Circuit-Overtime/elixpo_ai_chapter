import json
import math
import struct
import unittest
from pathlib import Path

from qfabric.abi import (
    HEADER_SIZE,
    MAX_MESSAGE_BYTES,
    ABIError,
    Effect,
    Frame,
    MessageType,
    Metadata,
    ReplayGuard,
    Schema,
    Status,
    canary_eligible,
    decode_frame,
    encode_frame,
    transition_pinned,
)

ROOT = Path(__file__).resolve().parents[1]


class QFabricAbiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.schema = Schema.load(ROOT / "config/qfabric-abi.json")

    def test_header_is_fixed_and_big_endian(self) -> None:
        frame = Frame(
            Metadata(MessageType.REQUEST, Effect.PURE, Status.OK, 1, 2, 3, 4, 5),
            bytes.fromhex("01020304"),
        )
        encoded = encode_frame(frame)
        self.assertEqual(HEADER_SIZE, 36)
        self.assertEqual(
            encoded.hex(),
            "5146414201010100000000010000000000000002000000030000000400000005"
            "0004000001020304",
        )
        self.assertEqual(decode_frame(encoded), frame)

    def test_struct_array_float_and_bool_round_trip(self) -> None:
        value = {
            "sequence": (1 << 64) - 1,
            "temperature": 12.5,
            "gain": -0.25,
            "offsets": [-32768, 0, 32767],
            "enabled": True,
        }
        encoded = self.schema.encode("ProbeRequest", value)
        self.assertEqual(len(encoded), self.schema.size_of("ProbeRequest"))
        self.assertEqual(self.schema.decode("ProbeRequest", encoded), value)

    def test_all_integer_boundaries(self) -> None:
        for bits in (8, 16, 32, 64):
            for prefix, values in (
                ("i", (-(1 << (bits - 1)), (1 << (bits - 1)) - 1)),
                ("u", (0, (1 << bits) - 1)),
            ):
                type_name = f"{prefix}{bits}"
                for value in values:
                    encoded = self.schema.encode(type_name, value)
                    self.assertEqual(self.schema.decode(type_name, encoded), value)

    def test_float_boundaries_and_signed_zero(self) -> None:
        cases = {
            "f32": (-3.4028234663852886e38, 3.4028234663852886e38),
            "f64": (-1.7976931348623157e308, 1.7976931348623157e308),
        }
        for type_name, values in cases.items():
            for value in values:
                encoded = self.schema.encode(type_name, value)
                self.assertEqual(self.schema.decode(type_name, encoded), value)
            negative_zero = self.schema.encode(type_name, -0.0)
            positive_zero = self.schema.encode(type_name, 0.0)
            self.assertNotEqual(negative_zero, positive_zero)
            self.assertEqual(math.copysign(1, self.schema.decode(type_name, negative_zero)), -1)

    def test_rejects_malformed_oversized_and_wrong_version(self) -> None:
        valid = encode_frame(
            Frame(Metadata(MessageType.REQUEST, Effect.PURE, Status.OK, 1, 1, 1), b"")
        )
        with self.assertRaisesRegex(ABIError, "shorter"):
            decode_frame(valid[:10])
        with self.assertRaises(ABIError) as oversized:
            decode_frame(b"x" * (MAX_MESSAGE_BYTES + 1))
        self.assertEqual(oversized.exception.status, Status.OVERSIZED)
        wrong_version = bytearray(valid)
        wrong_version[4] = 2
        with self.assertRaises(ABIError) as mismatch:
            decode_frame(bytes(wrong_version))
        self.assertEqual(mismatch.exception.status, Status.VERSION_MISMATCH)
        wrong_length = bytearray(valid)
        wrong_length[32:34] = struct.pack(">H", 1)
        with self.assertRaisesRegex(ABIError, "payload length"):
            decode_frame(bytes(wrong_length))

    def test_rejects_noncanonical_values(self) -> None:
        with self.assertRaisesRegex(ABIError, "finite"):
            self.schema.encode("f64", math.inf)
        with self.assertRaisesRegex(ABIError, "zero or one"):
            self.schema.decode("bool", b"\x02")
        with self.assertRaisesRegex(ABIError, "exactly 3"):
            self.schema.encode("Offsets", [1, 2])

    def test_schema_defaults_missing_effect_to_stateful(self) -> None:
        document = json.loads((ROOT / "config/qfabric-abi.json").read_text())
        document["tasks"][0].pop("effect")
        schema = Schema(document)
        self.assertEqual(schema.tasks["add"].effect, Effect.STATEFUL)

    def test_only_pure_tasks_are_canary_eligible(self) -> None:
        self.assertTrue(canary_eligible(Effect.PURE))
        for effect in (Effect.IDEMPOTENT, Effect.STATEFUL, Effect.ACTUATING):
            self.assertFalse(canary_eligible(effect))

    def test_stateful_and_actuating_tasks_require_transition_hooks(self) -> None:
        for effect in (Effect.STATEFUL, Effect.ACTUATING):
            self.assertTrue(transition_pinned(effect, False))
            self.assertFalse(transition_pinned(effect, True))
        self.assertFalse(transition_pinned(Effect.PURE, False))
        self.assertFalse(transition_pinned(Effect.IDEMPOTENT, False))

    def test_replay_guard_rejects_stale_and_duplicate(self) -> None:
        guard = ReplayGuard(capacity=2)
        guard.accept(4, 10)
        with self.assertRaises(ABIError) as duplicate:
            guard.accept(4, 10)
        self.assertEqual(duplicate.exception.status, Status.DUPLICATE)
        with self.assertRaises(ABIError) as stale:
            guard.accept(3, 11)
        self.assertEqual(stale.exception.status, Status.STALE)
        guard.accept(5, 10)
        guard.accept(5, 11)
        guard.accept(5, 12)
        guard.accept(5, 10)


if __name__ == "__main__":
    unittest.main()
