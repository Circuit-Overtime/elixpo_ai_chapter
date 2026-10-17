/* eslint-disable */
// Shape resize utilities - copied from resizeShapes.js
// Depends on globals: svg, rough, selectedElements

let selectedElements = [];
let selectionAnchors = [];
let isDraggingSelected = false;
let dragStartPoint = null;
let initialPositions = [];
let isBoxSelecting = false;
let selectionStartPoint = null;
let selectionRect = null;
let isScaling = false;
let activeAnchor = null;
let initialBBox = null;
let startSVG = null;
let isAnchorClicked = false;


function clientToSVGResize(x, y) {
  const pt = svg.createSVGPoint();
  pt.x = x;
  pt.y = y;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}



function anchorPointerDown(e) {
  if (selectedElements.length !== 1) return;
  e.preventDefault(); // Prevent default browser actions
  const anchor = e.target;
  const sel = selectedElements[0];
  console.log(sel)

  console.log(`Selected anchor type: ${anchor.anchorType}`);

  // Store the initial bounding box and pointer position
  initialBBox = sel.getBBox();
  startSVG = clientToSVGResize(e.clientX, e.clientY);

  // Optionally, store the transform (if needed)
  anchor.initialTransform = sel.getAttribute("transform") || 'translate(0,0) scale(1,1) rotate(0)';

  // Set state variables for continuous scaling
  isScaling = true;
  activeAnchor = anchor;

  // Capture pointer events on the SVG so we receive move/up events even if the pointer leaves the anchor
  svg.setPointerCapture(e.pointerId);

  // Set the global flag to true
  isAnchorClicked = true;
}

function anchorPointerUp(e) {
  if (isScaling) {
    console.log("Pointer up on anchor");
    svg.releasePointerCapture(e.pointerId);
    isScaling = false;
    activeAnchor = null;
    initialBBox = null;
    startSVG = null;

    // Reset the global flag
    isAnchorClicked = false;
  }
}

function anchorPointerMove(e) {
  if (!isAnchorClicked) return;  // Use the global flag
  if (!isScaling || !activeAnchor) return;

  const sel = selectedElements[0];
  if (!sel || !initialBBox || !startSVG) return;

  // Convert client coordinates to SVG coordinates
  const currentPt = clientToSVG(e.clientX, e.clientY);
  const dx = currentPt.x - startSVG.x;
  const dy = currentPt.y - startSVG.y;

  // Retrieve initial dimensions from data attributes
  let initialX = parseFloat(sel.getAttribute("data-x"));
  let initialY = parseFloat(sel.getAttribute("data-y"));
  let initialWidth = parseFloat(sel.getAttribute("data-width"));
  let initialHeight = parseFloat(sel.getAttribute("data-height"));

  let newWidth = initialWidth;
  let newHeight = initialHeight;
  let newX = initialX;
  let newY = initialY;

  // Update dimensions based on the active anchor's type
  switch (activeAnchor.anchorType) {
    case "nw":
      newWidth = initialWidth - dx;
      newHeight = initialHeight - dy;
      newX = initialX + dx;
      newY = initialY + dy;
      break;
    case "ne":
      newWidth = initialWidth + dx;
      newHeight = initialHeight - dy;
      newY = initialY + dy;
      break;
    case "se":
      newWidth = initialWidth + dx;
      newHeight = initialHeight + dy;
      break;
    case "sw":
      newWidth = initialWidth - dx;
      newHeight = initialHeight + dy;
      newX = initialX + dx;
      break;
    case "e":
      newWidth = initialWidth + dx;
      break;
    case "w":
      newWidth = initialWidth - dx;
      newX = initialX + dx;
      break;
    case "n":
      newHeight = initialHeight - dy;
      newY = initialY + dy;
      break;
    case "s":
      newHeight = initialHeight + dy;
      break;
  }

  // Prevent negative or zero dimensions
  newWidth = Math.max(newWidth, 1);
  newHeight = Math.max(newHeight, 1);

  // Update the rect element's attributes
  sel.setAttribute("data-x", newX);
  sel.setAttribute("data-y", newY);
  sel.setAttribute("data-width", newWidth);
  sel.setAttribute("data-height", newHeight);

  sel.setAttribute("x", newX);
  sel.setAttribute("y", newY);
  sel.setAttribute("width", newWidth);
  sel.setAttribute("height", newHeight);

  //Redraw the RoughJS element by keeping all of the same properties
  const fill = sel.getAttribute('fill');
  const stroke = sel.getAttribute('stroke');
  const strokeWidth = sel.getAttribute('stroke-width');
  const strokeDasharray = sel.getAttribute('stroke-dasharray');

  const rc = rough.svg(svg);
  const newShape = rc.rectangle(newX, newY, newWidth, newHeight, {
    stroke: stroke,
    strokeWidth: strokeWidth,
    fill: fill,
  });

  //Apply all styles
  if (strokeDasharray) {
    newShape.setAttribute("stroke-dasharray", strokeDasharray)
  }
  //Copy all new styles to selected el
  for (let i = 0; i < newShape.attributes.length; i++) {
    sel.setAttribute(newShape.attributes[i].name, newShape.attributes[i].value);
  }

  // Apply New sizes on selected element
  sel.setAttribute("data-x", newX);
  sel.setAttribute("data-y", newY);
  sel.setAttribute("data-width", newWidth);
  sel.setAttribute("data-height", newHeight);
  sel.setAttribute("x", newX);
  sel.setAttribute("y", newY);
  sel.setAttribute("width", newWidth);
  sel.setAttribute("height", newHeight);
  // Update the selection anchors for visual feedback
  removeSelectionAnchors();
  addSelectionAnchors(sel);
}

svg.addEventListener("pointermove", anchorPointerMove);

svg.addEventListener("pointerup", anchorPointerUp);

// ================================================= EVENT LISTENER END =================================================
function removeSelectionAnchors() {
  if (selectionAnchors) {
    selectionAnchors.forEach(anchor => {
      if (anchor.parentNode) {
        anchor.parentNode.removeChild(anchor);
      }
    });
    selectionAnchors = [];
  }
  const outline = svg.querySelector(".selection-outline");
  if (outline && outline.parentNode) {
    outline.parentNode.removeChild(outline);
  }
}


function addSelectionAnchors(element) {
  removeSelectionAnchors();

  const bbox = element.getBBox();

  // Get the current transform of the element
  let transform = element.getAttribute("transform") || "";
  let translateX = 0,
    translateY = 0;

  // Extract existing translation values
  const translateMatch = transform.match(/translate\(([^)]+)\)/);
  if (translateMatch) {
    const coords = translateMatch[1].split(/[ ,]+/);
    translateX = parseFloat(coords[0]) || 0;
    translateY = parseFloat(coords[1]) || 0;
  }

  const padding = 5; // Size of the padding around selected element

  const anchorPositions = [{
      x: bbox.x + translateX - padding,
      y: bbox.y + translateY - padding,
      cursor: "nw-resize",
      type: "nw"
    },
    {
      x: bbox.x + bbox.width + translateX + padding,
      y: bbox.y + translateY - padding,
      cursor: "ne-resize",
      type: "ne"
    },
    {
      x: bbox.x + bbox.width + translateX + padding,
      y: bbox.y + bbox.height + translateY + padding,
      cursor: "se-resize",
      type: "se"
    },
    {
      x: bbox.x + translateX - padding,
      y: bbox.y + bbox.height + translateY + padding,
      cursor: "sw-resize",
      type: "sw"
    },
    {
      x: bbox.x + bbox.width / 2 + translateX,
      y: bbox.y + translateY - padding - 20,
      cursor: "grab",
      type: "rotate"
    },
    // New anchors for the sides
    {
      x: bbox.x + translateX + bbox.width / 2,
      y: bbox.y + translateY - padding,
      cursor: "n-resize",
      type: "n"
    },
    {
      x: bbox.x + translateX + bbox.width + padding,
      y: bbox.y + translateY + bbox.height / 2,
      cursor: "e-resize",
      type: "e"
    },
    {
      x: bbox.x + translateX + bbox.width / 2,
      y: bbox.y + translateY + bbox.height + padding,
      cursor: "s-resize",
      type: "s"
    },
    {
      x: bbox.x + translateX - padding,
      y: bbox.y + translateY + bbox.height / 2,
      cursor: "w-resize",
      type: "w"
    }
  ];

  // Adding the Resizing
  anchorPositions.forEach(pos => {
    const anchor = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    anchor.setAttribute("cx", pos.x);
    anchor.setAttribute("cy", pos.y);
    anchor.setAttribute("r", 7);
    anchor.setAttribute("stroke", "#7875A6");
    anchor.style.cursor = pos.cursor;
    anchor.classList.add("anchor");
    anchor.anchorType = pos.type;
    anchor.addEventListener("pointerdown", anchorPointerDown); // Add listener
    // anchor.addEventListener("pointerup", anchorPointerUp); // ensure that you are not adding a duplicate function
    // anchor.addEventListener("pointermove", anchorPointerMove); // ensure that you are not adding a duplicate function
    svg.appendChild(anchor);
    selectionAnchors.push(anchor);
  });

  const x = bbox.x + translateX - padding;
  const y = bbox.y + translateY - padding;
  const width = bbox.width + 2 * padding;
  const height = bbox.height + 2 * padding;

  const points = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
    [x, y]
  ];

  const outline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  outline.setAttribute("points", points.map(pt => pt[0] + "," + pt[1]).join(" "));
  outline.setAttribute("class", "selection-outline");
  outline.setAttribute("stroke", "#7875A6");
  outline.setAttribute("stroke-width", "2"); // Adjust stroke width as needed
  outline.setAttribute("fill", "none");
  outline.style.pointerEvents = "none";
  svg.appendChild(outline);
}