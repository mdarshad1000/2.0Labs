
import { Node, Edge, Document } from './types';

export const INITIAL_DOCUMENTS: Document[] = [
    { id: 'doc1', name: 'Interogo_Holding_AG_Annual_Report_2020.pdf', size: '2521 KB' },
    { id: 'doc2', name: 'Interogo_Holding_AG_Annual_Report_2021.pdf', size: '1519 KB' },
    { id: 'doc3', name: 'Interogo_Holding_AG_Annual_Report_2022.pdf', size: '5516 KB' },
];

export const INITIAL_NODES: Node[] = [
    {
        id: 'root',
        title: 'what actually changed over the last 3 years',
        content: ['3 documents analyzed'],
        type: 'root',
        position: { x: 50, y: 15 },
        color: 'slate',
        visibleAt: 0.50, // Starts after intro morph
    },
    {
        id: 'node1',
        title: 'Key Developments in Interogo Holding 2020',
        content: [
            'Interogo Holding focused on strategic diversification across various sectors.',
            'Financial performance showed resilience with steady revenue streams.',
            'Sustainability and corporate responsibility initiatives were prioritized.'
        ],
        type: 'child',
        position: { x: 22, y: 48 },
        color: 'amber',
        visibleAt: 0.56,
    },
    {
        id: 'node2',
        title: '2021 Annual Report Key Developments',
        content: [
            'Report highlights a significant increase in revenue compared to previous year.',
            'Strategic initiatives included a focus on sustainability and digital transformation.',
            'Operational efficiencies contributed to improved profitability margins.'
        ],
        type: 'child',
        position: { x: 50, y: 52 },
        color: 'sky',
        visibleAt: 0.64,
        expansion: {
            triggerAt: 0.66,
            loadingAt: 0.68,
            optionsAt: 0.72,
            brainstormAt: 0.77,
            brainstormEndAt: 0.83,
            options: [
                'Analyze investment strategy evolution from 2020 to 2022.',
                'Evaluate impact of sustainable investments on 2021 financial metrics.',
                'Quantify operational efficiency gains in 2022 financial outcomes.'
            ]
        }
    },
    {
        id: 'node3',
        title: "Key Developments in 2022 Annual Report",
        content: [
            'Significant strategic initiatives aimed at enhancing investment portfolios.',
            'Financial performance indicated a robust recovery post-pandemic.',
            'Sustainability and innovation highlighted as core components.'
        ],
        type: 'child',
        position: { x: 78, y: 48 },
        color: 'amber',
        visibleAt: 0.59,
    },
    {
        id: 'node4',
        title: 'Sustainable Investment Impact',
        content: [
            'ESG criteria integrated into 85% of new portfolios.',
            'Renewable energy segment outperformed traditional energy by 22%.'
        ],
        type: 'child',
        position: { x: 35, y: 92 },
        color: 'emerald',
        visibleAt: 0.88,
    },
    {
        id: 'node5',
        title: 'Efficiency Gains Deep Dive',
        content: [
            'Automation reduced reporting latency by 12 days.',
            'Cost-to-income ratio improved by 450 basis points.'
        ],
        type: 'child',
        position: { x: 65, y: 92 },
        color: 'emerald',
        visibleAt: 0.94,
    }
];

export const INITIAL_EDGES: Edge[] = [
    { id: 'e1', from: 'root', to: 'node1', visibleAt: 0.53 },
    { id: 'e2', from: 'root', to: 'node2', visibleAt: 0.58 },
    { id: 'e3', from: 'root', to: 'node3', visibleAt: 0.55 },
    { id: 'e4', from: 'node2', to: 'node4', visibleAt: 0.84 },
    { id: 'e5', from: 'node2', to: 'node5', visibleAt: 0.90 },
];
