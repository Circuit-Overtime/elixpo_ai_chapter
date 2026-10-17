import numpy as np
import pytest

from apps.diffuino.python.classifier import DigitClassifier


def test_classifier_rejects_wrong_shape():
    classifier = DigitClassifier.__new__(DigitClassifier)
    with pytest.raises(ValueError, match="1, 1, 28, 28"):
        classifier.predict(np.zeros((28, 28), dtype=np.float32))
