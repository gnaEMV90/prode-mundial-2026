const donationUrl = String(import.meta.env.VITE_DONATION_URL || '').trim();

export function DonationCard() {
  if (!donationUrl) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-black text-white">Apoyá el proyecto</h2>
          <p className="mt-1 text-sm text-slate-300">
            Este Prode es gratis. Si querés donar o apoyar proyectos como este, podés colaborar por Mercado Pago.
          </p>
        </div>

        <a
          href={donationUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl bg-amber-300 px-5 py-3 text-center font-black text-slate-950 hover:bg-amber-200"
        >
          Donar por Mercado Pago
        </a>
      </div>
    </div>
  );
}

export function DonationFooterLink() {
  if (!donationUrl) {
    return null;
  }

  return (
    <a href={donationUrl} target="_blank" rel="noreferrer" className="font-bold text-amber-200 hover:text-amber-100">
      Apoyar el proyecto
    </a>
  );
}
