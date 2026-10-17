
// New function to convert selected text across multiple elements to list
function convertTableSelectionToList(selection, listType, td) {
    const range = selection.getRangeAt(0);
    const selectedContent = range.extractContents();
    const selectedSpans = selectedContent.querySelectorAll('p');
    console.log(Array.from(selectedSpans));
   
}




function handleTableCellFormatting(lineEl, text) {
  const td = lineEl.closest('td');
  if (!td) return false;

  const unorderedListMatch = text.match(/^-\s(.*)/);
  const orderedListMatch = text.match(/^\d+\.\s(.*)/);

  if (unorderedListMatch || orderedListMatch) {
    const isOrdered = !!orderedListMatch;
    const listType = isOrdered ? 'ol' : 'ul';
    const content = isOrdered ? orderedListMatch[1] : unorderedListMatch[1];

    updateCurrentBlock(isOrdered ? "ORDERED_LIST_TABLE" : "UNORDERED_LIST_TABLE");
    
    // Check if there's already a list of the same type before this p
    const prevSibling = lineEl.previousElementSibling;
    let targetList;
    
    if (prevSibling && prevSibling.tagName === listType.toUpperCase()) {
      // Add to existing list
      targetList = prevSibling;
    } else {
      // Create new list
      const hexID = generateHexID();
      targetList = document.createElement(listType);
      targetList.id = `${listType}_${hexID}`;
      targetList.style.margin = '0';
      targetList.style.paddingLeft = '20px';
      td.insertBefore(targetList, lineEl);
    }
    
    // Create list item
    const li = document.createElement('li');
    li.id = `li_${generateHexID()}`;
    
        
    while (lineEl.firstChild) {
    li.appendChild(lineEl.firstChild);
    }

    
    let span = li.querySelector('span');
    if (!span) {
    span = document.createElement('span');
    span.className = 'default-text';
    span.id = `span_${generateHexID()}`;
    li.appendChild(span);
    }


    if (content && hasMarkdownPattern(content)) {
    processMarkdownInText(content, span);
    } else {
    span.textContent = content || '\u00A0';
    }
    
    targetList.appendChild(li);
    
    // Remove the original p element
    lineEl.remove();
    
    // Create new p after the list for continued editing if needed
    if (!targetList.nextElementSibling || targetList.nextElementSibling.tagName !== 'P') {
      const newP = document.createElement('p');
      newP.id = `p_${generateHexID()}`;
      const newSpan = document.createElement('span');
      newSpan.className = 'default-text';
      newSpan.id = `span_${generateHexID()}`;
      newSpan.textContent = '\u00A0';
      newP.appendChild(newSpan);
      td.insertBefore(newP, targetList.nextSibling);
    }
    
    placeCaretAtEnd(li.querySelector('span'));
    return true;
  }

  return false;
}


function isInUnorderedList(element) {
    if (element.tagName === 'LI') {
        let current = element;
        while (current) {
            if (current.parentElement && current.parentElement.tagName === 'UL') {
                return true;
            }
            // Move up to check for nested lists
            current = current.parentElement;
            if (current && current.tagName === 'LI') {
                continue;
            } else {
                break;
            }
        }
    }
    return false;
}

// Helper function to check if element is inside any level of OL
function isInOrderedList(element) {
    if (element.tagName === 'LI') {
        let current = element;
        while (current) {
            if (current.parentElement && current.parentElement.tagName === 'OL') {
                return true;
            }
            // Move up to check for nested lists
            current = current.parentElement;
            if (current && current.tagName === 'LI') {
                continue;
            } else {
                break;
            }
        }
    }
    return false;
}

// Helper function to check if we're inside a list within a table
function isListInsideTable(element) {
    let current = element;
    let foundList = false;
    
    while (current && current !== document.body) {
        if ((current.tagName === 'UL' || current.tagName === 'OL') && !foundList) {
            foundList = true;
        }
        if (current.tagName === 'TD' && foundList) {
            return true;
        }
        current = current.parentElement;
    }
    return false;
}