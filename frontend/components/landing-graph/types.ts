
export interface Node {
    id: string;
    title: string;
    content: string[];
    type: 'root' | 'child' | 'merge' | 'brainstorm';
    position: { x: number; y: number };
    color: string;
    visibleAt: number; // Scroll progress from 0 to 1
    expansion?: {
        triggerAt: number;
        loadingAt: number;
        optionsAt: number;
        brainstormAt: number;
        brainstormEndAt: number; // New: When the brainstorm visual disappears
        options: string[];
    };
}

export interface Edge {
    id: string;
    from: string;
    to: string;
    visibleAt: number;
}

export interface Document {
    id: string;
    name: string;
    size: string;
}

export interface AppState {
    scrollProgress: number;
}
