import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline
from sklearn.metrics import mean_squared_error
from sklearn.model_selection import train_test_split

# 1. Generate noisy quadratic data
np.random.seed(0)
X = np.sort(np.random.rand(30, 1) * 2 - 1, axis=0)  # X in [-1, 1]
y = 1.5 * X.ravel() ** 2 + 0.5 * X.ravel() + 1 + np.random.randn(30) * 0.3  # True function + noise

# 2. Train/Test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)

# 3. Try different polynomial degrees
degrees = [2, 5, 10, 6, 15]

plt.figure(figsize=(12, 5))

for i, degree in enumerate(degrees):
    model = make_pipeline(PolynomialFeatures(degree), LinearRegression())
    model.fit(X_train, y_train)
    y_train_pred = model.predict(X_train)
    y_test_pred = model.predict(X_test)

    train_error = mean_squared_error(y_train, y_train_pred)
    test_error = mean_squared_error(y_test, y_test_pred)

    # Plotting
    plt.subplot(1, 5, i + 1)
    plt.scatter(X_train, y_train, color="blue", label="Train Data")
    plt.scatter(X_test, y_test, color="green", label="Test Data")
    X_plot = np.linspace(-1, 1, 200).reshape(-1, 1)
    y_plot = model.predict(X_plot)
    plt.plot(X_plot, y_plot, color="red", label=f"Degree {degree} Fit")
    plt.title(f"Degree {degree} | Train MSE: {train_error:.2f} | Test MSE: {test_error:.2f}")
    plt.legend()

plt.tight_layout()
plt.show()
