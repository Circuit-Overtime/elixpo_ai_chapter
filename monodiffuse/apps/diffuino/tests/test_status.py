from apps.diffuino.python.status import load_color


def test_cpu_load_colors():
    assert load_color(0.25) == (False, True, False)
    assert load_color(0.65) == (True, True, False)
    assert load_color(0.95) == (True, False, False)


def test_memory_load_colors():
    assert load_color(0.25, memory=True) == (False, False, True)
    assert load_color(0.65, memory=True) == (False, True, True)
    assert load_color(0.80, memory=True) == (True, True, False)
    assert load_color(0.95, memory=True) == (True, False, False)
