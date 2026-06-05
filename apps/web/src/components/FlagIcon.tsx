export function FlagIcon({ code, label = 'Bandera' }: { code?: string | null; label?: string }) {
  const normalized = normalizeFlagCode(code);

  if (!normalized) {
    return (
      <span className="inline-flex h-5 w-7 items-center justify-center rounded bg-slate-700 text-xs" aria-label="Bandera no definida" title="Bandera no definida">
        —
      </span>
    );
  }

  return (
    <span
      className={`fi fi-${normalized} inline-block rounded-sm shadow-sm`}
      aria-label={label}
      title={label}
    />
  );
}

export function normalizeFlagCode(code?: string | null) {
  if (!code) return '';
  return code.trim().toLowerCase();
}
