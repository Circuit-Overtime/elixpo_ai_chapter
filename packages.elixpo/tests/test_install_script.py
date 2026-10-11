from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

from scripts.prepare_site import prepare_site

FINGERPRINT = "319DA9C9E089FAB1264F35F5F8ED950B52AE3CAB"


@pytest.mark.parametrize("package", ["win-dot-panel", "screenbridge"])
@pytest.mark.parametrize("fingerprint,success", [(FINGERPRINT, True), ("0" * 40, False)])
def test_install_script_checks_key_before_registering_source(
    tmp_path, package, fingerprint, success
):
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    scripts = {
        "sudo": """#!/bin/sh
printf '%s\\n' "$*" >> "$INSTALL_LOG"
if [ "$1" = tee ]; then cat > "$SOURCE_CAPTURE"; fi
""",
        "curl": """#!/bin/sh
while [ "$#" -gt 0 ]; do
    if [ "$1" = -o ]; then shift; printf 'test key' > "$1"; fi
    shift
done
""",
        "gpg": """#!/bin/sh
case " $* " in
    *' --show-keys '*) printf 'fpr:::::::::%s:\\n' "$FAKE_FINGERPRINT" ;;
    *' --dearmor '*)
        while [ "$#" -gt 0 ]; do
            if [ "$1" = -o ]; then shift; printf 'test keyring' > "$1"; fi
            shift
        done ;;
esac
""",
        "dpkg-query": "#!/bin/sh\nprintf '1.0.0-1'\n",
    }
    for name, content in scripts.items():
        path = fake_bin / name
        path.write_text(content, encoding="utf-8")
        path.chmod(0o755)

    log = tmp_path / "sudo.log"
    source = tmp_path / "source.list"
    env = dict(
        os.environ,
        PATH=f"{fake_bin}:{os.environ['PATH']}",
        INSTALL_LOG=str(log),
        SOURCE_CAPTURE=str(source),
        FAKE_FINGERPRINT=fingerprint,
    )
    project = Path(__file__).resolve().parents[1]
    site = tmp_path / "site"
    prepare_site(project / "web", site)
    script = site / package / "install.sh"
    result = subprocess.run(
        ["bash", str(script)], env=env, capture_output=True, text=True, check=False
    )

    assert (result.returncode == 0) == success
    assert (source.exists()) == success
    if success:
        assert source.read_text() == (
            "deb [signed-by=/etc/apt/keyrings/elixpo-packages.gpg] "
            "https://packages.elixpo.com/apt/ ./\n"
        )
        assert f"apt-get install -y {package}" in log.read_text()
        assert "apt-get update --allow-releaseinfo-change" in log.read_text()
        display_name = "Win Dot Panel" if package == "win-dot-panel" else "ScreenBridge"
        assert f"{display_name} 1.0.0-1 installed" in result.stdout
        if package == "win-dot-panel":
            assert "Super + ." in result.stdout
        else:
            assert "Open ScreenBridge from your applications menu" in result.stdout
    else:
        assert "fingerprint did not match" in result.stderr
        assert not log.exists() or f"apt-get install -y {package}" not in log.read_text()


def test_site_preparation_keeps_legacy_installer_route(tmp_path):
    project = Path(__file__).resolve().parents[1]
    site = tmp_path / "site"

    prepare_site(project / "web", site)

    assert (site / "install.sh").read_bytes() == (site / "win-dot-panel/install.sh").read_bytes()
    assert 'package="screenbridge"' in (site / "screenbridge/install.sh").read_text()
    assert not (site / "install.sh.in").exists()
