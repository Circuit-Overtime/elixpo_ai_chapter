from pathlib import Path


def test_apt_repository_uses_current_elixpo_identity():
    project = Path(__file__).resolve().parents[1]
    builder = (project / "scripts" / "build_apt_repo.sh").read_text(encoding="utf-8")

    assert "APT::FTPArchive::Release::Origin=Elixpo" in builder
    assert "APT::FTPArchive::Release::Label=packages.elixpo" in builder
    assert "Circuit Overtime" not in builder
