import type { UIEvent, WheelEvent } from "react";

function getHorizontalScrollMax(element: HTMLElement) {
  return Math.max(0, element.scrollWidth - element.clientWidth);
}

export function clampHorizontalScroll(element: HTMLElement) {
  const max = getHorizontalScrollMax(element);

  if (element.scrollLeft < 0) {
    element.scrollLeft = 0;
    return;
  }

  if (element.scrollLeft > max) {
    element.scrollLeft = max;
  }
}

export function handleHorizontalScrollBoundary(event: UIEvent<HTMLElement>) {
  clampHorizontalScroll(event.currentTarget);
}

export function handleHorizontalWheelBoundary(event: WheelEvent<HTMLElement>) {
  const element = event.currentTarget;
  const max = getHorizontalScrollMax(element);

  if (max <= 0) {
    element.scrollLeft = 0;
    return;
  }

  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
    return;
  }

  const next = element.scrollLeft + event.deltaX;

  if (next < 0 || next > max) {
    element.scrollLeft = Math.min(max, Math.max(0, next));
  }
}
