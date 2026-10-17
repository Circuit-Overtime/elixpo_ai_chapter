from apps.diffuino.python.display import MatrixDisplay


class FakeBridge:
    def __init__(self):
        self.calls = []

    def call(self, method, *parameters, timeout):
        self.calls.append((method, parameters, timeout))
        return 6 if method == "poll_digit" else None


class DelayedBridge(FakeBridge):
    def __init__(self, unavailable_attempts):
        super().__init__()
        self.unavailable_attempts = unavailable_attempts
        self.connect_attempts = 0

    def connect(self, timeout):
        self.connect_attempts += 1
        return self.connect_attempts > self.unavailable_attempts


def test_selector_rpc_methods_forward_values():
    display = MatrixDisplay.__new__(MatrixDisplay)
    display.timeout = 5.0
    display.ready_timeout = 20.0
    display.bridge = FakeBridge()

    display.selector_ready()
    assert display.poll_digit() == 6
    display.complete_request(True)

    assert display.bridge.calls == [
        ("selector_ready", (), 5.0),
        ("poll_digit", (), 5.0),
        ("complete_request", (True,), 5.0),
    ]


def test_bridge_connection_retries_during_board_boot(monkeypatch):
    display = MatrixDisplay.__new__(MatrixDisplay)
    display.timeout = 5.0
    display.ready_timeout = 120.0
    display.retry_interval = 0.5
    display.bridge = DelayedBridge(unavailable_attempts=2)
    monkeypatch.setattr("apps.diffuino.python.display.time.sleep", lambda _delay: None)

    assert display.__enter__() is display
    assert display.bridge.connect_attempts == 3
