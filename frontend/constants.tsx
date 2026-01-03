// Demo data for Hero Landing scroll animation
export const DEMO_DATA = {
  company: 'ACME Corp',
  documents: [
    { id: 'doc-1', name: 'Q4_2024_Financials.pdf', type: 'PDF', shortId: 'N_N_41AE64' },
    { id: 'doc-2', name: 'Investor_Deck.pdf', type: 'PDF', shortId: 'N_N_3AE32B' },
    { id: 'doc-3', name: 'Revenue_Model.xlsx', type: 'Excel', shortId: 'N_N_3C5A23' },
    { id: 'doc-4', name: 'Customer_Data.csv', type: 'CSV', shortId: 'N_N_1E178C' },
    { id: 'doc-5', name: 'Board_Minutes.pdf', type: 'PDF', shortId: 'N_N_485534' },
    { id: 'doc-6', name: 'Cap_Table.xlsx', type: 'Excel', shortId: 'N_N_7F2E91' },
  ],
  metrics: [
    { id: 'revenue', label: 'Revenue', description: 'Total Annual Revenue' },
    { id: 'ebitda', label: 'EBITDA', description: 'Earnings before interest, taxes, depreciation' },
    { id: 'burn', label: 'Burn Rate', description: 'Monthly cash burn' },
    { id: 'focus', label: 'Strategic Focus', description: 'Key strategic priorities' },
  ],
  cells: {
    'doc-1': {
      'revenue': { value: '$12.4M ARR', confidence: 'High' },
      'ebitda': { value: '-$2.1M', confidence: 'High' },
      'burn': { value: '$890K/mo', confidence: 'Medium' },
      'focus': { value: 'Growth, Market Expansion', confidence: 'High', fullText: 'The company is focused on aggressive growth through market expansion into APAC and EMEA regions, with emphasis on enterprise sales motion and strategic partnerships.' },
    },
    'doc-2': {
      'revenue': { value: '$12.4M ARR', confidence: 'High' },
      'ebitda': { value: '-$1.8M', confidence: 'Medium' },
      'burn': { value: '$850K/mo', confidence: 'Low' },
      'focus': { value: 'Product Innovation', confidence: 'Medium', fullText: 'Investment priorities center on AI/ML capabilities and platform modernization to maintain competitive differentiation.' },
    },
    'doc-3': {
      'revenue': { value: '$14.2M (Proj)', confidence: 'Medium' },
      'ebitda': { value: '$0.3M', confidence: 'Low' },
      'burn': { value: '$720K/mo', confidence: 'High' },
      'focus': { value: 'Cost Optimization', confidence: 'High', fullText: 'Projections assume 15% reduction in operational costs through automation and vendor consolidation by Q2 2025.' },
    },
    'doc-4': {
      'revenue': { value: '$11.8M', confidence: 'High' },
      'ebitda': { value: '-$2.4M', confidence: 'Medium' },
      'burn': { value: '$920K/mo', confidence: 'High' },
      'focus': { value: 'Customer Retention', confidence: 'High', fullText: 'Customer success initiatives targeting 95% retention with expansion revenue from existing accounts driving 40% of growth.' },
    },
    'doc-5': {
      'revenue': { value: '$12.0M', confidence: 'Medium' },
      'ebitda': { value: '-$1.9M', confidence: 'Low' },
      'burn': { value: '$880K/mo', confidence: 'Medium' },
      'focus': { value: 'Governance, Risk', confidence: 'Medium', fullText: 'Board approved new risk management framework and compliance protocols for SOC2 Type II certification.' },
    },
    'doc-6': {
      'revenue': { value: '—', confidence: 'Low' },
      'ebitda': { value: '—', confidence: 'Low' },
      'burn': { value: '$875K/mo', confidence: 'High' },
      'focus': { value: 'Series B Prep', confidence: 'High', fullText: 'Cap table restructured for Series B with 20% ESOP expansion and secondary liquidity provisions for early investors.' },
    },
  },
  chatDemo: {
    question: "What's ACME's current burn rate?",
    answer: "Based on Q4 financials [1], ACME Corp has a monthly burn rate of $890K/mo with a runway of 14 months.",
    citation: { doc: 'Q4_2024_Financials.pdf', metric: 'Burn Rate' }
  }
};
