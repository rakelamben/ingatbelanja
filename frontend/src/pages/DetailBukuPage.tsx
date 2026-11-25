import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError, api, type Ledger, type RecentExpenseItem, type User } from "../lib/api";
import { Alert, EmptyState, LoadingState } from "../components/ui";
import { ledgerPath, scanReturnState } from "../lib/routes";
import { useSession } from "../context/SessionContext";
import { SiAddCircle, SiLink, SiWalletDetailed } from "@sargamicons/react/fill";
import { RecentExpenses } from "../components/RecentExpenses";
import { BudgetCard, type BudgetCardStatus } from "../components/BudgetCard";


type LedgerDetail = Ledger & { members: User[] };

function formatMoney(amount: number | null, currency: string) {
    if (amount == null) return "—";
    const minorUnit = currency === "IDR" ? 0 : 2;
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency,
        maximumFractionDigits: minorUnit,
    }).format(amount / 10 ** minorUnit);
}

export function DetailBukuPage() {
    const location = useLocation();
    const { ledgerId } = useParams();
    const { session } = useSession();
    const [ledger, setLedger] = useState<LedgerDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [budgetStatus, setBudgetStatus] = useState<BudgetCardStatus | null>(null);
    const [budgetDeleting, setBudgetDeleting] = useState(false);
    const [budgetError, setBudgetError] = useState("");
    const [items, setItems] = useState<RecentExpenseItem[]>([]);
    const [itemsLoading, setItemsLoading] = useState(true);
    const [itemsLoadingMore, setItemsLoadingMore] = useState(false);
    const [itemsError, setItemsError] = useState("");
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [itemsReloadTrigger, setItemsReloadTrigger] = useState(0);
    const itemsLoadingMoreRef = useRef(false);
    const activeLedgerIdRef = useRef(ledgerId);
    activeLedgerIdRef.current = ledgerId;

    useEffect(() => {
        if (!ledgerId) {
            setError("ID buku tidak ditemukan.");
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError("");
        api
            .ledger(ledgerId)
            .then((data) => {
                if (cancelled) return;
                setLedger(data);
                if (data.type === "tracker") {
                    api.budgetStatus(ledgerId)
                        .then((status) => {
                            if (cancelled) return;
                            if (status.limit_minor != null) {
                                setBudgetStatus({
                                    ...status,
                                    limit_minor: status.limit_minor,
                                });
                            } else {
                                setBudgetStatus(null);
                            }
                        })
                        .catch(() => {
                            if (!cancelled) setBudgetStatus(null);
                        });
                } else {
                    setBudgetStatus(null);
                }
            })
            .catch((cause) => {
                if (!cancelled) {
                    setError(
                        cause instanceof ApiError
                            ? cause.message
                            : "Tidak dapat memuat detail buku.",
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [ledgerId]);

    useEffect(() => {
        if (!ledgerId) return;

        let cancelled = false;
        itemsLoadingMoreRef.current = false;
        setItemsLoadingMore(false);
        setItems([]);
        setNextCursor(null);
        setItemsError("");
        setItemsLoading(true);
        api
            .recentExpenseItems(ledgerId, 20)
            .then((data) => {
                if (cancelled) return;
                setItems(data.items);
                setNextCursor(data.next_cursor);
            })
            .catch((cause) => {
                if (!cancelled) {
                    setItemsError(
                        cause instanceof ApiError
                            ? cause.message
                            : "Tidak dapat memuat riwayat pengeluaran.",
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setItemsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [itemsReloadTrigger, ledgerId]);

    const loadNextItems = useCallback(async () => {
        if (!ledgerId || !nextCursor || itemsLoadingMoreRef.current) return;

        const requestedLedgerId = ledgerId;
        itemsLoadingMoreRef.current = true;
        setItemsLoadingMore(true);
        setItemsError("");
        try {
            const data = await api.recentExpenseItems(requestedLedgerId, 20, nextCursor);
            if (activeLedgerIdRef.current !== requestedLedgerId) return;
            setItems((current) => {
                const existingIds = new Set(current.map((item) => item.id));
                return [...current, ...data.items.filter((item) => !existingIds.has(item.id))];
            });
            setNextCursor(data.next_cursor);
        } catch (cause) {
            if (activeLedgerIdRef.current === requestedLedgerId) {
                setItemsError(
                    cause instanceof ApiError
                        ? cause.message
                        : "Tidak dapat memuat riwayat pengeluaran.",
                );
            }
        } finally {
            if (activeLedgerIdRef.current === requestedLedgerId) {
                itemsLoadingMoreRef.current = false;
                setItemsLoadingMore(false);
            }
        }
    }, [ledgerId, nextCursor]);

    const retryItems = useCallback(() => {
        if (nextCursor) {
            void loadNextItems();
        } else {
            setItemsReloadTrigger((current) => current + 1);
        }
    }, [loadNextItems, nextCursor]);

    if (loading) return <LoadingState label="Memuat detail buku…" />;

    if (error || !ledger || !ledgerId) {
        return (
            <EmptyState
                title="Buku tidak tersedia"
                icon="alert"
                action={
                    <Link className="small-button" to="/app/books">
                        Kembali ke daftar buku
                    </Link>
                }
            >
                {error || "Buku ini tidak dapat dibuka."}
            </EmptyState>
        );
    }

    const otherMembers = ledger.members.filter(
        (member) => member.id !== session?.user.id,
    );
    const hasActiveBudget = ledger.type === "tracker" && budgetStatus != null;

    const handleDeleteBudget = async () => {
        if (!budgetStatus || budgetDeleting) return;
        if (
            typeof window !== "undefined" &&
            !window.confirm("Apakah kamu yakin ingin menghapus limit anggaran ini?")
        ) {
            return;
        }
        setBudgetDeleting(true);
        setBudgetError("");
        try {
            await api.deleteBudget(ledger.id, budgetStatus.period);
            setBudgetStatus(null);
        } catch (cause) {
            setBudgetError(
                cause instanceof ApiError
                    ? cause.message
                    : "Gagal menghapus batas anggaran.",
            );
        } finally {
            setBudgetDeleting(false);
        }
    };

    return (
        <section className="">
            <div className="flex flex-col mb-5 items-center mx-auto w-fit">
                <p className="text-5xl mb-4">🧾</p>
                <h1 className="text-xl font-bold capitalize">{ledger.name}</h1>
                <h1 className="text-3xl font-bold">{formatMoney(ledger.sum_spend, ledger.currency)}</h1>
            </div>

            <div
                className={`w-full my-3 grid gap-4 ${
                    ledger.type === "tracker"
                        ? hasActiveBudget
                            ? "grid-cols-2"
                            : "grid-cols-3"
                        : "grid-cols-1"
                }`}
            >
                <div className="flex flex-col items-center gap-2">
                    <Link
                        to={ledgerPath(ledger.id, "scan")}
                        state={scanReturnState(`${location.pathname}${location.search}`)}
                        className="flex rounded-md flex-col gap-2 items-center bg-(--color-accent) p-4 w-fit"
                    >
                        <SiAddCircle className="text-xl text-white" aria-hidden="true" />
                    </Link>
                    <span className="text-center  font-medium">Pengeluaran</span>

                </div>
                {ledger.type === "tracker" && (
                    <>
                        <div className="flex flex-col items-center gap-2">
                            <Link
                                to={ledgerPath(ledger.id, "scan")}
                                state={scanReturnState(`${location.pathname}${location.search}`)}
                                className="flex rounded-md flex-col gap-2 items-center bg-(--color-accent) p-4 w-fit"
                            >
                                <SiLink className="text-xl text-white" aria-hidden="true" />
                            </Link>
                            <span className="text-center font-medium">Undang teman</span>

                        </div>
                        {!hasActiveBudget && (
                            <div className="flex flex-col items-center gap-2">
                                <Link
                                    to={ledgerPath(ledger.id, "budget")}
                                    className="flex rounded-md flex-col gap-2 items-center bg-(--color-accent) p-4 w-fit"
                                >
                                    <SiWalletDetailed className="text-xl text-white" aria-hidden="true" />
                                </Link>
                                <span className="text-center font-medium">Buat Anggaran</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {budgetError && (
                <Alert variant="error" onDismiss={() => setBudgetError("")} className="mt-3">
                    {budgetError}
                </Alert>
            )}

            {hasActiveBudget && budgetStatus && (
                <BudgetCard
                    ledgerId={ledger.id}
                    currency={ledger.currency}
                    status={budgetStatus}
                    canManage={ledger.role === "owner"}
                    deleting={budgetDeleting}
                    onDelete={handleDeleteBudget}
                />
            )}

            {otherMembers.length > 0 && (
                <ul className="flex flex-col bg-white divide-y divide-gray-100 rounded-lg overflow-hidden mt-6">
                    <p className="px-5 py-3 font-bold">Teman Terlibat</p>
                    {otherMembers.map((member) => (
                        <li className="flex bg-olive-200 flex-row gap-4 items-center px-5 py-3" key={member.id}>
                            <strong>{member.display_name || member.username}</strong>
                            <small>@{member.username}</small>
                        </li>
                    ))}
                </ul>
            ) }

            <RecentExpenses
                ledgerId={ledger.id}
                items={items}
                loading={itemsLoading}
                formatAmount={formatMoney}
                error={itemsError}
                onRetry={retryItems}
                groupByMonth
                showAllLink={false}
                hasMore={Boolean(nextCursor)}
                loadingMore={itemsLoadingMore}
                onLoadMore={loadNextItems}
            />

        </section>
    );
}