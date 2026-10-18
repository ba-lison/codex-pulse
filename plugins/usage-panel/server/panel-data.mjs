const clamp = (value) => Math.max(0, Math.min(100, value));

export function toPanelData(result) {
  const byId = result?.rateLimitsByLimitId;
  const account = byId?.codex ?? result?.rateLimits;
  if (!account) throw new Error('A conta não retornou os limites do Codex.');
  const makeWindow = (id, label, window) => {
    const used = window?.usedPercent;
    const usedPercent = typeof used === 'number' && Number.isFinite(used) ? clamp(used) : null;
    const reset = window?.resetsAt;
    const validReset = typeof reset === 'number' && Number.isFinite(reset) && reset > 0 && reset < 8640000000000;
    return {
      id, label,
      usedPercent,
      remainingPercent: usedPercent === null ? null : 100 - usedPercent,
      resetsAt: validReset ? new Date(reset * 1000).toISOString() : null,
      windowDurationMins: typeof window?.windowDurationMins === 'number' && window.windowDurationMins > 0 ? window.windowDurationMins : null,
    };
  };
  const plan = typeof account.planType === 'string' && account.planType ? account.planType : null;
  return {
    source: 'codex-app-server',
    plan: plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : 'ChatGPT',
    windows: [makeWindow('primary', 'Janela de 5 horas', account.primary)],
    timeZone: 'America/Sao_Paulo',
    updatedAt: new Date().toISOString(),
  };
}
