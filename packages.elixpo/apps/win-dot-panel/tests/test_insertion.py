"""Direct insertion uses the text caret and UTF-8 byte length."""

from __future__ import annotations

from win_dot_panel.insertion import TextInserter


class FakeText:
    def __init__(self) -> None:
        self.offset = 3

    def get_caret_offset(self) -> int:
        return self.offset

    def set_caret_offset(self, offset: int) -> bool:
        self.offset = offset
        return True


class FakeEditable:
    def __init__(self) -> None:
        self.calls: list[tuple[int, str, int]] = []

    def insert_text(self, offset: int, value: str, length: int) -> bool:
        self.calls.append((offset, value, length))
        return True


class FakeTarget:
    def __init__(self) -> None:
        self.text = FakeText()
        self.editable = FakeEditable()

    def get_text_iface(self) -> FakeText:
        return self.text

    def get_editable_text_iface(self) -> FakeEditable:
        return self.editable


class FakeStates:
    def __init__(self, focused: bool) -> None:
        self.focused = focused

    def contains(self, state: str) -> bool:
        return self.focused and state == "focused"


class FakeNode:
    def __init__(self, *, focused=False, editable=False, role="text", children=()) -> None:
        self.focused = focused
        self.editable = editable
        self.role = role
        self.children = children
        self.text = FakeText()
        self.editable_iface = FakeEditable()

    def get_state_set(self) -> FakeStates:
        return FakeStates(self.focused)

    def is_editable_text(self) -> bool:
        return self.editable

    def get_role(self) -> str:
        return self.role

    def get_text_iface(self) -> FakeText | None:
        return self.text if self.editable else None

    def get_editable_text_iface(self) -> FakeEditable | None:
        return self.editable_iface if self.editable else None

    def get_child_count(self) -> int:
        return len(self.children)

    def get_child_at_index(self, index: int) -> FakeNode:
        return self.children[index]


def test_insertion_uses_caret_and_preserves_target_for_repeated_emoji():
    inserter = TextInserter()
    target = FakeTarget()
    inserter.target = target
    inserter.caret_offset = target.text.offset

    assert inserter.insert("🚀")
    assert inserter.insert("🙂")
    assert target.editable.calls == [(3, "🚀", 4), (4, "🙂", 4)]
    assert target.text.offset == 5


def test_focus_events_skip_password_fields_and_remember_editable_caret():
    password = FakeNode(focused=True, editable=True, role="password")
    target = FakeNode(focused=True, editable=True)
    inserter = TextInserter()
    inserter.atspi = type(
        "FakeAtspi",
        (),
        {"Role": type("Role", (), {"PASSWORD_TEXT": "password"})},
    )

    inserter._remember_focused_field(password)
    assert inserter.target is None

    inserter._remember_focused_field(target)
    assert inserter.target is target
    assert inserter.caret_offset == 3


def test_insertion_uses_event_caret_after_target_loses_focus():
    target = FakeNode(focused=True, editable=True)
    inserter = TextInserter()
    inserter.atspi = type(
        "FakeAtspi",
        (),
        {"Role": type("Role", (), {"PASSWORD_TEXT": "password"})},
    )

    inserter._remember_focused_field(target)
    target.focused = False
    target.text.offset = -1

    assert inserter.insert("🚀")
    assert target.editable_iface.calls == [(3, "🚀", 4)]
    assert inserter.caret_offset == 4


def test_focus_tracking_freezes_while_panel_is_open(monkeypatch):
    first = FakeNode(focused=True, editable=True)
    second = FakeNode(focused=True, editable=True)
    inserter = TextInserter()
    inserter.atspi = type(
        "FakeAtspi",
        (),
        {"Role": type("Role", (), {"PASSWORD_TEXT": "password"})},
    )
    monkeypatch.setattr(inserter, "_capture_active_window", lambda: "4242")
    event = lambda source: type("Event", (), {"detail1": 1, "source": source})()

    inserter._focused_changed(event(first))
    inserter.capture_focused_field()
    inserter._focused_changed(event(second))

    assert inserter.target is first
    assert inserter.target_window == "4242"

    inserter.resume_focus_tracking()
    inserter._focused_changed(event(second))
    assert inserter.target is second


def test_capture_remembers_active_x_window(monkeypatch):
    monkeypatch.setattr("win_dot_panel.insertion.shutil.which", lambda name: "/usr/bin/xdotool")
    monkeypatch.setattr(
        "win_dot_panel.insertion.subprocess.run",
        lambda *args, **kwargs: type("Result", (), {"returncode": 0, "stdout": "4242\n"})(),
    )
    inserter = TextInserter()
    inserter.atspi = None

    inserter.capture_focused_field()

    assert inserter.target_window == "4242"
