from apps.diffuino.python.main import parser


def test_no_digit_selects_bcd_service_mode():
    arguments = parser().parse_args([])
    assert arguments.digit is None


def test_explicit_digit_selects_one_shot_mode():
    arguments = parser().parse_args(["--digit", "3"])
    assert arguments.digit == 3
