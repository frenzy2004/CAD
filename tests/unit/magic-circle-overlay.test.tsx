import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MagicCircleOverlay } from "@/components/cad/MagicCircleOverlay";

describe("MagicCircleOverlay pointer lifecycle", () => {
  it("cancels drawing and restores controls when pointer capture is lost", () => {
    const onDrawingChange = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <MagicCircleOverlay
        onDrawingChange={onDrawingChange}
        onSelect={onSelect}
        projectedAnchors={[]}
        statusText="Draw a circle"
      >
        <div>viewport</div>
      </MagicCircleOverlay>,
    );
    const surface = container.firstElementChild as HTMLDivElement;

    Object.defineProperties(surface, {
      getBoundingClientRect: {
        configurable: true,
        value: () => DOMRect.fromRect({ x: 10, y: 20, width: 400, height: 300 }),
      },
      hasPointerCapture: {
        configurable: true,
        value: vi.fn(() => true),
      },
      releasePointerCapture: {
        configurable: true,
        value: vi.fn(),
      },
      setPointerCapture: {
        configurable: true,
        value: vi.fn(),
      },
    });

    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 40,
      clientY: 70,
      isPrimary: true,
      pointerId: 17,
    });

    expect(onDrawingChange).toHaveBeenLastCalledWith(true);
    expect(container.querySelector("circle")).not.toBeNull();

    fireEvent.lostPointerCapture(surface, {
      isPrimary: true,
      pointerId: 17,
    });

    expect(onDrawingChange).toHaveBeenLastCalledWith(false);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(container.querySelector("circle")).toBeNull();
  });

  it("keeps a completed selection when intentional release reports capture loss", () => {
    const selectedAnchor = {
      featureId: "hole:nw",
      screenPoint: { x: 30, y: 50 },
      pointMm: { x: 12, y: 52, z: 8 },
      diameterMm: 6,
    };
    const onDrawingChange = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <MagicCircleOverlay
        onDrawingChange={onDrawingChange}
        onSelect={onSelect}
        projectedAnchors={[selectedAnchor]}
        statusText="Draw a circle"
      >
        <div>viewport</div>
      </MagicCircleOverlay>,
    );
    const surface = container.firstElementChild as HTMLDivElement;

    Object.defineProperties(surface, {
      getBoundingClientRect: {
        configurable: true,
        value: () => DOMRect.fromRect({ x: 10, y: 20, width: 400, height: 300 }),
      },
      hasPointerCapture: {
        configurable: true,
        value: vi.fn(() => true),
      },
      releasePointerCapture: {
        configurable: true,
        value: vi.fn(),
      },
      setPointerCapture: {
        configurable: true,
        value: vi.fn(),
      },
    });

    fireEvent.pointerDown(surface, {
      button: 0,
      clientX: 40,
      clientY: 70,
      isPrimary: true,
      pointerId: 23,
    });
    fireEvent.pointerUp(surface, {
      button: 0,
      clientX: 40,
      clientY: 70,
      isPrimary: true,
      pointerId: 23,
    });
    fireEvent.lostPointerCapture(surface, {
      isPrimary: true,
      pointerId: 23,
    });

    expect(onDrawingChange).toHaveBeenLastCalledWith(false);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith(selectedAnchor);
    expect(container.querySelector("circle")).not.toBeNull();
  });
});
