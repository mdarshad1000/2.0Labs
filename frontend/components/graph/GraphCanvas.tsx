
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { GraphProject, GraphNode as NodeType, Document } from '../../types';
import GraphSearchBar from './GraphSearchBar';
import GraphNode, { EdgeDirection, ResizeHandle } from './GraphNode';
import { graphApi } from '../../services/graphApi';
import { Combine, X, ArrowRight, Plus, Minus } from 'lucide-react';

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

  const handleMouseDown = (e: React.MouseEvent) => {
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
        const contentContainer = nodeEl.querySelector('.rounded-2xl');
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
          // Position the merge node between/below the two parent nodes
          const sourcePos = sourceNode.position;
          const targetPos = targetNode.position;
          const mergeX = (sourcePos.x + targetPos.x) / 2;
          const mergeY = Math.max(sourcePos.y, targetPos.y) + 320;

          // Create the merge node with pendingMerge data
          const mergeNodeId = Math.random().toString(36).substr(2, 9);
          const mergeNode: NodeType = {
            id: mergeNodeId,
            title: 'Merge Node',
            content: [],
            color: 'orange',
            position: { x: mergeX, y: mergeY },
            connectedTo: [],
            pendingMerge: {
              sourceNodeId: sourceNode.id,
              targetNodeId: targetNode.id,
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

          // Generate merge suggestions asynchronously
          generateMergeSuggestions(sourceNode, targetNode).then(suggestions => {
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

  // Zoom controls
  const zoomIn = useCallback(() => {
    setScale(s => Math.min(s + 0.15, 3));
  }, []);

  const zoomOut = useCallback(() => {
    setScale(s => Math.max(s - 0.15, 0.2));
  }, []);

  // Use native event listener with passive: false to properly prevent browser zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent default for ALL wheel events to stop browser back/forward navigation
      e.preventDefault();

      // Pinch-to-zoom on trackpad triggers ctrlKey
      if (e.ctrlKey || e.metaKey) {
        e.stopPropagation();
        const delta = -e.deltaY * 0.002;
        setScale(s => Math.min(Math.max(s + delta, 0.2), 3));
      } else {
        // Regular scroll for panning
        setOffset(prev => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY
        }));
      }
    };

    // Must use passive: false to allow preventDefault on wheel events
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handleNodeDragStart = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const generateMergeSuggestions = async (source: NodeType, target: NodeType): Promise<string[]> => {
    // Generate contextual suggestions based on node content
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/graph/suggest-merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_node: { title: source.title, content: source.content },
          target_node: { title: target.title, content: target.content }
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.suggestions || [];
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    }

    // Fallback suggestions
    return [
      `How do "${source.title}" and "${target.title}" relate?`,
      'Synthesize key insights from both',
      'Compare and contrast these perspectives'
    ];
  };

  // Handle merge selection from the pending merge node
  const handleMergeNodeSelect = async (nodeId: string, query: string) => {
    const mergeNode = project.nodes.find(n => n.id === nodeId);
    if (!mergeNode?.pendingMerge) return;

    const sourceNode = project.nodes.find(n => n.id === mergeNode.pendingMerge!.sourceNodeId);
    const targetNode = project.nodes.find(n => n.id === mergeNode.pendingMerge!.targetNodeId);

    if (!sourceNode || !targetNode) return;

    setIsLoading(true);
    try {
      const result = await graphApi.mergeNodes([sourceNode, targetNode]);

      // Transform the merge node into a regular content node
      const updatedNodes = currentNodesRef.current.map(n =>
        n.id === nodeId
          ? {
            ...n,
            title: result.node.title,
            content: result.node.content,
            color: 'orange',
            pendingMerge: undefined // Remove pending merge state
          }
          : n
      );

      currentNodesRef.current = updatedNodes;
      onUpdateProject({ nodes: updatedNodes });
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

      const result = await graphApi.createNode(newNodeQuery, sourceNode, project.documents);

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

      // Connect source node to the new node
      const updatedNodes = project.nodes.map(n =>
        n.id === newNodeState.sourceNodeId
          ? { ...n, connectedTo: [...n.connectedTo, newNodeId] }
          : n
      );

      onUpdateProject({ nodes: [...updatedNodes, newNode] });
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
      content: [`Analyzing ${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''}...`],
      color: 'slate',
      position: { x: queryNodeX, y: queryNodeY },
      connectedTo: []
    };

    const nodesWithQuery = [...currentNodesRef.current, queryNode];
    currentNodesRef.current = nodesWithQuery;
    onUpdateProject({ nodes: nodesWithQuery });

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
            content: nodeData.content,
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
              ? { ...n, connectedTo: [...n.connectedTo, newNode.id] }
              : n
          );
          const newNodes = [...updatedNodes, newNode];
          currentNodesRef.current = newNodes;
          onUpdateProject({ nodes: newNodes });
        },
        () => {
          const finalNodes = currentNodesRef.current.map(n =>
            n.id === queryNodeId
              ? { ...n, content: [`${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''} analyzed`] }
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

  const onExpandNode = async (node: NodeType, query?: string): Promise<void> => {
    try {
      const result = await graphApi.expandNode(node, project.documents, query);
      const newNodes: NodeType[] = result.nodes.map((n, i) => ({
        id: Math.random().toString(36).substr(2, 9),
        title: n.title,
        content: n.content,
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
    } catch (err) {
      console.error('Error expanding node:', err);
    } finally {
      // Inline loading handled by GraphNode
    }
  };

  const onMergeNodes = async () => {
    if (selectedNodes.length < 2) return;
    setIsLoading(true);
    try {
      const nodesToMerge = project.nodes.filter(n => selectedNodes.includes(n.id));
      const result = await graphApi.mergeNodes(nodesToMerge);

      const avgX = nodesToMerge.reduce((acc, n) => acc + n.position.x, 0) / nodesToMerge.length;
      const avgY = Math.max(...nodesToMerge.map(n => n.position.y)) + 400;

      const newNodeId = Math.random().toString(36).substr(2, 9);
      const newNode: NodeType = {
        id: newNodeId,
        title: result.node.title,
        content: result.node.content,
        color: 'orange',
        position: { x: avgX, y: avgY },
        connectedTo: [],
      };

      const updatedNodes = project.nodes.map(n =>
        selectedNodes.includes(n.id)
          ? { ...n, connectedTo: [...n.connectedTo, newNodeId] }
          : n
      );

      onUpdateProject({ nodes: [...updatedNodes, newNode] });
      setSelectedNodes([]);
    } catch (err) {
      console.error('Error merging nodes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getNodePosition = (node: NodeType) => {
    if (node.id === draggedNodeId && dragPosition) {
      return dragPosition;
    }
    return node.position;
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

  // Keyboard shortcut for Cmd+Delete/Backspace to delete selected nodes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Delete or Cmd+Backspace to delete selected nodes
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedNodes.length > 0) {
          e.preventDefault();
          deleteSelectedNodes();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodes, deleteSelectedNodes]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden graph-grid-bg bg-[#030a06] ${edgeDrag ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
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
                  stroke="rgba(16, 185, 129, 0.05)"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Main line - mixed dashed to indicate pending connection */}
                <path
                  d={path}
                  stroke="rgba(16, 185, 129, 0.25)"
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
                  stroke="rgba(16, 185, 129, 0.4)"
                  strokeWidth="1.5"
                />
                {/* End dot at new node input */}
                <circle
                  cx={endX}
                  cy={endY}
                  r={4}
                  fill="rgba(255, 255, 255, 0.6)"
                  stroke="rgba(16, 185, 129, 0.4)"
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
            const parentNodeNames = node.pendingMerge ? {
              source: project.nodes.find(n => n.id === node.pendingMerge!.sourceNodeId)?.title || 'Node',
              target: project.nodes.find(n => n.id === node.pendingMerge!.targetNodeId)?.title || 'Node'
            } : undefined;

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
                parentNodeNames={parentNodeNames}
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
            <div className="w-[300px] bg-[#0a1a0f] border border-emerald-500/30 rounded-2xl p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] text-emerald-500 uppercase tracking-wider font-bold select-none">New Connected Node</div>
                <button
                  onClick={() => { setNewNodeState(null); setNewNodeQuery(''); }}
                  className="p-1 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
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
                  className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-[12px] text-white placeholder-slate-500 outline-none focus:border-emerald-500/50"
                  autoFocus
                />
                <button
                  onClick={handleCreateNewNode}
                  disabled={!newNodeQuery.trim() || isLoading}
                  className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Search Bar */}
      {!hasGeneratedNodes && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 pointer-events-auto z-50">
          <GraphSearchBar
            documents={project.documents}
            onQuery={handleQuery}
            isLoading={isLoading}
          />
        </div>
      )}

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
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 glass-surface text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-5 pointer-events-auto z-50 border border-emerald-500/20">
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            {selectedNodes.length} Selected
          </span>
          <button
            onClick={onMergeNodes}
            disabled={isLoading || isStreaming}
            className="bg-emerald-500 text-black px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors flex items-center gap-2 disabled:opacity-50"
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
        <div className="absolute bottom-8 right-8 glass-surface px-4 py-2 rounded-xl flex items-center gap-3 z-50 border border-emerald-500/20">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-emerald-500 uppercase tracking-wider font-medium">Processing</span>
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
          className="w-9 h-9 rounded-lg bg-[#0a1a0f]/90 backdrop-blur-sm border border-emerald-500/20 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition-all shadow-lg"
          title="Zoom in"
        >
          <Plus className="w-4 h-4" />
        </button>
        <div className="w-9 h-7 rounded-lg bg-[#0a1a0f]/90 backdrop-blur-sm border border-white/10 flex items-center justify-center">
          <span className="text-[9px] text-slate-400 font-mono">{Math.round(scale * 100)}%</span>
        </div>
        <button
          onClick={zoomOut}
          className="w-9 h-9 rounded-lg bg-[#0a1a0f]/90 backdrop-blur-sm border border-emerald-500/20 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition-all shadow-lg"
          title="Zoom out"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default GraphCanvas;
