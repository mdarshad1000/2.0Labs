import React from 'react';
import { INITIAL_NODES, INITIAL_EDGES } from './constants';
import Node from './Node';
import Edge from './Edge';
import LandingSidebar from './LandingSidebar';
import LandingSearchBar from './LandingSearchBar';

interface GraphAnimationProps {
    scrollProgress: number;
}

const GraphAnimation: React.FC<GraphAnimationProps> = ({ scrollProgress }) => {
    // Camera Shift Logic - simulate panning down as the graph expands
    // Shift starts after the graph has grown a bit (around node 2 expansion)
    const shiftStart = 0.65;
    const shiftEnd = 0.85;
    let viewTranslateY = 0;

    if (scrollProgress >= shiftStart) {
        const shiftProgress = Math.min(1, (scrollProgress - shiftStart) / (shiftEnd - shiftStart));
        // Shift up by 37% (moves Node 2 from 52% to 15%, exactly replacing Root)
        viewTranslateY = -37 * shiftProgress;
    }

    return (
        <div
            className="absolute inset-0 graph-grid-bg bg-[#030a06]"
            style={{ zIndex: 0 }}
        >
            <LandingSidebar scrollProgress={scrollProgress} />
            <LandingSearchBar scrollProgress={scrollProgress} />

            <div className="relative w-full h-full overflow-hidden">
                <div
                    className="absolute inset-0"
                    style={{ transform: `translateY(${viewTranslateY}%)` }}
                >
                    {/* Render Lines (Edges) First so they are behind nodes */}
                    {INITIAL_EDGES.map(edge => (
                        <Edge
                            key={edge.id}
                            edge={edge}
                            nodes={INITIAL_NODES}
                            scrollProgress={scrollProgress}
                        />
                    ))}

                    {/* Render Nodes */}
                    {INITIAL_NODES.map(node => (
                        <Node
                            key={node.id}
                            node={node}
                            scrollProgress={scrollProgress}
                        />
                    ))}
                </div>
            </div>

            {/* Optional: Add a vignette for better focus, matching main app feel */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,#030a06_100%)] opacity-40" />
        </div>
    );
};

export default GraphAnimation;

