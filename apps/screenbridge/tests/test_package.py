import subprocess
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class DebianPackageTests(unittest.TestCase):
    def test_builder_creates_revisioned_valid_package(self):
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary) / "project"
            subprocess.run(
                ["cp", "-R", str(PROJECT_ROOT), str(project)],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            subprocess.run(
                [str(project / "packaging/build-deb.sh"), "--revision", "2"],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            package = project / "dist/screenbridge_1.0.0-2_all.deb"
            self.assertTrue(package.is_file())
            self.assertEqual(self._field(package, "Package"), "screenbridge")
            self.assertEqual(self._field(package, "Version"), "1.0.0-2")
            self.assertEqual(self._field(package, "Architecture"), "all")
            dependencies = self._field(package, "Depends")
            for dependency in ("python3-gi", "gir1.2-gtk-4.0", "pulseaudio-utils"):
                self.assertIn(dependency, dependencies)
            contents = subprocess.check_output(
                ["dpkg-deb", "--contents", str(package)], text=True
            )
            self.assertIn("./usr/bin/screenbridge", contents)
            self.assertIn("./usr/share/applications/io.github.screenbridge.app.desktop", contents)
            self.assertIn("./usr/share/metainfo/io.github.screenbridge.app.metainfo.xml", contents)

    def test_builder_rejects_invalid_revision(self):
        result = subprocess.run(
            [str(PROJECT_ROOT / "packaging/build-deb.sh"), "--revision", "0"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("positive integer", result.stderr)

    @staticmethod
    def _field(package: Path, field: str) -> str:
        return subprocess.check_output(
            ["dpkg-deb", "--field", str(package), field], text=True
        ).strip()


if __name__ == "__main__":
    unittest.main()
