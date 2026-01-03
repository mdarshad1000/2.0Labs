
import React from 'react';
import { Node, Edge as EdgeType } from './types';

interface EdgeProps {
    edge: EdgeType;
    nodes: Node[];
    scrollProgress: number;
}

const Edge: React.FC<EdgeProps> = ({ edge, nodes, scrollProgress }) => {
    const fromNode = nodes.find(n => n.id === edge.from);
    const toNode = nodes.find(n => n.id === edge.to);

    if (!fromNode || !toNode) return null;

    // Drawing animation logic
    // Each edge takes 0.05 scroll progress to draw
    const duration = 0.05;
    const startAt = edge.visibleAt;
    const isVisible = scrollProgress >= startAt;

    // Animate the drawing
    const drawProgress = Math.min(1, Math.max(0, (scrollProgress - startAt) / duration));

    // Parallax Logic to sync with Node.tsx
    // Node.tsx uses: Math.max(0, (node.visibleAt + 0.015 - scrollProgress) * 5) -> Percent (since we updated Node.tsx)
    const getParallaxY = (n: Node) => {
        return Math.max(0, (n.visibleAt + 0.015 - scrollProgress) * 5);
    };

    const x1 = fromNode.position.x;
    const y1 = fromNode.position.y;
    const x2 = toNode.position.x;
    const y2 = toNode.position.y;

    // Dynamic Source Height Offset
    // Dynamic Source Height Offset
    // Standard nodes are approx 20% height (increased due to Expand button).
    // Node 2 (expanded) is taller, approx 32%.
    // Check if the node is currently in the expanded state based on scroll progress
    const isExpanded = fromNode.expansion &&
        scrollProgress >= fromNode.expansion.triggerAt &&
        scrollProgress < fromNode.expansion.brainstormEndAt;

    // Precise offsets matching miniature node heights and port locations
    const getBaseOffset = () => {
        if (fromNode.id === 'node2') return 35; // Blue node is tall
        if (fromNode.id === 'node3') return 32; // Yellow node similarly tall
        return 21; // Root and child nodes are shorter
    };

    const baseOffset = getBaseOffset();
    const sourceHeightOffset = isExpanded ? 50 : baseOffset;

    // From Bottom Center of Source to Top Center of Target
    const fromY = y1 + sourceHeightOffset + getParallaxY(fromNode);
    const toY = y2 + getParallaxY(toNode);

    const cp1y = fromY + (toY - fromY) * 0.5;
    const cp2y = fromY + (toY - fromY) * 0.5;

    const path = `M ${x1} ${fromY} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${toY}`;

    if (!isVisible) return null;

    return (
        <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0 }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
        >
            <g style={{ opacity: Math.max(0, (drawProgress * 2) - 0.5) }}>
                {/* Outer Glow */}
                <path
                    d={path}
                    stroke="rgba(16, 185, 129, 0.08)"
                    strokeWidth="0.5"
                    fill="none"
                    strokeLinecap="round"
                />
                {/* Glass Core */}
                <path
                    d={path}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="0.2"
                    fill="none"
                    strokeLinecap="round"
                />
                {/* Detail Line (Mixed Green + White) */}
                <path
                    d={path}
                    stroke="rgba(16, 185, 129, 0.3)"
                    strokeWidth="0.1"
                    fill="none"
                    strokeLinecap="round"
                />
                {/* Animated draw line */}
                <path
                    d={path}
                    stroke="rgba(255, 255, 255, 0.6)"
                    strokeWidth="0.08"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="200"
                    strokeDashoffset={200 * (1 - drawProgress)}
                />
            </g>
        </svg>
    );
};

export default Edge;
