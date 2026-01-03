import { showScreen } from '../state.js';

export function initLabelDatabaseStep() {
    const back = document.getElementById('backToPreview');
    if (back) back.addEventListener('click', () => showScreen('preview'));
}

