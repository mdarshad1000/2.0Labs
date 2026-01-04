
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { GraphProject, GraphNode as NodeType, Document } from '../../types';
import GraphSearchBar from './GraphSearchBar';
import GraphNode, { EdgeDirection, ResizeHandle } from './GraphNode';
import { graphApi } from '../../services/graphApi';
import { Combine, X, ArrowRight, Plus, Minus, Search, Expand, Maximize } from 'lucide-react';
import { motion, AnimatePresence, animate } from 'framer-motion';

interface GraphCanvasProps {
  project: GraphProject;
  onUpdateProject: (updates: Partial<GraphProject>) => void;
}

interface EdgeDragState {
  sourceNodeId: string;
  sourceDirection: EdgeDirection;
  startPoint: { x: number; y: number };
  currentPoint: { x: number; y: number };
}

interface NewNodeState {
  position: { x: number; y: number }; // Canvas coords for node creation & display
  startPoint: { x: number; y: number }; // Canvas coords of parent's + button
  sourceNodeId: string;
  sourceDirection: EdgeDirection;
  context?: string;
}

interface ResizeState {
  nodeId: string;
  handle: ResizeHandle;
  startMousePos: { x: number; y: number };
  startNodePos: { x: number; y: number };
  startNodeSize: { width: number; height: number };
}

const GraphCanvas: React.FC<GraphCanvasProps> = ({ project, onUpdateProject }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(0.65);
  const [isPanning, setIsPanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  // Hide search bar if nodes already exist (from previous query) or after first query in session
  const [hasGeneratedNodes, setHasGeneratedNodes] = useState(project.nodes.length > 0);

  // Node dragging state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  // New node input dragging state
  const [isNewNodeDragging, setIsNewNodeDragging] = useState(false);
  const [newNodeDragOffset, setNewNodeDragOffset] = useState({ x: 0, y: 0 });

  // Edge dragging state
  const [edgeDrag, setEdgeDrag] = useState<EdgeDragState | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Node resize state
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  // Marquee selection state (drag-to-select on blank canvas)
  const [selectionBox, setSelectionBox] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);

  // New node state (when dropped on empty space)
  const [newNodeState, setNewNodeState] = useState<NewNodeState | null>(null);
  const [newNodeQuery, setNewNodeQuery] = useState('');
  const newNodeInputRef = useRef<HTMLInputElement>(null);
  const searchBarRef = useRef<HTMLDivElement>(null);

  // Search to node animation state
  const [animatingQuery, setAnimatingQuery] = useState<{
    text: string;
    startRect: DOMRect;
    targetPos: { x: number; y: number };
  } | null>(null);

  // Focus request state (handled by effect after render/measure)
  const [requestedFocusNodeId, setRequestedFocusNodeId] = useState<string | null>(null);

  // Node DOM refs and measured boxes (in canvas coordinates)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [nodeBoxes, setNodeBoxes] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});

  const setNodeRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    nodeRefs.current[id] = el;
  }, []);

  // Measure node boxes in canvas coordinates
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};

    project.nodes.forEach(node => {
      const el = nodeRefs.current[node.id];
      if (el) {
        const r = el.getBoundingClientRect();
        boxes[node.id] = {
          x: (r.left - containerRect.left - offset.x) / scale,
          y: (r.top - containerRect.top - offset.y) / scale,
          width: r.width / scale,
          height: r.height / scale
        };
      }
    });

    setNodeBoxes(boxes);
  }, [project.nodes, offset.x, offset.y, scale, dragPosition]);

  // Focus on a specific node with animation
  const focusOnNode = useCallback((nodeId: string, customScale?: number) => {
    const container = containerRef.current;
    const node = project.nodes.find(n => n.id === nodeId);
    if (!container || !node) return;

    const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
    const targetScale = customScale || Math.max(scale, 0.85); // Focus zoom level

    // Node dimensions (approximate if not yet measured)
    const box = nodeBoxes[nodeId];
    const nodeWidth = box?.width || 300;
    const nodeHeight = box?.height || 200;

    // Calculate target offset to center the node
    // Formula: (containerWidth / 2) - (nodeCenterX * scale) = offset.x
    const targetOffsetX = (containerWidth / 2) - (node.position.x + nodeWidth / 2) * targetScale;
    const targetOffsetY = (containerHeight / 2) - (node.position.y + nodeHeight / 2) * targetScale;

    // Animate scale and offset
    animate(scale, targetScale, {
      type: "spring",
      stiffness: 80,
      damping: 18,
      onUpdate: (latest) => setScale(latest)
    });

    animate(offset.x, targetOffsetX, {
      type: "spring",
      stiffness: 80,
      damping: 18,
      onUpdate: (latest) => setOffset(prev => ({ ...prev, x: latest }))
    });

    animate(offset.y, targetOffsetY, {
      type: "spring",
      stiffness: 80,
      damping: 18,
      onUpdate: (latest) => setOffset(prev => ({ ...prev, y: latest }))
    });
  }, [project.nodes, scale, offset, nodeBoxes]);

  // Effect to handle focus requests once node is measured
  useEffect(() => {
    if (requestedFocusNodeId) {
      const node = project.nodes.find(n => n.id === requestedFocusNodeId);
      const box = nodeBoxes[requestedFocusNodeId];

      // We need the node to exist and its dimensions to be measured for accurate focusing
      if (node && box) {
        focusOnNode(requestedFocusNodeId);
        setRequestedFocusNodeId(null);
      }
    }
  }, [requestedFocusNodeId, project.nodes, nodeBoxes, focusOnNode]);

  // Focus on single selection
  useEffect(() => {
    if (selectedNodes.length === 1) {
      setRequestedFocusNodeId(selectedNodes[0]);
    }
  }, [selectedNodes]);

  // Get connection point position based on direction
  const getConnectionPoint = useCallback((node: NodeType, direction: EdgeDirection) => {
    // Get position - check if this node is being dragged
    const pos = (node.id === draggedNodeId && dragPosition) ? dragPosition : node.position;

    // Use node's stored dimensions, or fall back to DOM measurement, or defaults
    const nodeEl = nodeRefs.current[node.id];
    const nodeWidth = node.width || (nodeEl?.offsetWidth || 300);
    const nodeHeight = node.height || (nodeEl?.offsetHeight || (180 + node.content.length * 20));

    switch (direction) {
      case 'top': return { x: pos.x + nodeWidth / 2, y: pos.y };
      case 'bottom': return { x: pos.x + nodeWidth / 2, y: pos.y + nodeHeight };
      case 'left': return { x: pos.x, y: pos.y + nodeHeight / 2 };
      case 'right': return { x: pos.x + nodeWidth, y: pos.y + nodeHeight / 2 };
    }
  }, [draggedNodeId, dragPosition]);

  const checkCollisions = useCallback((x: number, y: number, width: number, height: number, padding: number = 40) => {
    const rect1 = {
      left: x - padding,
      top: y - padding,
      right: x + width + padding,
      bottom: y + height + padding
    };

    return Object.values(nodeBoxes).some(box => {
      const rect2 = {
        left: box.x,
        top: box.y,
        right: box.x + box.width,
        bottom: box.y + box.height
      };

      return !(rect1.right < rect2.left ||
        rect1.left > rect2.right ||
        rect1.bottom < rect2.top ||
        rect1.top > rect2.bottom);
    });
  }, [nodeBoxes]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Ignore clicks on UI elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return;
    }

    if (draggedNodeId || edgeDrag) return;

    // Start marquee selection on blank canvas (normal click)
    // Hold Space + drag for panning instead
    if (e.button === 0) {
      const { x: canvasX, y: canvasY } = viewportToCanvas(e.clientX, e.clientY);
      setSelectionBox({
        start: { x: canvasX, y: canvasY },
        current: { x: canvasX, y: canvasY }
      });
    }
  };

  // Helper to convert viewport coordinates to canvas coordinates
  // Transform is: translate(offset.x, offset.y) scale(scale)
  // Applied right-to-left: first scale, then translate
  // So: screenPos = canvasPos * scale + offset + containerPos
  // Inverse: canvasPos = (screenPos - containerPos - offset) / scale
  const getAdaptivePosition = useCallback((sourceNode: NodeType, proposedWidth: number = 300, proposedHeight: number = 200, gap: number = 100) => {
    const nodeWidth = sourceNode.width || 300;
    const rightX = sourceNode.position.x + nodeWidth + gap;
    const leftX = sourceNode.position.x - proposedWidth - gap;
    const posY = sourceNode.position.y;

    const rightBlocked = checkCollisions(rightX, posY, proposedWidth, proposedHeight);
    const leftBlocked = checkCollisions(leftX, posY, proposedWidth, proposedHeight);

    // If right is blocked but left is free, use left
    if (rightBlocked && !leftBlocked) {
      return { position: { x: leftX, y: posY }, direction: 'left' as EdgeDirection };
    }
    // Default to right
    return { position: { x: rightX, y: posY }, direction: 'right' as EdgeDirection };
  }, [checkCollisions]);
  const viewportToCanvas = (clientX: number, clientY: number): { x: number; y: number } => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();

    // Position relative to container
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    // Inverse transform: subtract offset, then divide by scale
    const canvasX = (relX - offset.x) / scale;
    const canvasY = (relY - offset.y) / scale;

    return { x: canvasX, y: canvasY };
  };

  const getNodePosition = (node: NodeType) => {
    if (node.id === draggedNodeId && dragPosition) {
      return dragPosition;
    }
    return node.position;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Handle edge dragging
    if (edgeDrag) {
      const { x: canvasX, y: canvasY } = viewportToCanvas(e.clientX, e.clientY);
      setEdgeDrag(prev => prev ? { ...prev, currentPoint: { x: canvasX, y: canvasY } } : null);

      // Check if hovering over a node
      const fallbackWidth = 300;
      const fallbackHeight = 200;
      let foundNode: string | null = null;

      for (const node of project.nodes) {
        if (node.id === edgeDrag.sourceNodeId) continue;
        const box = nodeBoxes[node.id];
        const pos = box
          ? { x: box.x, y: box.y, width: box.width, height: box.height }
          : { x: getNodePosition(node).x, y: getNodePosition(node).y, width: fallbackWidth, height: fallbackHeight };

        if (canvasX >= pos.x && canvasX <= pos.x + pos.width &&
          canvasY >= pos.y && canvasY <= pos.y + pos.height) {
          foundNode = node.id;
          break;
        }
      }
      setHoveredNodeId(foundNode);
      return;
    }

    // Handle node resizing
    if (resizeState) {
      const { x: canvasX, y: canvasY } = viewportToCanvas(e.clientX, e.clientY);
      const deltaX = canvasX - resizeState.startMousePos.x;
      const deltaY = canvasY - resizeState.startMousePos.y;

      const { handle, startNodePos, startNodeSize } = resizeState;

      // Get the actual content dimensions from the DOM to prevent clipping
      const nodeEl = nodeRefs.current[resizeState.nodeId];
      let minWidth = 200; // Fallback
      let minHeight = 150; // Fallback

      if (nodeEl) {
        // Find the content container inside the node
        const contentContainer = nodeEl.querySelector('.rounded-none');
        if (contentContainer) {
          // Calculate minHeight by summing the natural heights of all children
          // This allows the node to shrink until it just fits the content
          const children = Array.from(contentContainer.children) as HTMLElement[];
          const totalContentHeight = children.reduce((acc, child) => acc + child.scrollHeight, 0);

          // Use absolute minimums or content-required minimums
          minHeight = Math.max(150, totalContentHeight + 4); // +4 for borders/padding
          minWidth = 200; // Allow shrinking width back to original minimum
        }
      }

      let newWidth = startNodeSize.width;
      let newHeight = startNodeSize.height;
      let newX = startNodePos.x;
      let newY = startNodePos.y;

      // Calculate new dimensions based on which handle is being dragged
      switch (handle) {
        case 'e':
          newWidth = Math.max(minWidth, startNodeSize.width + deltaX);
          break;
        case 'w':
          newWidth = Math.max(minWidth, startNodeSize.width - deltaX);
          if (newWidth > minWidth) newX = startNodePos.x + deltaX;
          break;
        case 's':
          newHeight = Math.max(minHeight, startNodeSize.height + deltaY);
          break;
        case 'n':
          newHeight = Math.max(minHeight, startNodeSize.height - deltaY);
          if (newHeight > minHeight) newY = startNodePos.y + deltaY;
          break;
        case 'se':
          newWidth = Math.max(minWidth, startNodeSize.width + deltaX);
          newHeight = Math.max(minHeight, startNodeSize.height + deltaY);
          break;
        case 'sw':
          newWidth = Math.max(minWidth, startNodeSize.width - deltaX);
          newHeight = Math.max(minHeight, startNodeSize.height + deltaY);
          if (newWidth > minWidth) newX = startNodePos.x + deltaX;
          break;
        case 'ne':
          newWidth = Math.max(minWidth, startNodeSize.width + deltaX);
          newHeight = Math.max(minHeight, startNodeSize.height - deltaY);
          if (newHeight > minHeight) newY = startNodePos.y + deltaY;
          break;
        case 'nw':
          newWidth = Math.max(minWidth, startNodeSize.width - deltaX);
          newHeight = Math.max(minHeight, startNodeSize.height - deltaY);
          if (newWidth > minWidth) newX = startNodePos.x + deltaX;
          if (newHeight > minHeight) newY = startNodePos.y + deltaY;
          break;
      }

      // Update node in real-time during resize
      const updatedNodes = project.nodes.map(n =>
        n.id === resizeState.nodeId
          ? { ...n, position: { x: newX, y: newY }, width: newWidth, height: newHeight }
          : n
      );
      onUpdateProject({ nodes: updatedNodes });
      return;
    }

    // Handle node dragging
    if (draggedNodeId) {
      const { x: canvasX, y: canvasY } = viewportToCanvas(e.clientX, e.clientY);
      setDragPosition({ x: canvasX - dragOffset.x, y: canvasY - dragOffset.y });
      return;
    }

    // Handle new node input dragging
    if (isNewNodeDragging && newNodeState) {
      const { x: canvasX, y: canvasY } = viewportToCanvas(e.clientX, e.clientY);
      setNewNodeState(prev => prev ? {
        ...prev,
        position: { x: canvasX - newNodeDragOffset.x, y: canvasY - newNodeDragOffset.y }
      } : null);
      return;
    }

    // Handle marquee selection
    if (selectionBox) {
      const { x: canvasX, y: canvasY } = viewportToCanvas(e.clientX, e.clientY);
      setSelectionBox(prev => prev ? {
        ...prev,
        current: { x: canvasX, y: canvasY }
      } : null);
      return;
    }

    // Handle panning
    if (isPanning) {
      setOffset(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    // Handle edge drag end
    if (edgeDrag) {
      const sourceNode = project.nodes.find(n => n.id === edgeDrag.sourceNodeId);

      if (hoveredNodeId && sourceNode) {
        // Dropped on another node - create an actual merge node on the canvas
        const targetNode = project.nodes.find(n => n.id === hoveredNodeId);
        if (targetNode) {
          // Calculate dimensions for accurate placement
          const getDims = (node: NodeType) => {
            const box = nodeBoxes[node.id];
            if (box) return { w: box.width, h: box.height };
            const nodeEl = nodeRefs.current[node.id];
            return {
              w: node.width || (nodeEl?.offsetWidth || 300),
              h: node.height || (nodeEl?.offsetHeight || 200)
            };
          };

          const sDims = getDims(sourceNode);
          const tDims = getDims(targetNode);

          // Position based on interaction direction to prevent overlap
          let mergeX = (sourceNode.position.x + targetNode.position.x) / 2;
          let mergeY = (sourceNode.position.y + targetNode.position.y) / 2;

          const offset = 400; // Consistent margin to prevent overlap

          switch (edgeDrag.sourceDirection) {
            case 'bottom':
              mergeY = Math.max(sourceNode.position.y + sDims.h, targetNode.position.y + tDims.h) + offset;
              break;
            case 'top':
              mergeY = Math.min(sourceNode.position.y, targetNode.position.y) - offset - 400; // Extra room for modal height
              break;
            case 'right':
              mergeX = Math.max(sourceNode.position.x + sDims.w, targetNode.position.x + tDims.w) + offset;
              break;
            case 'left':
              mergeX = Math.min(sourceNode.position.x, targetNode.position.x) - offset - 300; // Extra room for modal width
              break;
          }

          // Create the merge node with pendingMerge data
          const mergeNodeId = Math.random().toString(36).substr(2, 9);
          const mergeNode: NodeType = {
            id: mergeNodeId,
            title: 'Merge Node',
            content: '',
            color: 'orange',
            position: { x: mergeX, y: mergeY },
            connectedTo: [],
            pendingMerge: {
              sourceNodeIds: [sourceNode.id, targetNode.id],
              suggestions: [],
              isLoadingSuggestions: true
            }
          };

          // Connect BOTH parent nodes to this new merge node
          const updatedNodes = project.nodes.map(n => {
            if (n.id === sourceNode.id || n.id === targetNode.id) {
              return { ...n, connectedTo: [...n.connectedTo, mergeNodeId] };
            }
            return n;
          });

          const newNodes = [...updatedNodes, mergeNode];
          currentNodesRef.current = newNodes;
          onUpdateProject({ nodes: newNodes });

          // Focus on the intermediate merge node
          setRequestedFocusNodeId(mergeNodeId);

          // Generate merge suggestions asynchronously
          generateMergeSuggestions([sourceNode, targetNode]).then(suggestions => {
            // Update the merge node with suggestions
            const finalNodes = currentNodesRef.current.map(n =>
              n.id === mergeNodeId
                ? { ...n, pendingMerge: { ...n.pendingMerge!, suggestions, isLoadingSuggestions: false } }
                : n
            );
            currentNodesRef.current = finalNodes;
            onUpdateProject({ nodes: finalNodes });
          }).catch(err => {
            console.error('Error generating suggestions:', err);
            // Fallback suggestions
            const fallbackNodes = currentNodesRef.current.map(n =>
              n.id === mergeNodeId
                ? { ...n, pendingMerge: { ...n.pendingMerge!, suggestions: ['Synthesize these insights', 'Compare perspectives', 'Find connections'], isLoadingSuggestions: false } }
                : n
            );
            currentNodesRef.current = fallbackNodes;
            onUpdateProject({ nodes: fallbackNodes });
          });
        }
      } else if (sourceNode) {
        // Dropped on empty space - create new node input
        const { x: canvasX, y: canvasY } = viewportToCanvas(e.clientX, e.clientY);
        setNewNodeState({
          position: { x: canvasX - 150, y: canvasY - 50 },
          startPoint: edgeDrag.startPoint,
          sourceNodeId: edgeDrag.sourceNodeId,
          sourceDirection: edgeDrag.sourceDirection
        });
        setTimeout(() => newNodeInputRef.current?.focus(), 100);
      }

      setEdgeDrag(null);
      setHoveredNodeId(null);
      return;
    }

    // Handle node drag end
    if (draggedNodeId && dragPosition) {
      onUpdateProject({
        nodes: project.nodes.map(n =>
          n.id === draggedNodeId ? { ...n, position: dragPosition } : n
        )
      });
    }

    // Handle resize end
    if (resizeState) {
      setResizeState(null);
    }

    // Handle marquee selection end - select nodes within the box
    if (selectionBox) {
      const minX = Math.min(selectionBox.start.x, selectionBox.current.x);
      const maxX = Math.max(selectionBox.start.x, selectionBox.current.x);
      const minY = Math.min(selectionBox.start.y, selectionBox.current.y);
      const maxY = Math.max(selectionBox.start.y, selectionBox.current.y);

      // Only select if the box has some size (not just a click)
      if (maxX - minX > 5 || maxY - minY > 5) {
        const nodesInBox = project.nodes.filter(node => {
          const box = nodeBoxes[node.id];
          if (!box) return false;

          // Check if node intersects with selection box
          const nodeRight = box.x + box.width;
          const nodeBottom = box.y + box.height;

          return box.x < maxX && nodeRight > minX &&
            box.y < maxY && nodeBottom > minY;
        });

        if (nodesInBox.length > 0) {
          // If shift is held, add to existing selection, otherwise replace
          if (e.shiftKey) {
            setSelectedNodes(prev => {
              const newSelection = new Set(prev);
              nodesInBox.forEach(n => newSelection.add(n.id));
              return Array.from(newSelection);
            });
          } else {
            setSelectedNodes(nodesInBox.map(n => n.id));
          }
        } else if (!e.shiftKey) {
          // Clicked on empty space without shift - clear selection
          setSelectedNodes([]);
        }
      } else if (!e.shiftKey) {
        // Just a click (no drag) - clear selection
        setSelectedNodes([]);
      }

      setSelectionBox(null);
    }

    setIsPanning(false);
    setDraggedNodeId(null);
    setDragPosition(null);
    setIsNewNodeDragging(false);
  };

  // Zoom controls (center-based)
  const zoomIn = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();

    // Zoom toward center
    const centerX = width / 2;
    const centerY = height / 2;

    const newScale = Math.min(scale + 0.15, 3);
    if (newScale !== scale) {
      setOffset({
        x: centerX - (centerX - offset.x) * (newScale / scale),
        y: centerY - (centerY - offset.y) * (newScale / scale)
      });
      setScale(newScale);
    }
  }, [scale, offset]);

  const zoomOut = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();

    // Zoom toward center
    const centerX = width / 2;
    const centerY = height / 2;

    const newScale = Math.max(scale - 0.15, 0.2);
    if (newScale !== scale) {
      setOffset({
        x: centerX - (centerX - offset.x) * (newScale / scale),
        y: centerY - (centerY - offset.y) * (newScale / scale)
      });
      setScale(newScale);
    }
  }, [scale, offset]);

  // Use native event listener with passive: false to properly prevent browser zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent default for ALL wheel events to stop browser back/forward navigation
      e.preventDefault();

      const containerRect = container.getBoundingClientRect();

      // Pinch-to-zoom on trackpad calls this
      if (e.ctrlKey || e.metaKey) {
        e.stopPropagation();

        const delta = -e.deltaY * 0.005;
        const newScale = Math.min(Math.max(scale + delta, 0.2), 3);

        if (newScale !== scale) {
          const mouseX = e.clientX - containerRect.left;
          const mouseY = e.clientY - containerRect.top;

          setOffset({
            x: mouseX - (mouseX - offset.x) * (newScale / scale),
            y: mouseY - (mouseY - offset.y) * (newScale / scale)
          });
          setScale(newScale);
        }
      } else {
        // Regular scroll for panning
        setOffset({
          x: offset.x - e.deltaX,
          y: offset.y - e.deltaY
        });
      }
    };

    // Must use passive: false to allow preventDefault on wheel events
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [scale, offset]); // Add dependencies to ensure fresh state access

  const handleNodeDragStart = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    setDraggedNodeId(id);
    const node = project.nodes.find(n => n.id === id);
    if (node) {
      const { x: canvasMouseX, y: canvasMouseY } = viewportToCanvas(e.clientX, e.clientY);
      setDragOffset({
        x: canvasMouseX - node.position.x,
        y: canvasMouseY - node.position.y
      });
    }
  };

  const handleEdgeDragStart = (nodeId: string, direction: EdgeDirection, e: React.MouseEvent) => {
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Use the click position directly as the start point - user clicked on the + button
    // which is exactly where the edge should start from
    const startViewportX = e.clientX;
    const startViewportY = e.clientY;

    // Convert to canvas coords for storage (needed for hover detection etc)
    const startCanvas = viewportToCanvas(startViewportX, startViewportY);

    setEdgeDrag({
      sourceNodeId: nodeId,
      sourceDirection: direction,
      startPoint: startCanvas,
      currentPoint: startCanvas // Initialize current to same as start
    });
  };

  const handleResizeStart = (nodeId: string, handle: ResizeHandle, e: React.MouseEvent) => {
    const node = project.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const { x: canvasX, y: canvasY } = viewportToCanvas(e.clientX, e.clientY);

    // Get current node dimensions
    const nodeEl = nodeRefs.current[nodeId];
    const currentWidth = node.width || (nodeEl?.offsetWidth || 300);
    const currentHeight = node.height || (nodeEl?.offsetHeight || 200);

    setResizeState({
      nodeId,
      handle,
      startMousePos: { x: canvasX, y: canvasY },
      startNodePos: { x: node.position.x, y: node.position.y },
      startNodeSize: { width: currentWidth, height: currentHeight }
    });
  };

  const generateMergeSuggestions = async (sources: NodeType[]): Promise<string[]> => {
    // Generate contextual suggestions based on node content
    try {
      // If we have exactly 2 nodes, use the existing endpoint
      if (sources.length === 2) {
        const [source, target] = sources;
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/graph/suggest-merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_node: { title: source.title, content: Array.isArray(source.content) ? (source.content as any).join('\n') : source.content },
            target_node: { title: target.title, content: Array.isArray(target.content) ? (target.content as any).join('\n') : target.content }
          })
        });

        if (response.ok) {
          const data = await response.json();
          return data.suggestions || [];
        }
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    }

    // Fallback/Generic suggestions
    return [
      `Synthesize insights from ${sources.length} nodes`,
      'Identify common themes and contradictions',
      'Create a comprehensive summary'
    ];


  };

  // Handle merge selection from the pending merge node
  const handleMergeNodeSelect = async (nodeId: string, query: string) => {
    const mergeNode = project.nodes.find(n => n.id === nodeId);
    if (!mergeNode?.pendingMerge) return;

    const sourceNodes = project.nodes.filter(n => mergeNode.pendingMerge!.sourceNodeIds.includes(n.id));

    if (sourceNodes.length < 2) return;

    setIsLoading(true);
    try {
      const result = await graphApi.mergeNodes(sourceNodes);

      // Transform the merge node into a regular content node
      const updatedNodes: NodeType[] = currentNodesRef.current.map(n =>
        n.id === nodeId
          ? {
            ...n,
            title: result.node.title,
            content: result.node.content as any,
            color: 'orange' as NodeType['color'],
            pendingMerge: undefined // Remove pending merge state
          }
          : n
      );

      currentNodesRef.current = updatedNodes;
      onUpdateProject({ nodes: updatedNodes });

      // Focus on the newly merged node
      setRequestedFocusNodeId(nodeId);
    } catch (err) {
      console.error('Error completing merge:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewNode = async () => {
    if (!newNodeState || !newNodeQuery.trim()) return;

    setIsLoading(true);
    try {
      const sourceNode = project.nodes.find(n => n.id === newNodeState.sourceNodeId);
      if (!sourceNode) return;

      const fullQuery = newNodeState.context
        ? `Context from current node: "${newNodeState.context}"\n\nUser Query: ${newNodeQuery}`
        : newNodeQuery;

      const result = await graphApi.createNode(fullQuery, sourceNode, project.documents);

      const newNodeId = Math.random().toString(36).substr(2, 9);
      const newNode: NodeType = {
        id: newNodeId,
        title: result.node.title,
        content: result.node.content,
        color: result.node.color,
        position: newNodeState.position,
        connectedTo: [],
        parentId: newNodeState.sourceNodeId
      };

      const updatedNodes: NodeType[] = project.nodes.map(n =>
        n.id === newNodeState.sourceNodeId
          ? { ...n, connectedTo: [...n.connectedTo, newNodeId] }
          : n
      );

      const allNodes: NodeType[] = [...updatedNodes, newNode];
      onUpdateProject({ nodes: allNodes });
      currentNodesRef.current = allNodes;

      // Focus on the newly created node
      setSelectedNodes([newNodeId]);
      setRequestedFocusNodeId(newNodeId);
    } catch (err) {
      console.error('Error creating node:', err);
    } finally {
      setIsLoading(false);
      setNewNodeState(null);
      setNewNodeQuery('');
    }
  };

  // Store refs for streaming state management
  const currentNodesRef = useRef<NodeType[]>(project.nodes);
  currentNodesRef.current = project.nodes;
  const startStreaming = async (query: string, selectedDocs: Document[], queryNodeId: string, queryNodeX: number, queryNodeY: number) => {
    try {
      await graphApi.generateGraphStream(
        query,
        selectedDocs,
        (nodeData, index, total) => {
          // Smart positioning based on number of nodes
          // Arrange in rows if more than 4 nodes
          const nodesPerRow = Math.min(4, total);
          const row = Math.floor(index / nodesPerRow);
          const col = index % nodesPerRow;
          const nodesInThisRow = Math.min(nodesPerRow, total - row * nodesPerRow);

          // Calculate horizontal position (centered)
          const nodeSpacing = 380;
          const rowWidth = (nodesInThisRow - 1) * nodeSpacing;
          const xOffset = col * nodeSpacing - rowWidth / 2;

          const newNode: NodeType = {
            id: Math.random().toString(36).substr(2, 9),
            title: nodeData.title,
            content: nodeData.content as any,
            color: nodeData.color as NodeType['color'],
            position: {
              x: queryNodeX + xOffset,
              y: queryNodeY + 350 + row * 350
            },
            connectedTo: [],
            parentId: queryNodeId
          };

          const updatedNodes = currentNodesRef.current.map(n =>
            n.id === queryNodeId
              ? { ...n, connectedTo: [...n.connectedTo, newNode.id], isLoading: false } // Clear loading as soon as first result arrives
              : n
          );
          const newNodes = [...updatedNodes, newNode];
          currentNodesRef.current = newNodes;
          onUpdateProject({ nodes: newNodes });

          // Focus on the first node of the stream
          if (index === 0) {
            setRequestedFocusNodeId(newNode.id);
          }
        },
        () => {
          const finalNodes = currentNodesRef.current.map(n =>
            n.id === queryNodeId
              ? { ...n, content: `${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''} analyzed` }
              : n
          );
          currentNodesRef.current = finalNodes;
          onUpdateProject({ nodes: finalNodes });
          setIsStreaming(false);
        },
        (error) => {
          console.error('Stream error:', error);
          setIsStreaming(false);
        }
      );
    } catch (err) {
      console.error('Error generating graph:', err);
      setIsStreaming(false);
    }
  };

  const handleQuery = async (query: string, docIds: string[]) => {
    const selectedDocs = project.documents.filter(d => docIds.includes(d.id));

    const queryNodeX = (-offset.x + window.innerWidth / 2) / scale - 150;
    const queryNodeY = (-offset.y + 120) / scale;

    setIsStreaming(true);
    setHasGeneratedNodes(true);

    const queryNodeId = Math.random().toString(36).substr(2, 9);
    const queryNode: NodeType = {
      id: queryNodeId,
      title: query,
      content: `Analyzing ${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''}...`,
      color: 'slate',
      position: { x: queryNodeX, y: queryNodeY },
      connectedTo: [],
      isLoading: true,
      isQueryNode: true
    };

    // Capture search bar position for animation
    if (searchBarRef.current) {
      const rect = searchBarRef.current.getBoundingClientRect();
      setAnimatingQuery({
        text: query,
        startRect: rect,
        targetPos: { x: queryNodeX, y: queryNodeY }
      });

      // Wait for animation to finish before showing the node and starting the stream
      setTimeout(() => {
        setAnimatingQuery(null);
        const nodesWithQuery = [...currentNodesRef.current, queryNode];
        currentNodesRef.current = nodesWithQuery;
        onUpdateProject({ nodes: nodesWithQuery });
        startStreaming(query, selectedDocs, queryNodeId, queryNodeX, queryNodeY);
      }, 800);
    } else {
      // Fallback if search bar ref is missing
      const nodesWithQuery = [...currentNodesRef.current, queryNode];
      currentNodesRef.current = nodesWithQuery;
      onUpdateProject({ nodes: nodesWithQuery });
      startStreaming(query, selectedDocs, queryNodeId, queryNodeX, queryNodeY);
    }
  };

  const onExpandNode = async (node: NodeType, query?: string): Promise<void> => {
    try {
      const result = await graphApi.expandNode(node, project.documents, query);
      const newNodes: NodeType[] = result.nodes.map((n, i) => ({
        id: Math.random().toString(36).substr(2, 9),
        title: n.title,
        content: String(n.content),
        color: n.color,
        position: { x: node.position.x + (i - 0.5) * 400, y: node.position.y + 400 },
        connectedTo: [],
        parentId: node.id
      }));

      const updatedProjectNodes = project.nodes.map(n =>
        n.id === node.id ? { ...n, connectedTo: [...n.connectedTo, ...newNodes.map(nn => nn.id)] } : n
      );

      onUpdateProject({
        nodes: [...updatedProjectNodes, ...newNodes]
      });

      // Focus on the first newly expanded node
      if (newNodes.length > 0) {
        setRequestedFocusNodeId(newNodes[0].id);
      }
    } catch (err) {
      console.error('Error expanding node:', err);
    }
  };

  const handleSummarizeSelection = async (node: NodeType, text: string) => {
    try {
      setIsLoading(true);
      const summaryQuery = `Summarize this specific section: "${text}"`;
      const result = await graphApi.createNode(summaryQuery, node, project.documents);

      const { position: newPosition, direction } = getAdaptivePosition(node);
      const startPoint = getConnectionPoint(node, direction);

      const newNodeId = Math.random().toString(36).substr(2, 9);
      const newNode: NodeType = {
        id: newNodeId,
        title: `Summary: ${text.slice(0, 20)}...`,
        content: result.node.content,
        color: result.node.color,
        position: newPosition,
        connectedTo: [],
        parentId: node.id
      };

      const updatedNodes: NodeType[] = project.nodes.map(n =>
        n.id === node.id ? { ...n, connectedTo: [...n.connectedTo, newNodeId] } : n
      );
      onUpdateProject({ nodes: [...updatedNodes, newNode] });

      // Select and focus on the new summary node
      setSelectedNodes([newNodeId]);
      setRequestedFocusNodeId(newNodeId);
    } catch (err) {
      console.error('Error summarizing selection:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExpandSelection = async (node: NodeType, text: string) => {
    const expandQuery = `Expand on this specific point from the source: "${text}"`;
    await onExpandNode(node, expandQuery);
  };

  const handleCreateNodeFromSelection = async (node: NodeType, selectedText: string, query: string) => {
    try {
      setIsLoading(true);
      const fullQuery = `Context from selected text: "${selectedText}"\n\nQuery: ${query}`;
      const result = await graphApi.createNode(fullQuery, node, project.documents);

      const { position: newPosition, direction } = getAdaptivePosition(node);
      const startPoint = getConnectionPoint(node, direction);

      const newNodeId = Math.random().toString(36).substr(2, 9);
      const newNode: NodeType = {
        id: newNodeId,
        title: result.node.title,
        content: result.node.content,
        color: result.node.color,
        position: newPosition,
        connectedTo: [],
        parentId: node.id
      };

      const updatedNodes: NodeType[] = project.nodes.map(n =>
        n.id === node.id ? { ...n, connectedTo: [...n.connectedTo, newNodeId] } : n
      );
      onUpdateProject({ nodes: [...updatedNodes, newNode] });

      // Select and focus on the new node
      setSelectedNodes([newNodeId]);
      setRequestedFocusNodeId(newNodeId);
    } catch (err) {
      console.error('Error creating node from selection:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtensionRequest = (node: NodeType, selectedText: string) => {
    // Try right side first
    const nodeWidth = node.width || 300;
    const gap = 100;
    const proposedWidth = 300; // Estimated new node width
    const proposedHeight = 200; // Estimated new node height

    const rightX = node.position.x + nodeWidth + gap;
    const leftX = node.position.x - proposedWidth - gap;
    const posY = node.position.y;

    const rightBlocked = checkCollisions(rightX, posY, proposedWidth, proposedHeight);
    const leftBlocked = checkCollisions(leftX, posY, proposedWidth, proposedHeight);

    let direction: EdgeDirection = 'right';
    let newPosition = { x: rightX, y: posY };

    // If right is blocked but left is free, use left
    if (rightBlocked && !leftBlocked) {
      direction = 'left';
      newPosition = { x: leftX, y: posY };
    }

    const startPoint = getConnectionPoint(node, direction);

    setNewNodeState({
      position: newPosition,
      startPoint: startPoint,
      sourceNodeId: node.id,
      sourceDirection: direction,
      context: selectedText
    });

    // Auto-focus input - relies on newNodeState turning on the input UI
    setNewNodeQuery('');
  };

  const onMergeNodes = async () => {
    if (selectedNodes.length < 2) return;

    // Instead of immediately merging, create a PENDING merge node (like manual drag-drop)
    const nodesToMerge = project.nodes.filter(n => selectedNodes.includes(n.id));

    // Calculate bounding box of all selected nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodesToMerge.forEach(n => {
      // Use nodeBoxes if available for more accuracy, otherwise use position
      const box = nodeBoxes[n.id];
      const x = n.position.x;
      const y = n.position.y;
      const w = n.width || (box?.width || 300);
      const h = n.height || (box?.height || 200);

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + w);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + h);
    });

    const mergeWidth = 300;
    const mergeHeight = 200;
    const gap = 150;
    const centerY = minY + (maxY - minY) / 2;
    const centerX = minX + (maxX - minX) / 2;

    // Define candidate positions in order of preference
    // 1. Right (Standard expansion)
    // 2. Left (Cluster/Back-fill - simplified visual flow)
    // 3. Bottom (Standard list flow)
    // 4. Top
    const candidates = [
      { x: maxX + gap, y: centerY - mergeHeight / 2 },
      { x: minX - mergeWidth - gap, y: centerY - mergeHeight / 2 },
      { x: centerX - mergeWidth / 2, y: maxY + gap },
      { x: centerX - mergeWidth / 2, y: minY - mergeHeight - gap }
    ];

    let mergeX = candidates[0].x;
    let mergeY = candidates[0].y;

    // Find first non-colliding position
    for (const pos of candidates) {
      if (!checkCollisions(pos.x, pos.y, mergeWidth, mergeHeight)) {
        mergeX = pos.x;
        mergeY = pos.y;
        break;
      }
    }

    const mergeNodeId = Math.random().toString(36).substr(2, 9);

    const mergeNode: NodeType = {
      id: mergeNodeId,
      title: 'Pending Synthesis',
      content: '',
      color: 'orange',
      position: { x: mergeX, y: mergeY },
      connectedTo: [],
      pendingMerge: {
        sourceNodeIds: nodesToMerge.map(n => n.id),
        suggestions: [],
        isLoadingSuggestions: true
      }
    };

    // Connect sources to this new pending node
    const updatedNodes = project.nodes.map(n =>
      selectedNodes.includes(n.id)
        ? { ...n, connectedTo: [...n.connectedTo, mergeNodeId] }
        : n
    );

    const newNodes = [...updatedNodes, mergeNode];
    currentNodesRef.current = newNodes;
    onUpdateProject({ nodes: newNodes });
    setSelectedNodes([]); // Clear selection
    setRequestedFocusNodeId(mergeNodeId);

    // Generate suggestions
    generateMergeSuggestions(nodesToMerge).then(suggestions => {
      onUpdateProject({
        nodes: currentNodesRef.current.map(n =>
          n.id === mergeNodeId
            ? { ...n, pendingMerge: { ...n.pendingMerge!, suggestions, isLoadingSuggestions: false } }
            : n
        )
      });
    });
  };





  // Delete a specific node and remove all connections to/from it
  const deleteNode = useCallback((nodeId: string) => {
    const updatedNodes = project.nodes
      .filter(n => n.id !== nodeId)
      .map(n => ({
        ...n,
        connectedTo: n.connectedTo.filter(id => id !== nodeId)
      }));

    onUpdateProject({ nodes: updatedNodes });
    // Also remove from selection if selected
    setSelectedNodes(prev => prev.filter(id => id !== nodeId));
  }, [project.nodes, onUpdateProject]);

  // Delete all selected nodes
  const deleteSelectedNodes = useCallback(() => {
    if (selectedNodes.length === 0) return;

    const nodesToDelete = new Set(selectedNodes);
    const updatedNodes = project.nodes
      .filter(n => !nodesToDelete.has(n.id))
      .map(n => ({
        ...n,
        connectedTo: n.connectedTo.filter(id => !nodesToDelete.has(id))
      }));

    onUpdateProject({ nodes: updatedNodes });
    setSelectedNodes([]);
  }, [project.nodes, selectedNodes, onUpdateProject]);

  // Fit to view (auto-center)
  const fitToView = useCallback(() => {
    if (project.nodes.length === 0) {
      // If no nodes, reset to center/default
      setOffset({ x: 0, y: 0 });
      setScale(0.65);
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();

    // 1. Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    project.nodes.forEach(node => {
      // Use nodeBoxes if available for more accuracy including content size,
      // otherwise use node.position and defaults
      const box = nodeBoxes[node.id];
      let x, y, w, h;

      if (box) {
        x = box.x;
        y = box.y;
        w = box.width;
        h = box.height;
      } else {
        const nodeEl = nodeRefs.current[node.id];
        x = node.position.x;
        y = node.position.y;
        w = node.width || (nodeEl?.offsetWidth || 300);
        h = node.height || (nodeEl?.offsetHeight || 200);
      }

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    });

    if (minX === Infinity) return;

    const nodesWidth = maxX - minX;
    const nodesHeight = maxY - minY;
    const nodesCenterX = minX + nodesWidth / 2;
    const nodesCenterY = minY + nodesHeight / 2;

    // 2. Calculate scale to fit
    const padding = 100; // px
    // Available space
    const availableWidth = containerWidth - padding * 2;
    const availableHeight = containerHeight - padding * 2;

    const scaleX = availableWidth / nodesWidth;
    const scaleY = availableHeight / nodesHeight;

    // Choose the smaller scale to ensure everything fits, clamp to reasonable limits
    // Use 1.0 as max scale to avoid zooming in too much on few nodes
    const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.2);

    // 3. Calculate offset to center the content
    // We want the center of the nodes (nodesCenterX, nodesCenterY) to be at the center of the container
    // ScreenPos = CanvasPos * Scale + Offset
    // ContainerCenter = NodesCenter * TargetScale + TargetOffset
    // TargetOffset = ContainerCenter - NodesCenter * TargetScale

    const targetOffset = {
      x: (containerWidth / 2) - (nodesCenterX * targetScale),
      y: (containerHeight / 2) - (nodesCenterY * targetScale)
    };

    // Apply
    setScale(targetScale);
    setOffset(targetOffset);

  }, [project.nodes, nodeBoxes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Delete or Cmd+Backspace to delete selected nodes
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedNodes.length > 0) {
          e.preventDefault();
          deleteSelectedNodes();
        }
      }

      // Cmd+I for Fit to View
      if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        fitToView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodes, deleteSelectedNodes, fitToView]);

  const isInteracting = !!(draggedNodeId || isPanning || edgeDrag || resizeState || isNewNodeDragging || selectionBox);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden graph-grid-bg bg-[#0c0f13] select-none ${edgeDrag ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
        }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Canvas Transform Layer */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      >
        {/* Connection Lines */}
        <svg
          className="absolute pointer-events-none z-0 overflow-visible"
          viewBox="-25000 -25000 50000 50000"
          style={{ left: '-25000px', top: '-25000px', width: '50000px', height: '50000px' }}
        >
          {/* Existing connections */}
          {project.nodes.map(node => (
            node.connectedTo.map(targetId => {
              const target = project.nodes.find(n => n.id === targetId);
              if (!target) return null;

              const nodePos = getNodePosition(node);
              const targetPos = getNodePosition(target);

              // Get actual dimensions from DOM refs or node props, fallback to defaults
              const nodeEl = nodeRefs.current[node.id];
              const targetEl = nodeRefs.current[target.id];
              const nodeWidth = node.width || (nodeEl?.offsetWidth || 300);
              const targetWidth = target.width || (targetEl?.offsetWidth || 300);
              const nodeHeight = node.height || (nodeEl?.offsetHeight || (150 + node.content.length * 30));
              const targetHeight = target.height || (targetEl?.offsetHeight || (150 + target.content.length * 30));

              // Calculate centers for determining direction
              const parentCenterX = nodePos.x + nodeWidth / 2;
              const parentCenterY = nodePos.y + nodeHeight / 2;
              const childCenterX = targetPos.x + targetWidth / 2;
              const childCenterY = targetPos.y + targetHeight / 2;

              let x1, y1, x2, y2;
              const dx = childCenterX - parentCenterX;
              const dy = childCenterY - parentCenterY;

              // Determine connection points - edges connect at the middle of each side (+ icon positions)
              if (Math.abs(dy) > Math.abs(dx) * 0.5) {
                // Vertical connection (top/bottom)
                if (dy > 0) {
                  // Target is below parent - connect bottom of parent to top of target
                  x1 = nodePos.x + nodeWidth / 2; // Middle of bottom edge
                  y1 = nodePos.y + nodeHeight;
                  x2 = targetPos.x + targetWidth / 2; // Middle of top edge
                  y2 = targetPos.y;
                } else {
                  // Target is above parent - connect top of parent to bottom of target
                  x1 = nodePos.x + nodeWidth / 2; // Middle of top edge
                  y1 = nodePos.y;
                  x2 = targetPos.x + targetWidth / 2; // Middle of bottom edge
                  y2 = targetPos.y + targetHeight;
                }
              } else {
                // Horizontal connection (left/right)
                if (dx > 0) {
                  // Target is to the right - connect right of parent to left of target
                  x1 = nodePos.x + nodeWidth; // Middle of right edge
                  y1 = nodePos.y + nodeHeight / 2;
                  x2 = targetPos.x; // Middle of left edge
                  y2 = targetPos.y + targetHeight / 2;
                } else {
                  // Target is to the left - connect left of parent to right of target
                  x1 = nodePos.x; // Middle of left edge
                  y1 = nodePos.y + nodeHeight / 2;
                  x2 = targetPos.x + targetWidth; // Middle of right edge
                  y2 = targetPos.y + targetHeight / 2;
                }
              }

              const isVertical = Math.abs(dy) > Math.abs(dx) * 0.5;
              let path;
              if (isVertical) {
                const ctrlOffset = Math.abs(y2 - y1) * 0.4;
                const ctrl1Y = dy > 0 ? y1 + ctrlOffset : y1 - ctrlOffset;
                const ctrl2Y = dy > 0 ? y2 - ctrlOffset : y2 + ctrlOffset;
                path = `M ${x1} ${y1} C ${x1} ${ctrl1Y}, ${x2} ${ctrl2Y}, ${x2} ${y2}`;
              } else {
                const ctrlOffset = Math.abs(x2 - x1) * 0.4;
                const ctrl1X = dx > 0 ? x1 + ctrlOffset : x1 - ctrlOffset;
                const ctrl2X = dx > 0 ? x2 - ctrlOffset : x2 + ctrlOffset;
                path = `M ${x1} ${y1} C ${ctrl1X} ${y1}, ${ctrl2X} ${y2}, ${x2} ${y2}`;
              }

              return (
                <g key={`${node.id}-${targetId}`}>
                  {/* Outer Glow */}
                  <path
                    d={path}
                    stroke="rgba(16, 185, 129, 0.08)"
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Glass Core */}
                  <path
                    d={path}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Detail Line (Mixed Green + White) */}
                  <path
                    d={path}
                    stroke="rgba(16, 185, 129, 0.3)"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d={path}
                    stroke="rgba(255, 255, 255, 0.6)"
                    strokeWidth="1.2"
                    fill="none"
                    strokeLinecap="round"
                  />
                </g>
              );
            })
          ))}

          {/* Static edges are rendered here in the transform layer */}
          {/* Dragging edge is rendered outside the transform layer for accurate positioning */}

          {/* Edge from parent node to new node input - rendered in canvas coords so it moves with pan/zoom */}
          {newNodeState && (() => {
            const { position, sourceDirection, sourceNodeId } = newNodeState;

            // Calculate startPoint dynamically from parent node's current position
            const sourceNode = project.nodes.find(n => n.id === sourceNodeId);
            if (!sourceNode) return null;
            const startPoint = getConnectionPoint(sourceNode, sourceDirection);

            // Input box dimensions (approximate)
            const inputWidth = 300;
            const inputHeight = 120;

            // Calculate end point based on which direction the edge came from
            // Connect to the opposite side of where it originated
            let endX: number, endY: number;

            switch (sourceDirection) {
              case 'right': // Coming from right of parent, connect to left of input
                endX = position.x;
                endY = position.y + inputHeight / 2;
                break;
              case 'left': // Coming from left of parent, connect to right of input
                endX = position.x + inputWidth;
                endY = position.y + inputHeight / 2;
                break;
              case 'bottom': // Coming from bottom of parent, connect to top of input
                endX = position.x + inputWidth / 2;
                endY = position.y;
                break;
              case 'top': // Coming from top of parent, connect to bottom of input
                endX = position.x + inputWidth / 2;
                endY = position.y + inputHeight;
                break;
            }

            const dx = endX - startPoint.x;
            const dy = endY - startPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const ctrlDist = Math.min(distance * 0.4, 150);

            // Calculate control points based on source direction
            let ctrl1x: number, ctrl1y: number;

            switch (sourceDirection) {
              case 'top':
                ctrl1x = startPoint.x;
                ctrl1y = startPoint.y - ctrlDist;
                break;
              case 'bottom':
                ctrl1x = startPoint.x;
                ctrl1y = startPoint.y + ctrlDist;
                break;
              case 'left':
                ctrl1x = startPoint.x - ctrlDist;
                ctrl1y = startPoint.y;
                break;
              case 'right':
                ctrl1x = startPoint.x + ctrlDist;
                ctrl1y = startPoint.y;
                break;
            }

            const ctrl2x = endX - dx * 0.3;
            const ctrl2y = endY - dy * 0.3;

            const path = `M ${startPoint.x} ${startPoint.y} C ${ctrl1x} ${ctrl1y}, ${ctrl2x} ${ctrl2y}, ${endX} ${endY}`;

            return (
              <g>
                {/* Outer Glow */}
                <path
                  d={path}
                  stroke="rgba(251, 146, 60, 0.05)"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Main line - mixed dashed to indicate pending connection */}
                <path
                  d={path}
                  stroke="rgba(251, 146, 60, 0.25)"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="8 4"
                />
                <path
                  d={path}
                  stroke="rgba(255, 255, 255, 0.6)"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="8 4"
                />
                {/* Start dot at parent node */}
                <circle
                  cx={startPoint.x}
                  cy={startPoint.y}
                  r={4}
                  fill="rgba(255, 255, 255, 0.6)"
                  stroke="rgba(251, 146, 60, 0.4)"
                  strokeWidth="1.5"
                />
                {/* End dot at new node input */}
                <circle
                  cx={endX}
                  cy={endY}
                  r={4}
                  fill="rgba(255, 255, 255, 0.6)"
                  stroke="rgba(251, 146, 60, 0.4)"
                  strokeWidth="1.5"
                />
              </g>
            );
          })()}
        </svg>

        {/* Nodes */}
        <div className="absolute top-0 left-0 pointer-events-auto z-10">
          {project.nodes.map(node => {
            // Get parent node names for merge nodes
            const parentNodeNames = node.pendingMerge ?
              node.pendingMerge.sourceNodeIds.map(id =>
                project.nodes.find(n => n.id === id)?.title || 'Node'
              ) : undefined;

            return (
              <GraphNode
                key={node.id}
                node={{ ...node, position: getNodePosition(node) }}
                onExpand={(query) => onExpandNode(node, query)}
                onGetExpandSuggestions={() => graphApi.suggestExpand(node, project.documents)}
                isSelected={selectedNodes.includes(node.id)}
                isDragging={draggedNodeId === node.id}
                isResizing={resizeState?.nodeId === node.id}
                isEdgeTarget={hoveredNodeId === node.id}
                onToggleSelect={() => {
                  setSelectedNodes(prev =>
                    prev.includes(node.id) ? prev.filter(ni => ni !== node.id) : [...prev, node.id]
                  );
                }}
                onDragStart={(e) => handleNodeDragStart(node.id, e)}
                onEdgeDragStart={(direction, e) => handleEdgeDragStart(node.id, direction, e)}
                onResizeStart={(handle, e) => handleResizeStart(node.id, handle, e)}
                onDelete={() => deleteNode(node.id)}
                onMergeSelect={(query) => handleMergeNodeSelect(node.id, query)}
                onExpandSelection={(text) => handleExpandSelection(node, text)}
                onSummarizeSelection={(text) => handleSummarizeSelection(node, text)}
                onCreateNodeFromSelection={(text, query) => handleCreateNodeFromSelection(node, text, query)}
                onExtensionRequest={(text) => handleExtensionRequest(node, text)}
                onFocusRequest={() => focusOnNode(node.id)}
                parentNodeNames={parentNodeNames}
                onUpdate={(newContent) => {
                  const updatedNodes = project.nodes.map(n =>
                    n.id === node.id ? { ...n, content: newContent } : n
                  );
                  currentNodesRef.current = updatedNodes;
                  onUpdateProject({ nodes: updatedNodes });
                }}
                scale={scale}
                innerRef={setNodeRef(node.id)}
              />
            );
          })}
        </div>

        {/* New Node Input (when edge dropped on empty space) - inside transform layer */}
        {newNodeState && (
          <div
            className={`absolute pointer-events-auto z-50 ${isNewNodeDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ left: newNodeState.position.x, top: newNodeState.position.y }}
            onMouseDown={(e) => {
              // Don't start drag if clicking on input or button
              if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'BUTTON') {
                return;
              }
              e.stopPropagation();
              const { x: canvasX, y: canvasY } = viewportToCanvas(e.clientX, e.clientY);
              setNewNodeDragOffset({
                x: canvasX - newNodeState.position.x,
                y: canvasY - newNodeState.position.y
              });
              setIsNewNodeDragging(true);
            }}
          >
            <div className="w-[300px] bg-[#14181d] border border-[#252a31] rounded-none p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-wider font-bold select-none" style={{ color: '#e6eaf0' }}>New Connected Node</div>
                <button
                  onClick={() => { setNewNodeState(null); setNewNodeQuery(''); }}
                  className="p-1 rounded-none hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  ref={newNodeInputRef}
                  type="text"
                  value={newNodeQuery}
                  onChange={(e) => setNewNodeQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateNewNode();
                    if (e.key === 'Escape') {
                      setNewNodeState(null);
                      setNewNodeQuery('');
                    }
                  }}
                  placeholder="What should this node contain?"
                  className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-none text-[12px] placeholder-slate-500 outline-none focus:border-orange-500/40 select-text"
                  style={{ color: '#b9c0cc' }}
                  autoFocus
                />
                <button
                  onClick={handleCreateNewNode}
                  disabled={!newNodeQuery.trim() || isLoading}
                  className="p-2 bg-orange-500 text-black rounded-none hover:bg-orange-400 disabled:opacity-50 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Search Bar */}
      {!hasGeneratedNodes && !animatingQuery && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl px-6 pointer-events-auto z-50">
          <GraphSearchBar
            ref={searchBarRef}
            documents={project.documents}
            onQuery={handleQuery}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Search to Node Animation Overlay */}
      <AnimatePresence>
        {animatingQuery && (
          <motion.div
            initial={{
              x: animatingQuery.startRect.left,
              y: animatingQuery.startRect.top,
              width: animatingQuery.startRect.width,
              height: animatingQuery.startRect.height,
              opacity: 1,
              borderRadius: '0px',
              backgroundColor: '#14181d',
              borderColor: '#252a31',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}
            animate={{
              x: animatingQuery.targetPos.x * scale + offset.x,
              y: animatingQuery.targetPos.y * scale + offset.y,
              width: 300 * scale,
              height: 180 * scale,
              opacity: 1,
              borderRadius: '0px',
              backgroundColor: '#14181d',
              borderColor: '#252a31',
              boxShadow: '0 20px 50px -10px rgba(0,0,0,0.5)'
            }}
            exit={{ opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 60,
              damping: 14,
              mass: 1.2
            }}
            className="fixed z-[100] border overflow-hidden flex flex-col shadow-2xl pointer-events-none backdrop-blur-xl"
          >
            {/* Header Content Bar - Matches GraphNode */}
            <motion.div
              className="w-full h-1.5 shrink-0"
              initial={{ backgroundColor: 'transparent' }}
              animate={{ backgroundColor: 'rgba(100, 116, 139, 0.5)' }} // graph-node-slate header
              transition={{ delay: 0.3 }}
            />

            {/* Content Area - Matches GraphNode p-5 */}
            <div className="relative flex-1 p-5 flex flex-col">
              {/* Title Row */}
              <div className="flex items-start justify-between mb-4 gap-3">
                <motion.h3
                  className="font-semibold leading-snug"
                  initial={{ fontSize: '13px', color: '#b9c0cc' }}
                  animate={{ fontSize: '15px', color: '#e6eaf0' }}
                  transition={{ duration: 0.6 }}
                >
                  {animatingQuery.text}
                </motion.h3>

                {/* Right side icons - Fades in Select Checkbox */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 }}
                  className="w-5 h-5 rounded-none border border-slate-600 shrink-0"
                />
              </div>

              {/* Content Points - Fades in matching GraphNode layout */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="space-y-2.5"
              >
                {/* Waveform loading bar - Moved to top to match GraphNode */}
                <div className="mb-4 flex flex-col items-center justify-center gap-2">
                  <div className="loading-waveform">
                    <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                    <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                    <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                    <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                    <div className="waveform-bar" style={{ backgroundColor: '#111827' }} />
                  </div>
                  <span className="text-[10px] text-slate-500/70 uppercase tracking-widest font-bold">Analyzing...</span>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-none mt-1.5 shrink-0" style={{ backgroundColor: 'rgb(100, 116, 139)' }} />
                  <div className="h-2 w-full mt-1.5 bg-slate-700/30 rounded-none" />
                </div>
              </motion.div>

              {/* Footer Button - Matches GraphNode Expand button */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-auto flex justify-end"
              >
                <div
                  className="px-3 py-1.5 rounded-none text-[9px] font-bold uppercase tracking-[0.12em] flex items-center gap-1.5"
                  style={{ background: 'rgba(100, 116, 139, 0.5)', color: 'rgb(148, 163, 184)' }}
                >
                  <Expand className="w-3 h-3" />
                  Expand
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Marquee Selection Rectangle */}
      {selectionBox && (
        <div
          className="absolute pointer-events-none z-40"
          style={{
            left: Math.min(selectionBox.start.x, selectionBox.current.x) * scale + offset.x,
            top: Math.min(selectionBox.start.y, selectionBox.current.y) * scale + offset.y,
            width: Math.abs(selectionBox.current.x - selectionBox.start.x) * scale,
            height: Math.abs(selectionBox.current.y - selectionBox.start.y) * scale,
            border: '1px dashed rgba(16, 185, 129, 0.6)',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            borderRadius: '4px'
          }}
        />
      )}

      {/* Selection Actions Bar */}
      {selectedNodes.length > 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 glass-surface text-white px-5 py-3 rounded-none shadow-2xl flex items-center gap-5 pointer-events-auto z-50 border border-white/10">
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            {selectedNodes.length} Selected
          </span>
          <button
            type="button"
            onClick={onMergeNodes}
            disabled={isLoading || isStreaming}
            className="bg-orange-500 text-black px-4 py-2 rounded-none text-[10px] font-bold uppercase tracking-wider hover:bg-orange-400 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Combine className="w-3.5 h-3.5" />
            Synthesize
          </button>
          <button
            onClick={() => setSelectedNodes([])}
            className="text-slate-500 hover:text-white p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && !isStreaming && (
        <div className="absolute bottom-8 right-8 glass-surface px-4 py-2 rounded-none flex items-center gap-3 z-50 border border-white/10">
          <div className="w-2 h-2 rounded-none bg-orange-500 animate-pulse" />
          <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#e6eaf0' }}>Processing</span>
        </div>
      )}

      {/* Dragging edge preview - rendered outside transform layer for accurate positioning */}
      {edgeDrag && (() => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;

        const { startPoint, currentPoint, sourceDirection } = edgeDrag;

        // Convert canvas coords to viewport coords
        const startViewport = {
          x: startPoint.x * scale + offset.x + rect.left,
          y: startPoint.y * scale + offset.y + rect.top
        };
        const endViewport = {
          x: currentPoint.x * scale + offset.x + rect.left,
          y: currentPoint.y * scale + offset.y + rect.top
        };

        const dx = endViewport.x - startViewport.x;
        const dy = endViewport.y - startViewport.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Control point distance scales with drag distance for natural curve
        const ctrlDist = Math.min(distance * 0.4, 100);

        // Calculate control points based on the direction the edge started from
        let ctrl1x, ctrl1y;

        switch (sourceDirection) {
          case 'top':
            ctrl1x = startViewport.x;
            ctrl1y = startViewport.y - ctrlDist;
            break;
          case 'bottom':
            ctrl1x = startViewport.x;
            ctrl1y = startViewport.y + ctrlDist;
            break;
          case 'left':
            ctrl1x = startViewport.x - ctrlDist;
            ctrl1y = startViewport.y;
            break;
          case 'right':
            ctrl1x = startViewport.x + ctrlDist;
            ctrl1y = startViewport.y;
            break;
        }

        // Second control point curves toward the cursor
        const ctrl2x = endViewport.x - dx * 0.3;
        const ctrl2y = endViewport.y - dy * 0.3;

        const path = `M ${startViewport.x} ${startViewport.y} C ${ctrl1x} ${ctrl1y}, ${ctrl2x} ${ctrl2y}, ${endViewport.x} ${endViewport.y}`;

        return (
          <svg
            className="fixed inset-0 pointer-events-none z-[50]"
            style={{ width: '100vw', height: '100vh' }}
          >
            {/* Outer Glow */}
            <path
              d={path}
              stroke={hoveredNodeId ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)'}
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
            />
            {/* Glass Core */}
            <path
              d={path}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
            {/* Main line (Mixed Green + White) */}
            <path
              d={path}
              stroke={hoveredNodeId ? 'rgba(16, 185, 129, 0.6)' : 'rgba(16, 185, 129, 0.3)'}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              className={hoveredNodeId ? '' : 'animate-pulse'}
            />
            <path
              d={path}
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
            {/* End dot at cursor */}
            <circle
              cx={endViewport.x}
              cy={endViewport.y}
              r={hoveredNodeId ? 10 : 6}
              fill="rgba(255, 255, 255, 0.4)"
              stroke={hoveredNodeId ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.4)'}
              strokeWidth="2"
              className="transition-all duration-150"
            />
            {/* Start dot */}
            <circle
              cx={startViewport.x}
              cy={startViewport.y}
              r={5}
              fill="rgba(255, 255, 255, 0.5)"
              stroke="rgba(16, 185, 129, 0.6)"
              strokeWidth="2"
            />
          </svg>
        );
      })()}


      {/* Zoom Controls - Bottom Left */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-1 pointer-events-auto z-50">
        <button
          onClick={zoomIn}
          className="w-9 h-9 rounded-none bg-[#0a1a0f]/90 backdrop-blur-sm border border-emerald-500/20 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition-all shadow-lg"
          title="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="w-9 h-7 rounded-none bg-[#0a1a0f]/90 backdrop-blur-sm border border-white/10 flex items-center justify-center">
          <span className="text-[9px] text-slate-400 font-mono">{Math.round(scale * 100)}%</span>
        </div>
        <button
          onClick={zoomOut}
          className="w-9 h-9 rounded-none bg-[#0a1a0f]/90 backdrop-blur-sm border border-emerald-500/20 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition-all shadow-lg"
          title="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="h-1" />
        <button
          onClick={fitToView}
          className="w-9 h-9 rounded-none bg-[#0a1a0f]/90 backdrop-blur-sm border border-emerald-500/20 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition-all shadow-lg"
          title="Fit to view (Cmd+I)"
        >
          <Maximize className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default GraphCanvas;
