import { Link } from "react-router-dom";
import { ledgerPath } from "../lib/routes";
import { Button } from "./ui";

export type BudgetCardStatus = {
  period: string;
  start_date: string | null;
  end_date: string | null;
  limit_minor: number;
  spent_minor: number;
  ratio_bp: number | null;
  level: string;
};

type BudgetCardProps = {
  ledgerId: string;
  currency: string;
  status: BudgetCardStatus;
  canManage: boolean;
  deleting?: boolean;
  onDelete: () => void;
};

function formatMoney(amount: number, currency: string) {
  const minorUnit = currency === "IDR" ? 0 : 2;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: minorUnit,
  }).format(amount / 10 ** minorUnit);
}

function formatDateLabel(dateStr: string) {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatPeriodLabel(status: BudgetCardStatus) {
  if (status.period === "CUSTOM" && status.end_date) {
    return `Hingga ${formatDateLabel(status.end_date)}`;
  }
  if (status.period === "ALL") {
    return "Tanpa batas waktu";
  }
  return `Periode ${status.period}`;
}

export function BudgetCard({
  ledgerId,
  currency,
  status,
  canManage,
  deleting = false,
  onDelete,
}: BudgetCardProps) {
  const ratio = Math.min(status.ratio_bp ?? 0, 10000);
  const percentText = `${Math.round(ratio / 100)}%`;

  return (
    <article className={`budget-meter ${status.level}`} aria-label="Informasi target anggaran">
      <div className="budget-meter-head">
        <div><strong>Limit</strong> Hingga <strong>{formatPeriodLabel(status)}</strong></div>
        <strong className="text-lg">
          {formatMoney(status.spent_minor, currency)} / {formatMoney(status.limit_minor, currency)}
        </strong>
      </div>

      <div
        className="meter-track"
        role="progressbar"
        aria-valuenow={ratio / 100}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Persentase pemakaian anggaran"
      >
        <span style={{ width: `${ratio / 100}%` }} />
      </div>

      <p>
        {status.level === "over"
          ? `Anggaran terlampaui (${percentText}). Kurangi pengeluaran baru.`
          : status.level === "warning"
            ? `Peringatan: pemakaian sudah mencapai ${percentText} dari target.`
            : `Pemakaian saat ini ${percentText} — masih dalam batas aman.`}
      </p>

      {canManage && (
        <div className="flex flex-row gap-2 mt-4">
          <Link
            to={`${ledgerPath(ledgerId, "budget")}?edit=1`}
            className="secondary-button flex-1 text-center text-sm"
          >
            Edit Limit
          </Link>
          <Button
            type="button"
            variant="danger"
            className="flex-1 text-sm"
            loading={deleting}
            disabled={deleting}
            onClick={onDelete}
          >
            Hapus Limit
          </Button>
        </div>
      )}
    </article>
  );
}
