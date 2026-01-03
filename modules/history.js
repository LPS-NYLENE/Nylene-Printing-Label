import { state } from './state.js';

const HISTORY_KEY = 'print_history_v1';

export function loadHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function buildHistoryRecord() {
    const group = state.activeGroup || '';
    const letter = group ? state.source[group] || '' : '';
    const source = group && letter ? `${group.toUpperCase()}-${letter}` : 'NA';
    const special = state.source.special ? ` (${state.source.special})` : '';
    return {
        timestamp: new Date().toISOString(),
        source: `${source}${special}`,
        product: state.bigCode || '',
        boxNumber: state.unitNumber || '',
        weight: Number(state.weights?.netLb || 0),
    };
}

export function appendHistoryRecord() {
    const history = loadHistory();
    history.push(buildHistoryRecord());
    saveHistory(history);
}

