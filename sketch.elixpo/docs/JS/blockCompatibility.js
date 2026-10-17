function getBlockCompatibilityRules() {
    return {
        "PARAGRAPH": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "UNORDERED_LIST", "ORDERED_LIST", "BLOCKQUOTE", "INLINE_CODE"],
            disallowed: []
        },
        "BLOCKQUOTE": {
            allowed: ["INLINE_CODE"], 
            disallowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "UNORDERED_LIST", "ORDERED_LIST"]
        },
        "CODE_BLOCK": {
            allowed: [], 
            disallowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"]
        },
        "HEADING1": {
            allowed: ["HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "HEADING2": {
            allowed: ["HEADING1", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "HEADING3": {
            allowed: ["HEADING1", "HEADING2", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "HEADING4": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "HEADING5": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "UNORDERED_LIST": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "ORDERED_LIST"],
            disallowed: []
        },
        "ORDERED_LIST": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST"],
            disallowed: []
        },
        "PARAGRAPH": {
            allowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE", "UNORDERED_LIST", "ORDERED_LIST"],
            disallowed: []
        },
        "TABLE" : {
            allowed: ["UNORDERED_LIST", "ORDERED_LIST", "PARAGRAPH"],
            disallowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE"]
        },
        "UNORDERED_LIST_TABLE" : {
            allowed : ["UNORDERED_LIST", "TABLE", "ORDERED_LIST"],
            disallowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE"]
        },
        "ORDERED_LIST_TABLE" : {
            allowed : ["UNORDERED_LIST", "TABLE", "ORDERED_LIST"],
            disallowed: ["HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", "CODE_BLOCK", "BLOCKQUOTE"]
        }

    };
}

function updateBlockStyleAvailability(currentBlockType) {
    const rules = getBlockCompatibilityRules();
    const currentRules = rules[currentBlockType];
    
    if (!currentRules) return;
    
    // Reset all block controls first
    const allBlockControls = [
        "HEADING1", "HEADING2", "HEADING3", "HEADING4", "HEADING5", 
        "CODE_BLOCK", "UNORDERED_LIST", "ORDERED_LIST", "BLOCKQUOTE", "TABLE", "UNORDERED_LIST_TABLE",
        "ORDERED_LIST_TABLE", "PARAGRAPH"
    ];
    
    allBlockControls.forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            element.classList.remove('deactivated');
            element.style.pointerEvents = 'auto';
            element.style.opacity = '1';
        }
    });
    
    // Deactivate disallowed controls
    currentRules.disallowed.forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            element.classList.add('deactivated');
            element.style.pointerEvents = 'none';
            element.style.opacity = '0.5';
        }
    });
}

function updateInlineStyleAvailability(currentBlockType) {
    const inlineControls = [
        "BOLD_CONTROL", "ITALIC_CONTROL", "UNDERLINE_CONTROL", 
        "STRIKETHROUGH_CONTROL", "MARKED_CONTROL", "INLINE_CODE"
    ];
    
    // Reset all inline controls first
    inlineControls.forEach(controlId => {
        const element = document.getElementById(controlId);
        if (element) {
            element.classList.remove('deactivated');
            element.style.pointerEvents = 'auto';
            element.style.opacity = '1';
        }
    });
    
    // Special rules for specific block types
    if (currentBlockType === "CODE_BLOCK") {
        document.getElementById("languageSelector").classList.remove('hidden');
        inlineControls.forEach(controlId => {
            if (controlId !== "INLINE_CODE") {
                const element = document.getElementById(controlId);
                if (element) {
                    element.classList.add('deactivated');
                    element.style.pointerEvents = 'none';
                    element.style.opacity = '0.5';
                }
            }
        });
    }
}


function shouldToggleToP(elementType, element) {
    const toggleMap = {
        "H1": "H1", "H2": "H2", "H3": "H3", "H4": "H4", "H5": "H5",
        "PRE": "PRE", "BLOCKQUOTE": "BLOCKQUOTE"
    };
    
    if (toggleMap[elementType] === element.tagName) return true;
    
    if ((elementType === "UL" && element.tagName === 'LI' && element.parentElement.tagName === 'UL') ||
        (elementType === "OL" && element.tagName === 'LI' && element.parentElement.tagName === 'OL')) {
        return true;
    }
    
    return false;
}

function convertToP(element) {
    const hexID = generateHexID();
    const newElement = document.createElement('p');
    newElement.id = `p_${hexID}`;
    
    if (element.tagName === 'LI') {
        const listParent = element.parentElement;
        newElement.innerHTML = element.innerHTML;
        
        if (listParent.children.length === 1) {
            listParent.parentNode.replaceChild(newElement, listParent);
        } else {
            listParent.parentNode.insertBefore(newElement, listParent);
            element.remove();
            if (listParent.children.length === 0) listParent.remove();
        }
    } else {
        newElement.innerHTML = element.innerHTML || '\u00A0';
        element.parentNode.replaceChild(newElement, element);
    }
    
    currentLineFormat.currentLine = newElement;
    updateCurrentBlock("PARAGRAPH");
}


function handleSelectionChange() {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) {
    // Only clear if we're not preserving a selection
    if (!preservedSelection) {
      currentSelection = null;
    }
    return;
  }
  
  const range = selection.getRangeAt(0);
  const selectedText = selection.toString();
  
  // Check if selection is within editor content
  const editorContainer = document.querySelector('.editor-content') || document.body;
  if (!editorContainer.contains(range.commonAncestorContainer)) {
    return;
  }
  
  
  const currentLine = getCurrentLineElement();
  if (currentLine) {
    console.log("Current line element:", currentLine.parentNode, currentLine.tagName, currentLine.parentNode?.parentNode);
    switch (currentLine.tagName) {
      case 'H1':
        if (currentBlock !== "HEADING1") updateCurrentBlock("HEADING1");
        break;
      case 'H2':
        if (currentBlock !== "HEADING2") updateCurrentBlock("HEADING2");
        break;
      case 'H3':
        if (currentBlock !== "HEADING3") updateCurrentBlock("HEADING3");
        break;
      case 'H4':
        if (currentBlock !== "HEADING4") updateCurrentBlock("HEADING4");
        break;
      case 'H5':
        if (currentBlock !== "HEADING5") updateCurrentBlock("HEADING5");
        break;
      case 'PRE':
        if (currentBlock !== "CODE_BLOCK") updateCurrentBlock("CODE_BLOCK");
        break;
      case 'BLOCKQUOTE':
        if (currentBlock !== "BLOCKQUOTE") updateCurrentBlock("BLOCKQUOTE");
        break;
      case 'LI':
        if (isListInsideTable(currentLine)) {
            if (isInUnorderedList(currentLine)) {
                updateCurrentBlock("UNORDERED_LIST_TABLE");
            } else if (isInOrderedList(currentLine)) {
                updateCurrentBlock("ORDERED_LIST_TABLE");
            }
        } else {
            const parentList = currentLine.parentElement;
            if (parentList && parentList.tagName === 'UL') {
                if (currentBlock !== "UNORDERED_LIST") updateCurrentBlock("UNORDERED_LIST");
            } else if (parentList && parentList.tagName === 'OL') {
                if (currentBlock !== "ORDERED_LIST") updateCurrentBlock("ORDERED_LIST");
            }
        }
        break;
      case 'P':
        if(currentLine.parentNode.tagName === "TD")
        {
            updateCurrentBlock("TABLE");
            break;
        }
        updateCurrentBlock("PARAGRAPH");
        if (currentBlock !== null) updateCurrentBlock("PARAGRAPH");
        break;
    }
  }
  
  // Get the current element more accurately
  let currentElement = range.startContainer;
  if (currentElement.nodeType === Node.TEXT_NODE) {
    currentElement = currentElement.parentNode;
  }
  
  // Find the closest span element
  while (currentElement && currentElement.tagName !== 'SPAN' && currentElement !== document.body) {
    currentElement = currentElement.parentNode;
  }
  
  if (selection.toString().length > 0) {
    currentSelection = {
      range: range.cloneRange(), 
      text: selectedText,
      isValid: selectedText.length > 0,
      isSelectionActive: true
    };
    
    // For selections, check the common ancestor or the range itself
    const selectionElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
      ? range.commonAncestorContainer.parentNode 
      : range.commonAncestorContainer;
      
    console.log("Selection element:", selectionElement);
    updateInlineStyleButtons(selectionElement, selectionElement.className || '');
    
  } else {
    currentSelection = {
      range: range.cloneRange(),
      text: selectedText,
      isValid: selectedText.length > 0,
      isSelectionActive: false
    };
    
    // For cursor position, use the current element
    if (currentElement && currentElement.tagName === 'SPAN') {
      console.log("Cursor element:", currentElement);
      updateInlineStyleButtons(currentElement, currentElement.className || '');
    } else {
      // If not in a span, treat as default-text
      updateInlineStyleButtons(null, 'default-text');
    }
  }
}


function updateCurrentBlock(type) {
    document.querySelectorAll(".blockedStyleElements").forEach(el => {
        el.classList.remove('selected');
    });
    currentBlock = type;

    document.getElementById("languageSelector")?.classList.add('hidden');
    updateBlockStyleAvailability(type);
    
    switch (currentBlock) {
        case "HEADING1":
            document.getElementById('HEADING1')?.classList.add('selected');
            break;
        case "HEADING2":
            document.getElementById('HEADING2')?.classList.add('selected');
            break;
        case "HEADING3":
            document.getElementById('HEADING3')?.classList.add('selected');
            break;
        case "HEADING4":
            document.getElementById('HEADING4')?.classList.add('selected');
            break;
        case "HEADING5":
            document.getElementById('HEADING5')?.classList.add('selected');
            break;
        case "CODE_BLOCK":
            document.getElementById('CODE_BLOCK')?.classList.add('selected');
            document.getElementById("languageSelector")?.classList.remove('hidden');
            setTimeout(() => {
                if (typeof updateLanguageSelectorForCodeBlock === 'function') {
                    updateLanguageSelectorForCodeBlock();
                }
            }, 0);
            break;
        case "UNORDERED_LIST":
            document.getElementById('UNORDERED_LIST')?.classList.add('selected');
            break;
        case "ORDERED_LIST":
            document.getElementById('ORDERED_LIST')?.classList.add('selected');
            break;
        case "BLOCKQUOTE":
            document.getElementById('BLOCKQUOTE')?.classList.add('selected');
            break;
        case "TABLE": 
            document.getElementById("TABLE")?.classList.add("selected");
            break;

        case "UNORDERED_LIST_TABLE":
            document.getElementById("UNORDERED_LIST")?.classList.add("selected");
            document.getElementById("TABLE")?.classList.add("selected");
            break;
        case "ORDERED_LIST_TABLE":
            document.getElementById("ORDERED_LIST")?.classList.add("selected");
            document.getElementById("TABLE")?.classList.add("selected");
            break;
        case "PARAGRAPH":
            updateBlockStyleAvailability("PARAGRAPH");
            document.querySelectorAll(".blockedStyleElements").forEach(el => {
                el.classList.remove('selected');
            });
            currentBlock = null;
            break;
        
    }
}

function updateCurrentInlineBlock(type) {
    document.querySelectorAll(".styles").forEach(el => {
        el.classList.remove('selected');
    });
    currentInlineBlock = type;
    switch (type) {
        case "bold":
            currentInlineBlock = "BOLD_CONTROL";
            document.getElementById('BOLD_CONTROL')?.classList.add('selected');
            break;
        case "italic":
            currentInlineBlock = "ITALIC_CONTROL";
            document.getElementById('ITALIC_CONTROL')?.classList.add('selected');
            break;
        case "underline":
            currentInlineBlock = "UNDERLINE_CONTROL";
            document.getElementById('UNDERLINE_CONTROL')?.classList.add('selected');
            break;
        case "strike":
            currentInlineBlock = "STRIKETHROUGH_CONTROL";
            document.getElementById('STRIKETHROUGH_CONTROL')?.classList.add('selected');
            break;
        case "mark":
            currentInlineBlock = "MARKED_CONTROL";
            document.getElementById('MARKED_CONTROL')?.classList.add('selected');
            break;
        case "code-inline":
            currentInlineBlock = "INLINE_CODE";
            document.getElementById('INLINE_CODE')?.classList.add('selected');
            break;
        case "default-text":
            currentInlineBlock = "DEFAULT_TEXT";
            document.querySelectorAll(".styles").forEach(el => {
                el.classList.remove('selected');
            });
            break;
    }
}

function updateInlineStyleButtons(element, className) {
    const styleButtons = document.querySelectorAll('.styles');
    
    // Clear all selected states first
    styleButtons.forEach(btn => btn.classList.remove('selected'));
    
    if (!element || !className) return;
    
    if (currentSelection && currentSelection.isSelectionActive) {
        // Handle selection state - check all spans in selection
        const range = currentSelection.range;
        const selectedFragment = range.cloneContents();
        const spans = selectedFragment.querySelectorAll('span');
        
        // Collect all style classes from selected spans
        const allStyles = new Set();
        
        // Check if selection spans multiple elements
        if (spans.length > 1) {
            spans.forEach(span => {
                const classes = span.className.split(' ').filter(cls => 
                    ['bold', 'italic', 'strike', 'underline', 'mark', 'code-inline'].includes(cls)
                );
                classes.forEach(cls => allStyles.add(cls));
            });
        } else {
            // Single span or text node
            const parentSpan = range.startContainer.nodeType === Node.TEXT_NODE 
                ? range.startContainer.parentNode 
                : range.startContainer;
                
            if (parentSpan && parentSpan.tagName === 'SPAN') {
                const classes = parentSpan.className.split(' ').filter(cls => 
                    ['bold', 'italic', 'strike', 'underline', 'mark', 'code-inline'].includes(cls)
                );
                classes.forEach(cls => allStyles.add(cls));
            }
        }
        
        // Activate buttons for all found styles
        allStyles.forEach(styleClass => {
            const activeButton = Array.from(styleButtons).find(btn => btn.dataset.style === styleClass);
            if (activeButton) {
                activeButton.classList.add('selected');
            }
        });
        
        console.log("Selection styles:", Array.from(allStyles));
        
    } else {
        // Handle cursor position state
        const styleClasses = className.split(' ').filter(cls => 
            ['bold', 'italic', 'strike', 'underline', 'mark', 'code-inline', 'default-text'].includes(cls)
        );
        
        console.log("Cursor position styles:", styleClasses);
        
        if (styleClasses.includes('default-text') || styleClasses.length === 0) {
            // All buttons should remain unselected for default-text
            return;
        }
        
        
        styleClasses.forEach(styleClass => {
            if (styleClass !== 'default-text') {
                const activeButton = Array.from(styleButtons).find(btn => btn.dataset.style === styleClass);
                if (activeButton) {
                    activeButton.classList.add('selected');
                }
            }
        });
    }
}
