document.addEventListener('DOMContentLoaded', function() {
    const styleButtons = document.querySelectorAll('.styles');
    const typographyBtn = document.getElementById("typography");
    const textControls = document.getElementById("textControls");
    
    if (typographyBtn && textControls) {
        typographyBtn.addEventListener("click", function() {
            textControls.classList.toggle("hidden");
        });
    }

    // Block-level controls event listeners
    const blockControls = [
        { id: "HEADING1", type: "H1" },
        { id: "HEADING2", type: "H2" },
        { id: "HEADING3", type: "H3" },
        { id: "HEADING4", type: "H4" },
        { id: "HEADING5", type: "H5" },
        { id: "CODE_BLOCK", type: "PRE" },
        { id: "UNORDERED_LIST", type: "UL" },
        { id: "ORDERED_LIST", type: "OL" },
        { id: "BLOCKQUOTE", type: "BLOCKQUOTE" },
        { id: "TABLE", type: "TABLE" }
    ];

    blockControls.forEach(control => {
        const element = document.getElementById(control.id);
        if (element) {
            element.addEventListener("click", function() {
                // console.log(`Clicked ${control.id}, applying ${control.type}`); // Debug log
                applyBlockStyle(control.type);
            });
        } else {
            console.warn(`Element with ID ${control.id} not found`);
        }
    });

    // Inline style controls event listeners
    const inlineControls = [
        { id: "BOLD_CONTROL", type: "bold" },
        { id: "ITALIC_CONTROL", type: "italic" },
        { id: "UNDERLINE_CONTROL", type: "underline" },
        { id: "STRIKETHROUGH_CONTROL", type: "strike" },
        { id: "MARKED_CONTROL", type: "mark" },
        { id: "INLINE_CODE", type: "code-inline" }
    ];

    inlineControls.forEach(control => {
        const element = document.getElementById(control.id);
        if (element) {
            element.addEventListener("click", function() {
                // console.log(`Clicked ${control.id}, applying ${control.type}`); // Debug log
                applyInlineStyle(control.type);
            });
        } else {
            console.warn(`Element with ID ${control.id} not found`);
        }
    });

    styleButtons.forEach(button => {
        button.addEventListener('mousedown', function(e) {
        // Prevent the button click from clearing the selection
        e.preventDefault();
        
        // Preserve the current selection
        if (currentSelection && currentSelection.isSelectionActive) {
            preservedSelection = {
            range: currentSelection.range.cloneRange(),
            text: currentSelection.text,
            isValid: currentSelection.isValid,
            isSelectionActive: currentSelection.isSelectionActive
            };
        }
        });
        
        button.addEventListener('click', function(e) {
        e.preventDefault();
        const selectionToUse = preservedSelection || currentSelection;
        if (selectionToUse && selectionToUse.isSelectionActive) {
            applyInlineStyle(button.dataset.style, selectionToUse);
            setTimeout(() => {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(selectionToUse.range);
            preservedSelection = null;
            }, 0);
        }
        });
    });
});



function applyBlockStyle(elementType) {
    
    sel = currentLineFormat.sel;
    range = currentLineFormat.range;
    currentLine = currentLineFormat.currentLine;

    if(currentBlock === "UNORDERED_LIST_TABLE" && currentLine.parentNode.tagName === "UL") {
    // Find the topmost list container within the table cell
    let topmostList = currentLine.closest('ul, ol');
    while (topmostList.parentElement && topmostList.parentElement.closest('ul, ol') && topmostList.closest('td')) {
        const nextList = topmostList.parentElement.closest('ul, ol');
        if (nextList.closest('td') === topmostList.closest('td')) {
            topmostList = nextList;
        } else {
            break;
        }
    }
    
    const td = topmostList.closest('td');
    if (td) {
        // Function to recursively extract all LI content as paragraphs
        function extractAllLiContentInTable(element) {
            const paragraphs = [];
            
            // Traverse all elements in the tree
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_ELEMENT,
                {
                    acceptNode: function(node) {
                        return node.tagName === 'LI' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                    }
                },
                false
            );
            
            let li;
            while ((li = walker.nextNode())) {
                // Create new paragraph for each LI
                const p = document.createElement('p');
                p.id = `p_${generateHexID()}`;
                
                // Extract only the direct span content from this LI
                const spans = Array.from(li.children).filter(child => child.tagName === 'SPAN');
                spans.forEach(span => {
                    p.appendChild(span.cloneNode(true));
                });
                
                // If no spans found, create a default span with the text content
                if (spans.length === 0) {
                    const defaultSpan = document.createElement('span');
                    defaultSpan.className = 'default-text';
                    defaultSpan.id = `span_${generateHexID()}`;
                    defaultSpan.textContent = li.textContent.trim() || '\u00A0';
                    p.appendChild(defaultSpan);
                }
                
                paragraphs.push(p);
            }
            
            return paragraphs;
        }
        
        // Extract all LI content as paragraphs
        const convertedParagraphs = extractAllLiContentInTable(topmostList);
        
        // Insert all converted paragraphs before the topmost list within the TD
        convertedParagraphs.forEach(p => {
            td.insertBefore(p, topmostList);
        });
        
        // Remove the original list structure
        topmostList.remove();
        
        // Update currentLineFormat reference to the first converted paragraph
        if (convertedParagraphs.length > 0) {
            currentLineFormat.currentLine = convertedParagraphs[0];
            
            // Update block status
            currentBlock = "PARAGRAPH";
            updateBlockStyleAvailability("PARAGRAPH");
            updateInlineStyleAvailability("PARAGRAPH");
            
            // Restore cursor position
            setTimeout(() => {
                try {
                    placeCaretAtEnd(convertedParagraphs[0]);
                    const fallbackRange = document.createRange();
                    fallbackRange.selectNodeContents(convertedParagraphs[0]);
                    fallbackRange.collapse(false);
                    currentLineFormat.range = fallbackRange;
                } catch (err) {
                    console.warn("Error restoring cursor position:", err);
                    placeCaretAtEnd(convertedParagraphs[0]);
                }
            }, 0);
        }
    }
    return;
}
    

    if (currentLine && currentLine.tagName === 'SPAN') {
        const blockAncestor = currentLine.closest('h1,h2,h3,h4,h5,h6,p,pre,blockquote,li');
        if (blockAncestor) {
            currentLine = blockAncestor;
            currentLineFormat.currentLine = blockAncestor; 
        } else {
            console.warn("No block-level ancestor found for currentLine");
            return;
        }
    }
    
    if (currentLine && currentLine.tagName === 'CODE') {
        const preElement = currentLine.closest('pre');
        if (preElement) {
            currentLine = preElement;
            currentLineFormat.currentLine = preElement;
        }
    }
    
    if (!currentLine) {
        console.warn("No current line element found");
        return;
    }

    let cursorPosition = 0;
    if (range) {
        const walker = document.createTreeWalker(
            currentLine,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        let node;
        let found = false;
        while ((node = walker.nextNode()) && !found) {
            if (node === range.startContainer) {
                cursorPosition += range.startOffset;
                found = true;
            } else {
                cursorPosition += node.textContent.length;
            }
        }
    }

    const hexID = generateHexID();
    let newElement;
    let content;

    if (currentLine.tagName === 'PRE') {
        const codeElement = currentLine.querySelector('code');
        content = codeElement ? codeElement.textContent : currentLine.textContent;
        content = content.replace(/\n/g, '<br>');
        if (!content.trim()) {
            content = '\u00A0';
        }
    } else {
        content = currentLine.innerHTML || '\u00A0';
    }
    
    const shouldToggleToP = (
        (elementType === "H1" && currentLine.tagName === 'H1') ||
        (elementType === "H2" && currentLine.tagName === 'H2') ||
        (elementType === "H3" && currentLine.tagName === 'H3') ||
        (elementType === "H4" && currentLine.tagName === 'H4') ||
        (elementType === "H5" && currentLine.tagName === 'H5') ||
        (elementType === "PRE" && currentLine.tagName === 'PRE') ||
        (elementType === "UL" && currentLine.tagName === 'LI' && currentLine.closest('ul')) ||
        (elementType === "OL" && currentLine.tagName === 'LI' && currentLine.closest('ol')) ||
        (elementType === "BLOCKQUOTE" && currentLine.tagName === 'BLOCKQUOTE')
    );

    if (shouldToggleToP) {
        newElement = document.createElement('p');
        newElement.id = `p_${hexID}`;
        
        if (currentLine.tagName === 'LI') {
            
            if ((elementType === "UL" && currentLine.closest('ul')) || 
    (elementType === "OL" && currentLine.closest('ol'))) {
    
    // Find the topmost list container by traversing up
    let topmostList = currentLine.closest('ul, ol');
    while (topmostList.parentElement && topmostList.parentElement.closest('ul, ol')) {
        topmostList = topmostList.parentElement.closest('ul, ol');
    }
    
    const listParent = topmostList.parentNode;
    
    // Function to recursively extract all LI content as paragraphs
    function extractAllLiContent(element) {
        const paragraphs = [];
        
        // Traverse all elements in the tree
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function(node) {
                    return node.tagName === 'LI' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                }
            },
            false
        );
        
        let li;
        while ((li = walker.nextNode())) {
            // Create new paragraph for each LI
            const p = document.createElement('p');
            p.id = `p_${generateHexID()}`;
            
            // Extract only the direct span content from this LI
            const spans = Array.from(li.children).filter(child => child.tagName === 'SPAN');
            spans.forEach(span => {
                p.appendChild(span.cloneNode(true));
            });
            
            // If no spans found, create a default span with the text content
            if (spans.length === 0) {
                const defaultSpan = document.createElement('span');
                defaultSpan.className = 'default-text';
                defaultSpan.id = `span_${generateHexID()}`;
                defaultSpan.textContent = li.textContent.trim() || '\u00A0';
                p.appendChild(defaultSpan);
            }
            
            paragraphs.push(p);
        }
        
        return paragraphs;
    }
    
    // Extract all LI content as paragraphs
    const convertedParagraphs = extractAllLiContent(topmostList);
    
    // Insert all converted paragraphs before the topmost list
    convertedParagraphs.forEach(p => {
        listParent.insertBefore(p, topmostList);
    });
    
    // Remove the original list structure
    topmostList.remove();
    
    // Set newElement to the first converted paragraph (where cursor was)
    newElement = convertedParagraphs[0] || newElement;
    
    // Update currentLineFormat reference
    currentLineFormat.currentLine = newElement;
    
    // Clear block style selection and hide language selector
    document.querySelectorAll(".blockedStyleElements").forEach(el => {
        el.classList.remove('selected');
    });
    document.getElementById("languageSelector")?.classList.add('hidden');
    
    currentBlock = "PARAGRAPH";
    updateBlockStyleAvailability("PARAGRAPH");
    updateInlineStyleAvailability("PARAGRAPH");
    
    // Restore cursor position in the new paragraph
    setTimeout(() => {
        try {
            placeCaretAtEnd(newElement);
            const fallbackRange = document.createRange();
            fallbackRange.selectNodeContents(newElement);
            fallbackRange.collapse(false);
            currentLineFormat.range = fallbackRange;
        } catch (err) {
            console.warn("Error restoring cursor position:", err);
            placeCaretAtEnd(newElement);
        }
    }, 0);
    
    return;
}
            
            // Original single LI conversion logic (kept for backwards compatibility)
            const listParent = currentLine.parentElement;
            content = currentLine.innerHTML; 
            
            // Replace the entire list with the paragraph if it's the only item
            if (listParent.children.length === 1) {
                newElement.innerHTML = content;
                listParent.parentNode.replaceChild(newElement, listParent);
            } else {
                // If there are other items, just convert this one
                newElement.innerHTML = content;
                listParent.parentNode.insertBefore(newElement, listParent);
                currentLine.remove();
                
                // If that was the last item, we need to update the reference
                if (listParent.children.length === 0) {
                    listParent.remove();
                }
            }
        } else {
            newElement.innerHTML = content;
            currentLine.parentNode.replaceChild(newElement, currentLine);
        }
        
        // Update currentLineFormat reference
        currentLineFormat.currentLine = newElement;
        
        // Clear block style selection and hide language selector
        document.querySelectorAll(".blockedStyleElements").forEach(el => {
            el.classList.remove('selected');
        });
        document.getElementById("languageSelector")?.classList.add('hidden');
        
        currentBlock = "PARAGRAPH";
        updateBlockStyleAvailability("PARAGRAPH");
        updateInlineStyleAvailability("PARAGRAPH");
    } else {
        // Apply the new block style
        switch(elementType) {
            case "H1":
            case "H2":
            case "H3":
            case "H4":
            case "H5":
                const headingLevel = elementType.charAt(1);
                
                // Simple heading conversion - just change the tag name
                newElement = document.createElement(`h${headingLevel}`);
                newElement.id = `heading_${hexID}`;
                newElement.innerHTML = content;
                currentLine.parentNode.replaceChild(newElement, currentLine);
                
                // Update currentLineFormat reference
                currentLineFormat.currentLine = newElement;
                updateCurrentBlock(`HEADING${headingLevel}`);
                break;

            case "PRE":
                newElement = document.createElement('div');
                newElement.innerHTML = createCodeBlock(hexID);
                const pre = newElement.firstElementChild;
                const code = pre.querySelector('code');
                const copyButton = pre.querySelector('i[data-copy-btn]');
                pre.id = `pre_${hexID}`;
                copyButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(code.textContent);
                    copyButton.classList.add('copied');
                    setTimeout(() => copyButton.classList.remove('copied'), 1500);
                });
                
                // Convert HTML content back to plain text for code blocks
                let textContent = content;
                if (content.includes('<br>')) {
                    // Convert <br> tags back to line breaks
                    textContent = content.replace(/<br\s*\/?>/gi, '\n');
                }
                // Remove any remaining HTML tags
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = textContent;
                textContent = tempDiv.textContent || tempDiv.innerText || '';
                
                code.textContent = textContent; // Use textContent to preserve formatting
                currentLine.parentNode.replaceChild(newElement, currentLine);
                
                // Update currentLineFormat reference
                currentLineFormat.currentLine = pre; // Point to the PRE element, not the wrapper div
                updateCurrentBlock("CODE_BLOCK");
                break;

            case "BLOCKQUOTE":
                newElement = document.createElement('blockquote');
                newElement.id = `quote_${hexID}`;
                newElement.innerHTML = content;
                currentLine.parentNode.replaceChild(newElement, currentLine);
                
                // Update currentLineFormat reference
                currentLineFormat.currentLine = newElement;
                updateCurrentBlock("BLOCKQUOTE");
                break;

            case "UL":
                // Special handling if we're already in a list
                if (currentLine.tagName === 'LI') {
                    const currentList = currentLine.parentElement;
                    
                    // If it's already a UL, do nothing (or toggle to P as handled above)
                    if (currentList.tagName === 'UL') {
                        return;
                    }
                    
                    // If it's an OL, convert to UL
                    if (currentList.tagName === 'OL') {
                        const ul = document.createElement('ul');
                        ul.id = `ul_${hexID}`;
                        
                        // Move all LI elements to new UL
                        while (currentList.firstChild) {
                            ul.appendChild(currentList.firstChild);
                        }
                        
                        currentList.parentNode.replaceChild(ul, currentList);
                        newElement = currentLine; // Keep reference to current LI
                        currentLineFormat.currentLine = newElement;
                        updateCurrentBlock("UNORDERED_LIST");
                        return;
                    }
                }
                
                // Normal case: create new UL
                const ul = document.createElement('ul');
                ul.id = `ul_${hexID}`;
                const li = document.createElement('li');
                li.id = `li_${generateHexID()}`;
                li.innerHTML = content;
                ul.appendChild(li);
                currentLine.parentNode.replaceChild(ul, currentLine);
                newElement = li;
                
                // Update currentLineFormat reference
                currentLineFormat.currentLine = newElement;
                updateCurrentBlock("UNORDERED_LIST");
                break;

            case "OL":
                // Special handling if we're already in a list
                if (currentLine.tagName === 'LI') {
                    const currentList = currentLine.parentElement;
                    
                    // If it's already an OL, do nothing (or toggle to P as handled above)
                    if (currentList.tagName === 'OL') {
                        return;
                    }
                    
                    // If it's a UL, convert to OL
                    if (currentList.tagName === 'UL') {
                        const ol = document.createElement('ol');
                        ol.id = `ol_${hexID}`;
                        
                        // Move all LI elements to new OL
                        while (currentList.firstChild) {
                            ol.appendChild(currentList.firstChild);
                        }
                        
                        currentList.parentNode.replaceChild(ol, currentList);
                        newElement = currentLine; // Keep reference to current LI
                        currentLineFormat.currentLine = newElement;
                        updateCurrentBlock("ORDERED_LIST");
                        return;
                    }
                }
                
                // Normal case: create new OL
                const ol = document.createElement('ol');
                ol.id = `ol_${hexID}`;
                const liItem = document.createElement('li');
                liItem.id = `li_${generateHexID()}`;
                liItem.innerHTML = content;
                ol.appendChild(liItem);
                currentLine.parentNode.replaceChild(ol, currentLine);
                newElement = liItem;
                
                // Update currentLineFormat reference
                currentLineFormat.currentLine = newElement;
                updateCurrentBlock("ORDERED_LIST");
                break;
            default:
                currentBlock = null;
        }
    }

    // Restore cursor position
    if (newElement && elementType !== "PRE") {
        setTimeout(() => {
            try {
                let currentPos = 0;
                const walker = document.createTreeWalker(
                    newElement,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );

                let node;
                while ((node = walker.nextNode())) {
                    const nodeLength = node.textContent.length;
                    if (currentPos + nodeLength >= cursorPosition) {
                        const offset = cursorPosition - currentPos;
                        const newRange = document.createRange();
                        newRange.setStart(node, Math.min(offset, nodeLength));
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        
                        // Update range reference
                        currentLineFormat.range = newRange;
                        return;
                    }
                    currentPos += nodeLength;
                }
                placeCaretAtEnd(newElement);
                
                // Update range reference for fallback
                const fallbackRange = document.createRange();
                fallbackRange.selectNodeContents(newElement);
                fallbackRange.collapse(false);
                currentLineFormat.range = fallbackRange;
                
            } catch (err) {
                console.warn("Error restoring cursor position:", err);
                placeCaretAtEnd(newElement);
                
                // Update range reference for error case
                const errorRange = document.createRange();
                errorRange.selectNodeContents(newElement);
                errorRange.collapse(false);
                currentLineFormat.range = errorRange;
            }
        }, 0);
    }
    else 
    {
        updateCurrentBlock = null;
    }
}


function applyInlineStyle(styleType, selection) {
    sel = currentLineFormat.sel;
    range = currentLineFormat.range;
    currentLine = currentLineFormat.currentLine;
    
    if (!sel.rangeCount) {
        console.warn("No selection range found");
        return;
    }
    
    if (!currentLine) {
        console.warn("No current line element found");
        return;
    }

    // Don't apply inline styles to code blocks
    if (currentLine.tagName === 'PRE') {
        console.warn("Cannot apply inline styles to code blocks");
        return;
    }

    if(selection && selection.isSelectionActive == true) {
        applyStyleToSelection(selection, styleType);
    } else {
        applyStyleAtCursor(styleType, range, currentLine);
    }
    
    // Update buttons in real-time after applying style
    setTimeout(() => {
        handleSelectionChange();
    }, 10);
}


function applyStyleAtCursor(styleType, range, currentLine) {
    const currentNode = range.startContainer;
    
    // If cursor is in a styled span, we need to split it and only affect future typing
    if (currentNode.nodeType === Node.TEXT_NODE && currentNode.parentNode.tagName === 'SPAN') {
        const parentSpan = currentNode.parentNode;
        const currentClasses = parentSpan.className.split(' ').filter(cls => 
            ['bold', 'italic', 'underline', 'strike', 'mark', 'code-inline', 'default-text'].includes(cls)
        );
        
        const textContent = currentNode.textContent;
        const cursorOffset = range.startOffset;
        
        // Split the text at cursor position
        const beforeText = textContent.substring(0, cursorOffset);
        const afterText = textContent.substring(cursorOffset);
        
        // Special case: if this is an empty span with just nbsp, replace it entirely
        if (textContent === '\u00A0' && beforeText === '' && afterText === '\u00A0') {
            // Determine new style classes
            let newClasses = [...currentClasses];
            if (currentClasses.includes(styleType)) {
                // Toggle off the style
                newClasses = newClasses.filter(cls => cls !== styleType);
                if (newClasses.length === 0) {
                    newClasses = ['default-text'];
                }
            } else if (currentClasses.includes('default-text')) {
                // Replace default-text with new style
                newClasses = [styleType];
            } else {
                // Add new style to existing ones
                newClasses.push(styleType);
                newClasses = newClasses.filter(cls => cls !== 'default-text');
            }
            
            // Update the current span's class
            parentSpan.className = newClasses.join(' ');
            
            // Create a new default span after this one for future typing
            const nextSpan = document.createElement('span');
            nextSpan.className = 'default-text';
            nextSpan.id = `span_${generateHexID()}`;
            nextSpan.textContent = '\u00A0';
            
            // Insert after the current span
            parentSpan.parentNode.insertBefore(nextSpan, parentSpan.nextSibling);
            
            updateCurrentInlineBlock(newClasses.includes('default-text') ? 'default-text' : styleType);
            updateInlineStyleButtons(parentSpan, parentSpan.className);
            return;
        }
        
        // If cursor is at the beginning of the span
        if (cursorOffset === 0) {
            // Create new styled span for future typing
            const newSpan = document.createElement('span');
            
            // Determine new style classes
            let newClasses = [...currentClasses];
            if (currentClasses.includes(styleType)) {
                // Toggle off the style
                newClasses = newClasses.filter(cls => cls !== styleType);
                if (newClasses.length === 0) {
                    newClasses = ['default-text'];
                }
            } else if (currentClasses.includes('default-text')) {
                // Replace default-text with new style
                newClasses = [styleType];
            } else {
                // Add new style to existing ones
                newClasses.push(styleType);
                newClasses = newClasses.filter(cls => cls !== 'default-text');
            }
            
            newSpan.className = newClasses.join(' ');
            newSpan.id = `span_${generateHexID()}`;
            newSpan.textContent = '\u00A0'; // Placeholder for future typing
            
            // Insert before the existing span
            parentSpan.parentNode.insertBefore(newSpan, parentSpan);
            
            // Place cursor at end of new span
            placeCaretAtEnd(newSpan);
            updateCurrentInlineBlock(newClasses.includes('default-text') ? 'default-text' : styleType);
            updateInlineStyleButtons(newSpan, newSpan.className);
            return;
        }
        
        // If cursor is at the end of the span
        if (cursorOffset === textContent.length) {
            // Create new styled span for future typing
            const newSpan = document.createElement('span');
            
            // Determine new style classes
            let newClasses = [...currentClasses];
            if (currentClasses.includes(styleType)) {
                // Toggle off the style
                newClasses = newClasses.filter(cls => cls !== styleType);
                if (newClasses.length === 0) {
                    newClasses = ['default-text'];
                }
            } else if (currentClasses.includes('default-text')) {
                // Replace default-text with new style
                newClasses = [styleType];
            } else {
                // Add new style to existing ones
                newClasses.push(styleType);
                newClasses = newClasses.filter(cls => cls !== 'default-text');
            }
            
            newSpan.className = newClasses.join(' ');
            newSpan.id = `span_${generateHexID()}`;
            newSpan.textContent = '\u00A0'; // Placeholder for future typing
            
            // Insert after the existing span
            parentSpan.parentNode.insertBefore(newSpan, parentSpan.nextSibling);
            
            // Place cursor at end of new span
            placeCaretAtEnd(newSpan);
            updateCurrentInlineBlock(newClasses.includes('default-text') ? 'default-text' : styleType);
            updateInlineStyleButtons(newSpan, newSpan.className);
            return;
        }
        
        // If cursor is in the middle of the span, split it
        if (beforeText && afterText) {
            // Create before span (keep original styling)
            const beforeSpan = document.createElement('span');
            beforeSpan.className = parentSpan.className;
            beforeSpan.id = `span_${generateHexID()}`;
            beforeSpan.textContent = beforeText;
            
            // Create new styled span for future typing
            const newSpan = document.createElement('span');
            
            // Determine new style classes
            let newClasses = [...currentClasses];
            if (currentClasses.includes(styleType)) {
                // Toggle off the style
                newClasses = newClasses.filter(cls => cls !== styleType);
                if (newClasses.length === 0) {
                    newClasses = ['default-text'];
                }
            } else if (currentClasses.includes('default-text')) {
                // Replace default-text with new style
                newClasses = [styleType];
            } else {
                // Add new style to existing ones
                newClasses.push(styleType);
                newClasses = newClasses.filter(cls => cls !== 'default-text');
            }
            
            newSpan.className = newClasses.join(' ');
            newSpan.id = `span_${generateHexID()}`;
            newSpan.textContent = '\u00A0'; // Placeholder for future typing
            
            // Create after span (keep original styling)
            const afterSpan = document.createElement('span');
            afterSpan.className = parentSpan.className;
            afterSpan.id = `span_${generateHexID()}`;
            afterSpan.textContent = afterText;
            
            // Insert all new spans
            parentSpan.parentNode.insertBefore(beforeSpan, parentSpan);
            parentSpan.parentNode.insertBefore(newSpan, parentSpan);
            parentSpan.parentNode.insertBefore(afterSpan, parentSpan);
            
            // Remove original span
            parentSpan.remove();
            
            // Place cursor at end of new styled span
            placeCaretAtEnd(newSpan);
            updateCurrentInlineBlock(newClasses.includes('default-text') ? 'default-text' : styleType);
            updateInlineStyleButtons(newSpan, newSpan.className);
            return;
        }
    }
    
    // If cursor is not in a span, create new styled span for future typing
    const newSpan = document.createElement('span');
    newSpan.className = styleType;
    newSpan.id = `span_${generateHexID()}`;
    newSpan.textContent = '\u00A0'; // Only add non-breaking space as placeholder
    
    range.insertNode(newSpan);
    placeCaretAtEnd(newSpan);
    updateCurrentInlineBlock(styleType);
    updateInlineStyleButtons(newSpan, newSpan.className);
}

function applyStyleToSelection(selection, styleType) {
    const selectedText = selection.range.toString();
    if (!selectedText) {
        // If no text is selected, treat as cursor positioning
        applyStyleAtCursor(styleType, selection.range, currentLineFormat.currentLine);
        return;
    }
    
    const range = selection.range;
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    
    // Case 1: Selection is entirely within a single text node
    if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
        const parentElement = startContainer.parentNode;
        
        // Check if parent is a span with styling
        if (parentElement.tagName === 'SPAN') {
            const currentClasses = parentElement.className.split(' ').filter(cls => 
                ['bold', 'italic', 'underline', 'strike', 'mark', 'code-inline', 'default-text'].includes(cls)
            );
            
            // If it's default-text, apply the new style
            if (currentClasses.includes('default-text') || currentClasses.length === 0) {
                const beforeText = startContainer.textContent.substring(0, range.startOffset);
                const selectedText = startContainer.textContent.substring(range.startOffset, range.endOffset);
                const afterText = startContainer.textContent.substring(range.endOffset);
                
                // Create before span if there's text before (only if there's actual content)
                if (beforeText) {
                    const beforeSpan = document.createElement('span');
                    beforeSpan.className = 'default-text';
                    beforeSpan.id = `span_${generateHexID()}`;
                    beforeSpan.textContent = beforeText;
                    parentElement.parentNode.insertBefore(beforeSpan, parentElement);
                }
                
                // Create styled span for selected text
                const styledSpan = document.createElement('span');
                styledSpan.className = styleType;
                styledSpan.id = `span_${generateHexID()}`;
                styledSpan.textContent = selectedText;
                parentElement.parentNode.insertBefore(styledSpan, parentElement);
                
                // Create after span if there's text after (only if there's actual content)
                if (afterText) {
                    const afterSpan = document.createElement('span');
                    afterSpan.className = 'default-text';
                    afterSpan.id = `span_${generateHexID()}`;
                    afterSpan.textContent = afterText;
                    parentElement.parentNode.insertBefore(afterSpan, parentElement);
                }
                
                // Remove original span
                parentElement.remove();
                
                // Select the new styled span
                const newRange = document.createRange();
                newRange.selectNodeContents(styledSpan);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(newRange);
                
                updateCurrentInlineBlock(styleType);
                return;
            }
            
            // Handle multiple classes in the span
            if (currentClasses.length >= 1 && !currentClasses.includes('default-text')) {
                // If same style exists, remove it (toggle off)
                if (currentClasses.includes(styleType)) {
                    const beforeText = startContainer.textContent.substring(0, range.startOffset);
                    const selectedText = startContainer.textContent.substring(range.startOffset, range.endOffset);
                    const afterText = startContainer.textContent.substring(range.endOffset);
                    
                    const newClasses = currentClasses.filter(cls => cls !== styleType);
                    const finalClass = newClasses.length === 0 ? 'default-text' : newClasses.join(' ');
                    
                    // Create before span if there's text before
                    if (beforeText) {
                        const beforeSpan = document.createElement('span');
                        beforeSpan.className = currentClasses.join(' ');
                        beforeSpan.id = `span_${generateHexID()}`;
                        beforeSpan.textContent = beforeText;
                        parentElement.parentNode.insertBefore(beforeSpan, parentElement);
                    }
                    
                    // Create span for selected text with style removed
                    const modifiedSpan = document.createElement('span');
                    modifiedSpan.className = finalClass;
                    modifiedSpan.id = `span_${generateHexID()}`;
                    modifiedSpan.textContent = selectedText;
                    parentElement.parentNode.insertBefore(modifiedSpan, parentElement);
                    
                    // Create after span if there's text after
                    if (afterText) {
                        const afterSpan = document.createElement('span');
                        afterSpan.className = currentClasses.join(' ');
                        afterSpan.id = `span_${generateHexID()}`;
                        afterSpan.textContent = afterText;
                        parentElement.parentNode.insertBefore(afterSpan, parentElement);
                    }
                    
                    // Remove original span
                    parentElement.remove();
                    
                    // Select the new span
                    const newRange = document.createRange();
                    newRange.selectNodeContents(modifiedSpan);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    
                    updateCurrentInlineBlock(finalClass === 'default-text' ? 'default-text' : styleType);
                    return;
                } else {
                    // Different style, add to existing classes
                    const beforeText = startContainer.textContent.substring(0, range.startOffset);
                    const selectedText = startContainer.textContent.substring(range.startOffset, range.endOffset);
                    const afterText = startContainer.textContent.substring(range.endOffset);
                    
                    // Create before span if there's text before
                    if (beforeText) {
                        const beforeSpan = document.createElement('span');
                        beforeSpan.className = currentClasses.join(' ');
                        beforeSpan.id = `span_${generateHexID()}`;
                        beforeSpan.textContent = beforeText;
                        parentElement.parentNode.insertBefore(beforeSpan, parentElement);
                    }
                    
                    // Create new styled span with combined styles
                    const newStyledSpan = document.createElement('span');
                    const newClasses = [...currentClasses, styleType].filter((cls, index, arr) => 
                        arr.indexOf(cls) === index && cls !== 'default-text'
                    );
                    newStyledSpan.className = newClasses.join(' ');
                    newStyledSpan.id = `span_${generateHexID()}`;
                    newStyledSpan.textContent = selectedText;
                    parentElement.parentNode.insertBefore(newStyledSpan, parentElement);
                    
                    // Create after span if there's text after
                    if (afterText) {
                        const afterSpan = document.createElement('span');
                        afterSpan.className = currentClasses.join(' ');
                        afterSpan.id = `span_${generateHexID()}`;
                        afterSpan.textContent = afterText;
                        parentElement.parentNode.insertBefore(afterSpan, parentElement);
                    }
                    
                    // Remove original span
                    parentElement.remove();
                    
                    // Select the new styled span
                    const newRange = document.createRange();
                    newRange.selectNodeContents(newStyledSpan);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(newRange);

                    updateCurrentInlineBlock(styleType);
                    return;
                }
            }
        }
    }
    
    // Case 3: Selection spans multiple elements/spans
    const fragment = range.extractContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment.cloneNode(true));
    
    // Collect all text nodes and their styling
    const walker = document.createTreeWalker(
        tempDiv,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        const parentSpan = node.parentNode.tagName === 'SPAN' ? node.parentNode : null;
        textNodes.push({
            text: node.textContent,
            parentClasses: parentSpan ? parentSpan.className.split(' ').filter(cls => 
                ['bold', 'italic', 'underline', 'strike', 'mark', 'code-inline', 'default-text'].includes(cls)
            ) : ['default-text']
        });
    }
    
    // Create new spans for each text segment
    const newFragment = document.createDocumentFragment();
    
    textNodes.forEach(nodeInfo => {
        if (nodeInfo.text) { // Remove .trim() to preserve spaces
            const newSpan = document.createElement('span');
            
            // Determine new classes
            let newClasses = [...nodeInfo.parentClasses];
            
            // If default-text or no styling, apply new style
            if (newClasses.includes('default-text') || newClasses.length === 0) {
                newClasses = [styleType];
            } else {
                // If same style exists, remove it (toggle off)
                if (newClasses.includes(styleType)) {
                    newClasses = newClasses.filter(cls => cls !== styleType);
                    if (newClasses.length === 0) {
                        newClasses = ['default-text'];
                    }
                } else {
                    // Add new style to existing ones
                    newClasses.push(styleType);
                    newClasses = newClasses.filter(cls => cls !== 'default-text');
                }
            }
            
            newSpan.className = newClasses.join(' ');
            newSpan.id = `span_${generateHexID()}`;
            newSpan.textContent = nodeInfo.text;
            newFragment.appendChild(newSpan);
        }
    });
    
    // Insert the new fragment
    range.insertNode(newFragment);
    
    // Set cursor at the end of the new content
    const newRange = document.createRange();
    newRange.selectNodeContents(newFragment);
    newRange.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(newRange);

    updateCurrentInlineBlock(styleType);
    
    setTimeout(() => {
        if (typeof processEntireLineContent === 'function') {
            processEntireLineContent(currentLineFormat.currentLine);
        }
    }, 0);
}
