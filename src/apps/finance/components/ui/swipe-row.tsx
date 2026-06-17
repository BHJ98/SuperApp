
import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";

interface SwipeRowProps {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

const THRESHOLD = 60;

export function SwipeRow({ children, onEdit, onDelete, className }: SwipeRowProps) {
  const startXRef = React.useRef(0);
  const currentXRef = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [offset, setOffset] = React.useState(0);
  const [swiping, setSwiping] = React.useState(false);

  function handleTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = 0;
    setSwiping(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!swiping) return;
    const diff = e.touches[0].clientX - startXRef.current;
    currentXRef.current = diff;
    // Limit swipe range and apply resistance
    const maxOffset = 80;
    const clamped = Math.max(-maxOffset, Math.min(maxOffset, diff));
    setOffset(clamped);
  }

  function handleTouchEnd() {
    setSwiping(false);
    const diff = currentXRef.current;
    if (diff > THRESHOLD && onEdit) {
      onEdit();
    } else if (diff < -THRESHOLD && onDelete) {
      onDelete();
    }
    setOffset(0);
  }

  return (
    <div className={`relative overflow-hidden ${className || ""}`}>
      {/* Left reveal: edit (swipe right) */}
      {onEdit && (
        <div className="absolute inset-y-0 left-0 w-20 flex items-center justify-center bg-primary">
          <Pencil className="h-5 w-5 text-primary-foreground" />
        </div>
      )}
      {/* Right reveal: delete (swipe left) */}
      {onDelete && (
        <div className="absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-destructive">
          <Trash2 className="h-5 w-5 text-destructive-foreground" />
        </div>
      )}
      {/* Content */}
      <div
        ref={containerRef}
        className="relative bg-background transition-transform"
        style={{
          transform: `translateX(${offset}px)`,
          transitionDuration: swiping ? "0ms" : "200ms",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
