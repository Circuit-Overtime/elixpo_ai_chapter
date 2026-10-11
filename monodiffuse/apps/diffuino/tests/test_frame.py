import numpy as np

from apps.diffuino.python.frame import LEFT_MARGIN, board_bytes, state_to_matrix


def test_matrix_frame_shape_range_and_centering():
    state = np.ones((1, 1, 28, 28), dtype=np.float32)
    frame = state_to_matrix(state)
    assert frame.shape == (8, 13)
    assert frame.dtype == np.uint8
    assert frame.min() == 0
    assert frame.max() == 7
    assert np.all(frame[:, LEFT_MARGIN : LEFT_MARGIN + 8] == 7)
    assert len(board_bytes(frame)) == 104


def test_frame_rejects_wrong_shape():
    state = np.zeros((32, 32), dtype=np.float32)
    try:
        state_to_matrix(state)
    except ValueError as error:
        assert "28x28" in str(error)
    else:
        raise AssertionError("wrong input shape was accepted")


def test_auto_contrast_uses_full_brightness_for_a_faint_stroke():
    state = np.full((1, 1, 28, 28), -1.0, dtype=np.float32)
    state[:, :, 4:24, 12:16] = -0.25
    frame = state_to_matrix(state)
    assert frame.max() == 7
    assert np.count_nonzero(frame) > 0


def test_crisp_rendering_keeps_grayscale_without_hard_thresholding():
    state = np.linspace(-1, 1, 28 * 28, dtype=np.float32).reshape(1, 1, 28, 28)
    frame = state_to_matrix(state, digit=8)
    assert np.any((frame > 0) & (frame < 7))
