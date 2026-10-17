function hasMarkdownPattern(text) {
  const patterns = [
    /\*\*(.+?)\*\*/g,
    /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,
    /__(.+?)__/g,
    /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g,
    /~~(.+?)~~/g,
    /==(.+?)==/g,
    /`([^`\n]+?)`/g
  ];
  return patterns.some(pattern => pattern.test(text));
}

const stylePatterns = [
  { regex: /\*\*(.+?)\*\*/g, tag: 'span', className: 'bold' },
  { regex: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, tag: 'span', className: 'italic' },
  { regex: /__(.+?)__/g, tag: 'span', className: 'underline' },
  { regex: /(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, tag: 'span', className: 'italic' },
  { regex: /~~(.+?)~~/g, tag: 'span', className: 'strike' },
  { regex: /==(.+?)==/g, tag: 'span', className: 'mark' },
  { regex: /`([^`\n]+?)`/g, tag: 'span', className: 'code-inline' }
];




function processMarkdownInText(text, parentNode, replaceNode = null) {
  if (!text || !hasMarkdownPattern(text)) return { addedTrailingSpan: false, updateCurrentInlineBlock: () => updateCurrentInlineBlock('default-text') };
  
  // Get current text content while preserving existing styled spans
  const currentSpans = Array.from(parentNode.querySelectorAll('span'));
  const textParts = [];
  const spanData = [];
  
  // Extract text and span information
  for (const span of currentSpans) {
    const spanInfo = {
      element: span,
      text: span.textContent,
      className: span.className,
      start: textParts.join('').length,
      end: textParts.join('').length + span.textContent.length
    };
    textParts.push(span.textContent);
    spanData.push(spanInfo);
  }
  
  const fullText = textParts.join('');
  
  // Find new markdown patterns
  const allMatches = [];
  for (let i = 0; i < stylePatterns.length; i++) {
    const pattern = stylePatterns[i];
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((match = regex.exec(fullText)) !== null) {
      // Check if this match overlaps with existing styled spans (except default-text)
      const overlapsExistingStyle = spanData.some(span => 
        span.className !== 'default-text' &&
        ((match.index < span.end && match.index + match[0].length > span.start))
      );
      
      if (!overlapsExistingStyle) {
        allMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          fullMatch: match[0],
          content: match[1],
          tag: pattern.tag,
          className: pattern.className,
          priority: i
        });
      }
    }
  }

  if (allMatches.length === 0) {
    // No new patterns found, keep existing content
    return { addedTrailingSpan: false };
  }

  // Sort matches by position and priority
  allMatches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.priority - b.priority;
  });

  // Remove overlapping new matches
  const validMatches = [];
  for (const match of allMatches) {
    const hasOverlap = validMatches.some(existing =>
      (match.start < existing.end && match.end > existing.start)
    );
    if (!hasOverlap) {
      validMatches.push(match);
    }
  }

  // Combine existing spans with new matches
  const allElements = [];
  
  // Add existing styled spans (non-default-text)
  spanData.forEach(span => {
    if (span.className !== 'default-text') {
      allElements.push({
        start: span.start,
        end: span.end,
        element: span.element,
        isExisting: true
      });
    }
  });
  
  // Add new matches
  validMatches.forEach(match => {
    allElements.push({
      start: match.start,
      end: match.end,
      match: match,
      isExisting: false
    });
  });
  
  // Sort all elements by position
  allElements.sort((a, b) => a.start - b.start);

  // Build the new DOM structure
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let insertedTrailingSpan = null;

  for (const element of allElements) {
    // Add default text before this element
    if (element.start > lastIndex) {
      const beforeText = fullText.substring(lastIndex, element.start);
      if (beforeText) {
        const defaultSpan = document.createElement('span');
        defaultSpan.className = 'default-text';
        defaultSpan.id = `span_${generateHexID()}`;
        defaultSpan.textContent = beforeText;
        fragment.appendChild(defaultSpan);
        updateCurrentInlineBlock('default-text');
      }
    }

    if (element.isExisting) {
      // Reuse existing styled element
      fragment.appendChild(element.element.cloneNode(true));
      updateCurrentInlineBlock(element.element.className);
    } else {
      // Create new styled element
      const styledSpan = document.createElement(element.match.tag);
      styledSpan.className = element.match.className;
      styledSpan.id = `span_${generateHexID()}`;
      styledSpan.textContent = element.match.content;
      fragment.appendChild(styledSpan);
      updateCurrentInlineBlock(element.match.className);
    }
    
    lastIndex = element.end;
  }

  // Add remaining text
  const remainingText = fullText.substring(lastIndex);
  if (remainingText) {
    const remainingSpan = document.createElement('span');
    remainingSpan.className = 'default-text';
    remainingSpan.id = `span_${generateHexID()}`;
    remainingSpan.textContent = remainingText;
    fragment.appendChild(remainingSpan);
  }

  // Add trailing span
  const trailingSpan = document.createElement('span');
  trailingSpan.className = 'default-text';
  trailingSpan.id = `span_${generateHexID()}`;
  trailingSpan.textContent = '\u00A0  '; 
  fragment.appendChild(trailingSpan);
  insertedTrailingSpan = trailingSpan;
  placeCaretAtEnd(trailingSpan);

  // Replace content
  if (replaceNode) {
    parentNode.insertBefore(fragment, replaceNode);
    parentNode.removeChild(replaceNode);
  } else {
    parentNode.innerHTML = '';
    parentNode.appendChild(fragment);
  }

  // Set cursor position
  if (insertedTrailingSpan?.firstChild?.nodeType === Node.TEXT_NODE) {
    setTimeout(() => {
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(insertedTrailingSpan.firstChild, insertedTrailingSpan.firstChild.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
  }

  return { addedTrailingSpan: true };
}


function processEntireLineContent(node) {
  if (node.querySelector('.default-text-not-editable')) {
    return { addedTrailingSpan: false };
  }
  const lineText = node.textContent;
  if (!lineText) {
    node.innerHTML = '';
    const defaultSpan = document.createElement('span');
    defaultSpan.className = 'default-text';
    defaultSpan.innerHTML = '\u00A0';
    node.appendChild(defaultSpan);
    return { addedTrailingSpan: false };
  }
  // Process inline markdown for table cells and all other nodes
  return processMarkdownInText(lineText, node);
}
