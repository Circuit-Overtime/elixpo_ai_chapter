import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from qfabric.abi import MAX_PAYLOAD_BYTES, Schema
from qfabric.abi_codegen import generate_cpp_header

ROOT = Path(__file__).resolve().parents[1]


class QFabricAbiCodegenTests(unittest.TestCase):
    def test_generated_header_is_current(self) -> None:
        generated = generate_cpp_header(ROOT / "config/qfabric-abi.json")
        self.assertEqual((ROOT / "generated/qfabric_abi.hpp").read_text(), generated)

    def test_rejects_unsupported_and_recursive_declarations(self) -> None:
        base = {"protocol_version": 1, "types": {}, "tasks": []}
        unsupported = json.loads(json.dumps(base))
        unsupported["types"]["Bad"] = {"kind": "pointer", "element": "u8"}
        with self.assertRaisesRegex(ValueError, "unsupported kind"):
            Schema(unsupported)

        recursive = json.loads(json.dumps(base))
        recursive["types"]["Recursive"] = {
            "kind": "struct",
            "fields": [{"name": "next", "type": "Recursive"}],
        }
        recursive["tasks"] = [
            {"name": "bad", "task_id": 9, "request": "Recursive", "response": "u8"}
        ]
        with self.assertRaisesRegex(ValueError, "recursive type"):
            Schema(recursive)

    def test_rejects_task_payload_over_limit(self) -> None:
        document = {
            "protocol_version": 1,
            "types": {
                "TooLarge": {
                    "kind": "array",
                    "element": "u8",
                    "length": MAX_PAYLOAD_BYTES + 1,
                }
            },
            "tasks": [
                {"name": "large", "task_id": 10, "request": "TooLarge", "response": "u8"}
            ],
        }
        with self.assertRaisesRegex(ValueError, "payload limit"):
            Schema(document)

    @unittest.skipUnless(shutil.which("g++"), "g++ is required for the native ABI test")
    def test_cpp_golden_runner(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "abi-golden-test"
            compile_result = subprocess.run(
                [
                    "g++",
                    "-std=c++20",
                    "-Wall",
                    "-Wextra",
                    "-Werror",
                    "-pedantic",
                    "-I",
                    str(ROOT),
                    str(ROOT / "tests/cpp/abi_golden_test.cpp"),
                    "-o",
                    str(executable),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(compile_result.returncode, 0, compile_result.stderr)
            run_result = subprocess.run(
                [str(executable)], text=True, capture_output=True, check=False
            )
            self.assertEqual(run_result.returncode, 0, run_result.stderr)
            self.assertIn("golden vectors passed", run_result.stdout)


if __name__ == "__main__":
    unittest.main()
