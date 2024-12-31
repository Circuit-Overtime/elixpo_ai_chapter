const userLogo = document.getElementById("pixelsHolder");

// Dimensions for the grid (number of pixels in each direction)
const columns = 40;
const rows = 40;

// Function to dynamically create a pattern
function generatePattern(rows, columns) {
  const pattern = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < columns; x++) {
      // Alternate between 0 and 1 for a masonry effect
      const value = (x + y) % 2; // This creates a checkerboard effect
      row.push(value);
    }
    pattern.push(row);
  }
  return pattern;
}

// Generate the pattern dynamically
const pattern = generatePattern(10, 20); // Use smaller dimensions for the repeating pattern

// Generate the grid
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < columns; x++) {
    if (pattern[y % pattern.length][x % pattern[0].length] === 1) {
      const pixel = document.createElement("div");
      pixel.classList.add("pixel");
      userLogo.appendChild(pixel);
    }
  }
}


document.getElementById("redirectHome").addEventListener("click", () => {
  redirectTo("");
});