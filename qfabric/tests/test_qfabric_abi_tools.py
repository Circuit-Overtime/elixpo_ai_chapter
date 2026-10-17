import json
import tempfile
import unittest
from pathlib import Path

from qfabric.abi_tools import (
    build_golden_vectors,
    run_compile_fail_cases,
    write_golden_vectors,
)

ROOT = Path(__file__).resolve().parents[1]


class QFabricAbiToolsTests(unittest.TestCase):
    def test_compile_fail_suite_rejects_every_case(self) -> None:
        result = run_compile_fail_cases(ROOT / "tests/abi_compile_fail")
        self.assertEqual(result["status"], "pass")
        self.assertEqual(len(result["cases"]), 5)
        self.assertTrue(all(case["rejected"] for case in result["cases"]))

    def test_golden_vectors_are_reproducible(self) -> None:
        schema = ROOT / "config/qfabric-abi.json"
        first = build_golden_vectors(schema)
        second = build_golden_vectors(schema)
        self.assertEqual(first, second)
        self.assertEqual(
            json.loads((ROOT / "abi/golden-vectors.json").read_text()),
            first,
        )
        self.assertEqual(len(first["vectors"]), 3)
        self.assertEqual(
            first["vectors"][0]["payload_hex"],
            "800000007fffffff",
        )

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "abi/golden-vectors.json"
            write_golden_vectors(first, output)
            self.assertEqual(json.loads(output.read_text()), first)


if __name__ == "__main__":
    unittest.main()
