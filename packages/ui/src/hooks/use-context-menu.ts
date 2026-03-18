import type React from "react";
import { useCallback, useState } from "react";

export interface ContextMenuState {
  screenX: number;
  screenY: number;
  flowX: number;
  flowY: number;
  nodeId?: string;
}

export function useContextMenu(
  isEditing: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      if (!isEditing) return;
      event.preventDefault();
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setContextMenu({
        screenX:
          (event as MouseEvent).clientX ?? (event as React.MouseEvent).clientX,
        screenY:
          (event as MouseEvent).clientY ?? (event as React.MouseEvent).clientY,
        flowX: (event as React.MouseEvent).clientX - bounds.left,
        flowY: (event as React.MouseEvent).clientY - bounds.top,
      });
    },
    [isEditing, containerRef],
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: { id: string }) => {
      if (!isEditing) return;
      event.preventDefault();
      setContextMenu({
        screenX: event.clientX,
        screenY: event.clientY,
        flowX: event.clientX,
        flowY: event.clientY,
        nodeId: node.id,
      });
    },
    [isEditing],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return {
    contextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    closeContextMenu,
  };
}
