from __future__ import annotations

from lib.github.api import GitHubAPI


async def test_github_api_reuses_client_for_same_token():
    api = GitHubAPI.from_token("test-token")
    try:
        first = await api._get_client()
        second = await api._get_client()

        assert second is first
        assert not first.is_closed
    finally:
        await api.close()

    assert first.is_closed
    assert api._client is None
