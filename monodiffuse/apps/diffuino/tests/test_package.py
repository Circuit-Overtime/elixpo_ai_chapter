import hashlib
from zipfile import ZipFile

from apps.diffuino.package_app import PACKAGE_FILES, build_package


def test_runtime_package_is_allowlisted_and_reproducible(tmp_path):
    first = build_package(tmp_path / "first.zip")
    second = build_package(tmp_path / "second.zip")

    assert hashlib.sha256(first.read_bytes()).digest() == hashlib.sha256(
        second.read_bytes()
    ).digest()

    with ZipFile(first) as archive:
        names = archive.namelist()
        assert names == [*PACKAGE_FILES, "MANIFEST.sha256"]
        assert names[0] == "app.yaml"
        assert "python/main.py" in names
        assert "sketch/sketch.ino" in names
        assert not any(name.endswith(".pt") for name in names)
        assert not any("test" in name or "train" in name for name in names)

        manifest = archive.read("MANIFEST.sha256").decode()
        for name in PACKAGE_FILES:
            digest = hashlib.sha256(archive.read(name)).hexdigest()
            assert f"{digest}  {name}\n" in manifest
