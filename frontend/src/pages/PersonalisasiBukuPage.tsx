import { useState, type SubmitEvent } from "react"
import { ApiError, api, type Ledger } from "../lib/api";
import { SiBook } from '@sargamicons/react/duotone';
import { useNavigate } from "react-router-dom";




export function PersonalisasiBukuPage() {
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [currency, setCurrency] = useState("IDR");
    const [error, setError] = useState("");
    const [creating, setCreating] = useState(false);

    const money = (value: number | null, currency: string) => {
        if (value == null) return "—";
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency,
            maximumFractionDigits: currency === "IDR" ? 0 : 2,
        }).format(value / (currency === "IDR" ? 1 : 100)).replace(/[\u00a0\u202f]/g, "");
    };
    const create = async (event: SubmitEvent<HTMLFormElement>) => {
        if(!creating) {
            event.preventDefault();
            setError("");
            setCreating(true);
            try {
              await api.createTracker(name, currency);
              setName("");
              navigate("/app/books", { replace: true });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Pelacak gagal dibuat.");
            } finally {
              setCreating(false);
            }
        }
      };

    return (
        <div className="flex flex-col items-center w-full">
            <div
                className="flex flex-col w-1/2 bg-white px-4 py-4 rounded-lg mb-5"
            >
                <div className="tracker-symbol mb-3" aria-hidden="true">
                    <SiBook />
                </div>
                <div className="flex flex-col capitalize">
                    <p className="text-lg font-bold text-black/50 truncate">{name == "" ? "-": name}</p>
                    <p className="text-md font-bold">
                        {money(0, currency)}
                    </p>
                </div>
            </div>
            <form onSubmit={create} className="w-full">
                <div className="flex flex-col items-start w-full gap-2 mb-5">
                    <label htmlFor="tracker-create-name" className="font-semibold">
                        Nama Buku
                    </label>
                    <input
                        id="tracker-create-name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Rumah, Liburan, Kantor"
                        className="w-full px-5 bg-olive-200 py-4 rounded-md"
                    />
                </div>
                <div className="flex flex-col items-start w-full gap-2 mb-6">
                    <label htmlFor="tracker-create-name" className="font-semibold">
                        Mata Uang
                    </label>
                    <select
                        id="ttracker-create-currency"
                        required
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full px-5 bg-olive-200 py-4 rounded-md"
                    >
                        <option value="IDR">IDR (Rupiah)</option>
                        <option value="USD">USD (Dolar AS)</option>
                        <option value="SGD">SGD (Dolar Singapura)</option>
                    </select>
                </div>
                <button type="submit" disabled={creating} className={`disabled:opacity-70 px-5 py-3 bg-(--color-accent) w-full text-white rounded-md`}>
                    Buat buku
                </button>
                <p className="my-5 text-sm px-5">{error}</p>
            </form>
        </div>
    )
}