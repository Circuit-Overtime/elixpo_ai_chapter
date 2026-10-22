
editor.addEventListener('input', (e) => {
  const sel = window.getSelection();
  const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const currentLine = getCurrentLineElement();
  currentLineFormat = 
  {
    sel : sel,
    range : range,
    currentLine : currentLine
  }
  console.log("Current line:", currentLine ? currentLine.tagName : "null");



  if (!currentLine || !range) return;

  
  
  if (currentLine.tagName === 'H1' || currentLine.tagName === 'P') {
    removeDefaultTextIfPresent(currentLine);
  }

  if(currentLine.classList.contains('default-text'))
  {
    updateCurrentInlineBlock('default-text');
  }
  
  if (currentLine.tagName === 'H1' || currentLine.tagName === 'H2' || currentLine.tagName === 'H3' || 
      currentLine.tagName === 'H4' || currentLine.tagName === 'H5' || currentLine.tagName === 'H6' || 
      currentLine.tagName === 'P' || currentLine.tagName === 'BLOCKQUOTE' || currentLine.tagName === 'LI') {
    
    const currentNode = range.startContainer;
    
    if (currentNode === currentLine) {
      let targetSpan = currentLine.querySelector('span.default-text');
      if (!targetSpan) {
        targetSpan = document.createElement('span');
        targetSpan.className = 'default-text';
        targetSpan.innerHTML = '\u00A0';
        currentLine.appendChild(targetSpan);
      }
      placeCaretAtEnd(targetSpan);
      return;
    }
    
    if (currentNode.nodeType === Node.TEXT_NODE && currentNode.parentNode === currentLine) {
      const span = document.createElement('span');
      span.className = 'default-text';
      span.id = `span_${generateHexID()}`;
      currentNode.parentNode.insertBefore(span, currentNode);
      span.appendChild(currentNode);
      
      const newRange = document.createRange();
      newRange.setStart(currentNode, range.startOffset);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }

  if (currentLine.tagName === 'P') {
    setTimeout(() => {
      cleanupEmptySpans(currentLine);
    }, 0);
  }

  if (e.inputType === 'insertText' && e.data === ' ') {
    const hasStyledContent = currentLine.querySelector('span[class]:not(.default-text)');
    if (currentLine.tagName === 'P' && !hasStyledContent && handleBlockFormatting(currentLine)) {
      return;
    }
  }

  if (currentLine.tagName === 'H1' || currentLine.tagName === 'H2' || currentLine.tagName === 'H3' || 
      currentLine.tagName === 'H4' || currentLine.tagName === 'H5' || currentLine.tagName === 'H6' || 
      currentLine.tagName === 'P' || currentLine.tagName === 'BLOCKQUOTE' || currentLine.tagName === 'LI') {
    
    if (currentLine.querySelector('.default-text-not-editable')) {
      return;
    }

    let cursorPosition = 0;
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

    const styleResult = processEntireLineContent(currentLine);

    if (styleResult && styleResult.addedTrailingSpan) {
      const spans = currentLine.querySelectorAll('span.default-text');
      const lastDefaultSpan = spans[spans.length - 1];
      if (
        lastDefaultSpan &&
        (
          lastDefaultSpan.innerHTML === ' ' ||
          lastDefaultSpan.textContent === '\u00A0' ||
          lastDefaultSpan.textContent === '\u200B' ||
          lastDefaultSpan.textContent === ''        ||
          lastDefaultSpan.textContent === ' ' ||
          lastDefaultSpan.textContent.trim() === '' 
        )
      ) {
        setTimeout(() => {
          placeCaretAtStart(lastDefaultSpan);
        }, 0);
        return;
      }
    }

    try {
      let currentPos = 0;
      const newWalker = document.createTreeWalker(
        currentLine,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let newNode;
      while ((newNode = newWalker.nextNode())) {
        const nodeLength = newNode.textContent.length;
        if (currentPos + nodeLength >= cursorPosition) {
          const offset = cursorPosition - currentPos;
          const newRange = document.createRange();
          newRange.setStart(newNode, Math.min(offset, nodeLength));
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          return;
        }
        currentPos += nodeLength;
      }
      placeCaretAtEnd(currentLine);
    } catch (err) {
      console.warn("Error restoring cursor position:", err);
      placeCaretAtEnd(currentLine);
    }
  } 
  
  else if (currentLine.tagName === 'PRE') {
    const codeEl = currentLine.querySelector('code');
    if (codeEl) {
      const cursorPos = getCursorPositionInCodeBlock(codeEl);
      updateCodeBlockClasses(codeEl);
      restoreCursorPositionInCodeBlock(codeEl, cursorPos);
    }
  }
});


editor.addEventListener('keydown', (e) => {
  const sel = window.getSelection();
  const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  let currentLine = getCurrentLineElement();

  if (e.ctrlKey && e.key === 'a') {
    if (currentLine) {
      if (currentLine.tagName !== 'P') {
        e.preventDefault();
        const range = document.createRange();
        range.selectNodeContents(currentLine);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }
    return;
  }

  if (e.key === 'Backspace') {
    const selection = sel.toString();
    const selectedRange = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    
    if (selectedRange && !selectedRange.collapsed) {
      const selectedContent = selectedRange.cloneContents();
      const sections = selectedContent.querySelectorAll('section');
      const allSections = editor.querySelectorAll('section');
      
      if (sections.length > 0 || selection.length > 100) {
        const firstSection = allSections[0];
        const firstH1 = firstSection ? firstSection.querySelector('h1') : null;
        
        if (firstH1 && selectedRange.intersectsNode(firstH1)) {
          e.preventDefault();
          
          editor.innerHTML = '';
          const resetSection = createSection();
          editor.appendChild(resetSection);
          placeCaretAtStart(resetSection.querySelector('p'));
          return;
        }
      }
    }

    if (currentLine && currentLine.tagName === 'TD') {
      const cell = currentLine;

      if (
        cell.textContent.trim() === '' ||
        cell.innerHTML.replace(/<br\s*\/?>/gi, '').trim() === ''
      ) {
        e.preventDefault();
        cell.innerHTML = '';
        const defaultSpan = document.createElement('span');
        defaultSpan.className = 'default-text';
        defaultSpan.innerHTML = '\u00A0';
        cell.appendChild(defaultSpan);
        placeCaretAtStart(defaultSpan);
        return;
      }

      if (
        cell.childNodes.length === 1 &&
        cell.firstChild.nodeName === 'BR'
      ) {
        e.preventDefault();
        cell.innerHTML = '';
        const defaultSpan = document.createElement('span');
        defaultSpan.className = 'default-text';
        defaultSpan.innerHTML = '\u00A0';
        cell.appendChild(defaultSpan);
        placeCaretAtStart(defaultSpan);
        return;
      }
    }

    if (currentLine && currentLine.tagName === 'P') {
      const hasContent = currentLine.textContent.trim() !== '' &&
        currentLine.textContent !== '\u00A0' &&
        currentLine.textContent !== '\u200B';

      if (!hasContent) {
        e.preventDefault();
        return;
      }

      setTimeout(() => {
        const spans = currentLine.querySelectorAll('span');
        for (const span of spans) {
          if (span.textContent === '' || span.textContent === '\u200B') {
            span.remove();
          }
        }

        if (!currentLine.querySelector('span')) {
          const defaultSpan = document.createElement('span');
          defaultSpan.className = 'default-text';
          defaultSpan.innerHTML = '\u00A0';
          currentLine.appendChild(defaultSpan);
          placeCaretAtStart(defaultSpan);
        }
      }, 0);

      return;
    }

    if (currentLine && (currentLine.tagName == "H1" || currentLine.tagName === 'H2' || currentLine.tagName === 'H3' || 
    currentLine.tagName === 'H4' || currentLine.tagName === 'H5' || currentLine.tagName === 'H6')) {
      const isEmpty = currentLine.textContent.trim() === '' || currentLine.textContent === '\u00A0';
      
      const section = currentLine.closest('section');
      const allSections = editor.querySelectorAll('section');
      const isFirstSection = allSections[0] === section;
      const isFirstH1 = currentLine.tagName === 'H1' && isFirstSection;
      
      if (isFirstH1) {
        e.preventDefault();
        return;
      }
      
      if (isEmpty) {
        e.preventDefault();
        
        const paragraphs = section.querySelectorAll('p');
        
        currentLine.remove();
        
        if (paragraphs.length > 0) {
          const lastP = paragraphs[paragraphs.length - 1];

          const defaultSpans = lastP.querySelectorAll('span.default-text:not(.default-text-not-editable)');
          
          if (defaultSpans.length > 0) {
            const lastDefaultSpan = defaultSpans[defaultSpans.length - 1];
            placeCaretAtEnd(lastDefaultSpan);
          } else {
            const newSpan = document.createElement('span');
            newSpan.className = 'default-text';
            newSpan.innerHTML = '\u00A0';
            lastP.appendChild(newSpan);
            placeCaretAtEnd(newSpan);
          }
        } else {
          const newP = createParagraph();
          section.appendChild(newP);
          placeCaretAtStart(newP);
        }
        return;
      }
      return;
    }

    if (currentLine && currentLine.tagName === 'LI') {
      const parentList = currentLine.parentElement;
      if (!parentList || (parentList.tagName !== 'UL' && parentList.tagName !== 'OL')) return;

      const isEmpty = currentLine.textContent.trim() === '';
      const isCaretAtStart = sel.isCollapsed && sel.anchorOffset === 0 && 
        (sel.anchorNode === currentLine || sel.anchorNode === currentLine.firstChild);

      if (isEmpty || isCaretAtStart) {
        e.preventDefault();

        const grandParentLi = parentList.parentElement;
        const isNested = grandParentLi && grandParentLi.tagName === 'LI';

        if (isEmpty) {
          const nextLi = currentLine.nextElementSibling;
          const prevLi = currentLine.previousElementSibling;
          
          currentLine.remove();
          
          if (parentList.children.length === 0 && isNested) {
            parentList.remove();
            placeCaretAtEnd(grandParentLi);
          } else if (parentList.children.length === 0) {
            const section = parentList.closest('section');
            const newP = createParagraph();
            parentList.remove();
            section.appendChild(newP);
            placeCaretAtStart(newP);
          } else {
            if (nextLi) {
              placeCaretAtStart(nextLi);
            } else if (prevLi) {
              placeCaretAtEnd(prevLi);
            }
          }
        } else {
          if (isNested) {
            const nextSibling = grandParentLi.nextElementSibling;
            const grandParentList = grandParentLi.parentElement;
            
            currentLine.remove();
            
            if (parentList.children.length === 0) {
              parentList.remove();
            }
            
            if (nextSibling) {
              grandParentList.insertBefore(currentLine, nextSibling);
            } else {
              grandParentList.appendChild(currentLine);
            }
            
            placeCaretAtStart(currentLine);
          } else {
            const section = parentList.closest('section');
            const newP = createParagraph();
            
            if (currentLine.textContent.trim()) {
              newP.textContent = currentLine.textContent;
            }
            
            currentLine.remove();
            
            if (parentList.children.length === 0) {
              parentList.remove();
            }
            
            section.appendChild(newP);
            placeCaretAtStart(newP);
          }
        }
        return;
      }
      return;
    }

    if (currentLine && currentLine.tagName === 'PRE') {
      const codeEl = currentLine.querySelector('code');
      const selectedContent = sel.toString();

      if (codeEl && selectedContent === codeEl.textContent && selectedContent.length > 0) {
        e.preventDefault();
        codeEl.textContent = '';
        placeCaretAtStart(codeEl);
        updateCodeBlockClasses(codeEl);
        return;
      }

      const isCaretAtStart = sel.isCollapsed && sel.anchorOffset === 0 &&
        (sel.anchorNode === codeEl || sel.anchorNode === codeEl.firstChild);
      const isCodeEmpty = codeEl.textContent.trim() === '';

      if (isCaretAtStart && isCodeEmpty) {
        e.preventDefault();
        const section = currentLine.closest('section');
        const newP = createParagraph();
        section.replaceChild(newP, currentLine);
        placeCaretAtStart(newP);
        return;
      }
      return;
    }
  }

  if (currentLine && (currentLine.tagName === 'H1' || currentLine.tagName === 'H2' || 
      currentLine.tagName === 'H3' || currentLine.tagName === 'H4' || currentLine.tagName === 'H5' || 
      currentLine.tagName === 'H6' || currentLine.tagName === 'P' || currentLine.tagName === 'BLOCKQUOTE') &&
      (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace')) {
    removeDefaultTextIfPresent(currentLine);
  }

  if (currentLine && currentLine.tagName === 'P' && e.key.length === 1) {
    const currentNode = range.startContainer;

    if (currentNode === currentLine) {
      let targetSpan = currentLine.querySelector('span.default-text');
      if (!targetSpan) {
        targetSpan = document.createElement('span');
        targetSpan.className = 'default-text';
        currentLine.appendChild(targetSpan);
      }
      placeCaretAtStart(targetSpan);
      return;
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    enterPressCount++;
    console.log(currentLine.tagName)
    if(currentLine && (currentLine.tagName === 'TR' || currentLine.tagName === "TD")) {
      return;
    }

    if (!currentLine) {
      const newSection = createSection();
      editor.appendChild(newSection);
      placeCaretAtStart(newSection.querySelector('p'));
      return;
    }


    if (currentLine.tagName === 'H1' || currentLine.tagName === 'H2' || currentLine.tagName === 'H3' || currentLine.tagName === 'H4' || currentLine.tagName === 'H5' || currentLine.tagName === 'H6') {
      const section = currentLine.parentNode;
      const newP = createParagraph();
      section.appendChild(newP);
      placeCaretAtStart(newP);
      return;
    }

    if (currentLine.tagName === 'P') {
      const section = currentLine.parentNode;
      const newP = createParagraph();

      const remainingContents = range.extractContents();
      if (remainingContents.hasChildNodes()) {
        newP.innerHTML = '';
        newP.appendChild(remainingContents);
      }

      section.insertBefore(newP, currentLine.nextSibling);
      placeCaretAtStart(newP);
      return;
    }

    if (currentLine.tagName === 'LI') {
      const parentList = currentLine.parentNode;
      const isCaretAtStart = range.startOffset === 0 && 
        (range.startContainer === currentLine || range.startContainer === currentLine.firstChild);
      const isLiEmpty = currentLine.textContent.trim() === '';

      if (isLiEmpty) {
        const section = parentList.closest('section');
        const newP = createParagraph();
        
        currentLine.remove();
        
        const grandParentLi = parentList.parentElement;
        const isNested = grandParentLi && grandParentLi.tagName === 'LI';
        
        if (parentList.children.length === 0) {
          if (isNested) {
            parentList.remove();
            const grandParentList = grandParentLi.parentElement;
            const nextSibling = grandParentLi.nextElementSibling;
            if (nextSibling) {
              grandParentList.insertBefore(newP, nextSibling);
            } else {
              section.appendChild(newP);
            }
          } else {
            parentList.remove();
            section.appendChild(newP);
          }
        } else {
          if (isNested) {
            const grandParentList = grandParentLi.parentElement;
            const nextSibling = grandParentLi.nextElementSibling;
            if (nextSibling) {
              grandParentList.insertBefore(newP, nextSibling);
            } else {
              section.appendChild(newP);
            }
          } else {
            const nextSibling = parentList.nextElementSibling;
            if (nextSibling) {
              section.insertBefore(newP, nextSibling);
            } else {
              section.appendChild(newP);
            }
          }
        }
        
        placeCaretAtStart(newP);
        enterPressCount = 0;
      } else {
        if (enterPressCount >= 2 && isCaretAtStart) {
          const section = parentList.closest('section');
          const newP = createParagraph();
          
          if (currentLine.innerHTML) {
            newP.innerHTML = currentLine.innerHTML;
          }
          
          currentLine.remove();
          
          const grandParentLi = parentList.parentElement;
          const isNested = grandParentLi && grandParentLi.tagName === 'LI';
          
          if (parentList.children.length === 0) {
            if (isNested) {
              parentList.remove();
              const grandParentList = grandParentLi.parentElement;
              const nextSibling = grandParentList.nextElementSibling;
              if (nextSibling) {
                grandParentList.insertBefore(newP, nextSibling);
              } else {
                section.appendChild(newP);
              }
            } else {
              parentList.remove();
              section.appendChild(newP);
            }
          } else {
            if (isNested) {
              const grandParentList = grandParentLi.parentElement;
              const nextSibling = grandParentLi.nextElementSibling;
              if (nextSibling) {
                grandParentList.insertBefore(newP, nextSibling);
              } else {
                section.appendChild(newP);
              }
            } else {
              const nextSibling = parentList.nextElementSibling;
              if (nextSibling) {
                section.insertBefore(newP, nextSibling);
              } else {
                section.appendChild(newP);
              }
            }
          }
          
          placeCaretAtStart(newP);
          enterPressCount = 0;
        } else {
          const newLi = document.createElement('li');
          newLi.id = `li_${generateHexID()}`;
          
          const remainingContents = range.extractContents();
          if (remainingContents.hasChildNodes()) {
            newLi.appendChild(remainingContents);
          } else {
            const defaultSpan = document.createElement('span');
            defaultSpan.className = 'default-text';
            defaultSpan.innerHTML = '\u00A0';
            newLi.appendChild(defaultSpan);
          }
          
          parentList.insertBefore(newLi, currentLine.nextSibling);
          placeCaretAtStart(newLi);
          enterPressCount = 0;
        }
      }
    } 
    
    else if (currentLine.tagName === 'PRE') {
      const codeEl = currentLine.querySelector('code');
      if (codeEl) {
        if (e.shiftKey) {
          e.preventDefault();
          const range = sel.getRangeAt(0);

          const cursorPos = getCursorPositionInCodeBlock(codeEl);

          const textNode = document.createTextNode('\n');
          range.insertNode(textNode);

          updateCodeBlockClasses(codeEl);

          restoreCursorPositionInCodeBlock(codeEl, cursorPos + 1);
        } else {
          e.preventDefault();
          if (codeEl.textContent.trim() === '') {
            const section = currentLine.closest('section');
            const newP = createParagraph();
            section.replaceChild(newP, currentLine);
            placeCaretAtStart(newP);
          } else {
            const section = currentLine.closest('section');
            const newP = createParagraph();
            section.appendChild(newP);
            placeCaretAtStart(newP);
          }
        }
      }
    } 
    
    else {
      const section = currentLine.closest('section');
      if (section) {
        const newP = createParagraph();
        section.appendChild(newP);
        placeCaretAtStart(newP);
      }
      enterPressCount = 0;
    }
  }

  else if (e.key === 'Tab') {
    e.preventDefault();
    console.log(currentLine.tagName)
  
    if (currentLine && currentLine.tagName === 'LI') {
      const parentList = currentLine.parentNode;
      const previousSibling = currentLine.previousElementSibling;

      if (previousSibling && previousSibling.tagName === 'LI') {
        let nestedList;
        if (previousSibling.lastElementChild && (previousSibling.lastElementChild.tagName === 'UL' || previousSibling.lastElementChild.tagName === 'OL')) {
          nestedList = previousSibling.lastElementChild;
        } else {
          nestedList = document.createElement(parentList.tagName);
          previousSibling.appendChild(nestedList);
        }
        nestedList.appendChild(currentLine);
        placeCaretAtEnd(currentLine);
      }
    } 
    
    else if (currentLine && currentLine.tagName === 'PRE') {
      const textNode = document.createTextNode('  ');
      range.insertNode(textNode);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      highlightCodeBlock(currentLine.querySelector('code'));
    } 
    
    else if (currentLine && (currentLine.tagName === 'H1' || currentLine.tagName === 'P')) {
      const spaceNode = document.createTextNode('  ');
      range.insertNode(spaceNode);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } 
    
    else {
      const spaceNode = document.createTextNode('  ');
      range.insertNode(spaceNode);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } 
  
  else {
    enterPressCount = 0;
  }
});

editor.addEventListener('click', (e) => {
  const clickedElement = e.target;

  if (clickedElement.tagName === 'PRE' || clickedElement.tagName === 'CODE') {
    const codeEl = clickedElement.tagName === 'CODE' ? clickedElement : clickedElement.querySelector('code');
    if (codeEl) {
      setTimeout(() => {
        codeEl.focus();
        if (codeEl.textContent === '') {
          placeCaretAtStart(codeEl);
        }
      }, 0);
    }
  }
});



 document.addEventListener('selectionchange', handleSelectionChange);


 




 