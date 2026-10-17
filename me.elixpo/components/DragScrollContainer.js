"use client";
import { useRef, useState } from "react";

export default function DragScrollContainer({ className, children }) {
  const ref = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const onMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.pageX - ref.current.offsetLeft);
    setScrollLeft(ref.current.scrollLeft);
  };

  const onMouseUp = () => setIsDragging(false);
  const onMouseLeave = () => setIsDragging(false);

  const onMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    ref.current.scrollLeft = scrollLeft - (x - startX);
  };

  return (
    <section
      ref={ref}
      className={className}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
    >
      {children}
    </section>
  );
}
