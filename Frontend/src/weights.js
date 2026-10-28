export function rebalanceWeights(values, index, target) {
    const current = values.map(v => Math.max(0, Math.round(Number(v) || 0)));
    let wanted = Math.round(Number(target));
    if (!Number.isFinite(wanted)) return { values: current, changed: [] };
    wanted = Math.max(0, Math.min(100, wanted));
    if (wanted === current[index]) return { values: current, changed: [] };

    const others = current.map((_, i) => i).filter(i => i !== index && current[i] > 0);
    if (others.length === 0) {
        return { values: current, changed: [], blocked: 'At least one metric must stay above 0. Raise another metric first.' };
    }

    wanted = Math.min(wanted, 100 - others.length);
    if (wanted === current[index]) return { values: current, changed: [] };

    const remaining = 100 - wanted;
    const othersTotal = others.reduce((sum, i) => sum + current[i], 0);
    const exact = new Map(others.map(i => [i, current[i] * remaining / othersTotal]));

    const next = [...current];
    next[index] = wanted;
    for (const i of others) next[i] = Math.max(1, Math.floor(exact.get(i)));

    let difference = remaining - others.reduce((sum, i) => sum + next[i], 0);
    const largest = [...others].sort((a, b) => exact.get(b) - exact.get(a) || a - b)[0];
    if (difference > 0) next[largest] += difference;
    while (difference < 0) {
        const i = [...others].sort((a, b) => next[b] - next[a])[0];
        if (next[i] <= 1) break;
        next[i] -= 1;
        difference += 1;
    }

    return { values: next, changed: others.filter(i => next[i] !== current[i]) };
}