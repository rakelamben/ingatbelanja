from __future__ import annotations

import json
import re
import httpx


class LLMUnavailable(RuntimeError):
    pass


class NoneLLM:
    def answer(self, question, context, tools):
        raise LLMUnavailable("LLM is unavailable")


def _format_amount(amount_minor: int | None, currency: str = "IDR") -> str:
    if amount_minor is None:
        return "-"
    if currency == "IDR":
        return f"Rp {amount_minor:,}".replace(",", ".")
    return f"{currency} {amount_minor / 100:,.2f}"


def _detect_period(q: str) -> str:
    if "kemarin" in q:
        return "yesterday"
    if "hari ini" in q:
        return "today"
    if "bulan lalu" in q:
        return "last_month"
    if "minggu" in q or "7 hari" in q:
        return "last_7_days"
    if "30 hari" in q:
        return "last_30_days"
    return "this_month"


def _detect_group_by(q: str) -> str:
    if "kategori" in q:
        return "category"
    if "merchant" in q or "toko" in q:
        return "merchant"
    if "hari" in q or "harian" in q or "rata-rata" in q:
        return "day"
    return "none"


def classify_intent(question: str) -> dict[str, str]:
    q = question.casefold().strip()
    period = _detect_period(q)
    group_by = _detect_group_by(q)

    if any(
        phrase in q
        for phrase in ("daftar buku", "buku apa", "daftar dompet", "dompet apa", "ledger yang")
    ):
        return {"intent": "list_ledgers", "period": period, "group_by": group_by, "keyword": ""}

    if any(
        word in q
        for word in ("anggaran", "budget", "limit", "batas pengeluaran", "sisa limit")
    ):
        return {"intent": "budget_status", "period": period, "group_by": group_by, "keyword": ""}

    if any(word in q for word in ("cari ", "pernah beli", "harga ")):
        match = re.search(r"(?:cari|pernah beli|harga)\s+([a-z0-9\s-]{1,40})", q)
        kw = (match.group(1).strip().split()[0] if match and match.group(1).strip() else "item")[:40]
        return {"intent": "search_items", "period": period, "group_by": group_by, "keyword": kw}

    if any(
        word in q
        for word in (
            "belanja",
            "pengeluaran",
            "struk",
            "total",
            "makan",
            "item",
            "kategori",
            "toko",
            "merchant",
            "hari",
            "kemarin",
            "minggu",
            "bulan",
            "rata-rata",
            "bandingkan",
        )
    ):
        return {
            "intent": "spending_summary",
            "period": period,
            "group_by": group_by,
            "keyword": "",
        }

    if any(
        word in q
        for word in ("halo", "hai", "hi", "selamat", "terima kasih", "makasih", "bantuan", "help")
    ):
        return {"intent": "greeting", "period": period, "group_by": group_by, "keyword": ""}

    return {"intent": "out_of_scope", "period": period, "group_by": group_by, "keyword": ""}


class FakeLLM:
    def answer(self, question, context, tools):
        classified = classify_intent(question)
        intent = classified["intent"]
        period = classified["period"]
        group_by = classified["group_by"]

        if intent == "greeting":
            return {
                "content": (
                    "Halo! Aku bisa membantumu mengecek total pengeluaran, kategori terbesar, "
                    "pencarian item, dan status anggaran dari buku yang sedang dipantau."
                ),
                "tool_calls": [],
            }

        if intent == "out_of_scope":
            return {
                "content": "Aku hanya bisa membantu membaca data pengeluaran dan anggaran belanjamu.",
                "tool_calls": [],
            }

        ledgers = tools.list_ledgers()
        if intent == "list_ledgers":
            names = ", ".join(item["name"] for item in ledgers) or "-"
            return {
                "content": f"Saat ini aku memantau {len(ledgers)} buku: {names}.",
                "tool_calls": [{"name": "list_ledgers", "result": {"ledgers": ledgers}}],
            }

        if intent == "budget_status":
            calls = []
            parts = []
            for book in ledgers:
                res = tools.budget_status(book["ref"])
                calls.append({"name": "get_budget_status", "result": res})
                if res["limit_minor"] is not None:
                    parts.append(
                        f"{res['ledger_name']}: terpakai {_format_amount(res['spent_minor'], res['currency'])} "
                        f"dari batas {_format_amount(res['limit_minor'], res['currency'])} ({res['level']})"
                    )
            content = (
                "Status anggaran saat ini: " + "; ".join(parts) + "."
                if parts
                else "Belum ada batas anggaran aktif pada buku yang dipantau."
            )
            return {"content": content, "tool_calls": calls}

        if intent == "search_items":
            kw = classified["keyword"] or "item"
            calls = []
            total_count = 0
            for book in ledgers:
                res = tools.search_items(book["ref"], kw, period)
                calls.append({"name": "search_items", "result": res})
                total_count += res["count"]
            return {
                "content": f"Ditemukan {total_count} item belanja untuk '{kw}'.",
                "tool_calls": calls,
            }

        calls = []
        summaries = []
        for book in ledgers:
            res = tools.summary(book["ref"], period, group_by)
            calls.append({"name": "get_spending_summary", "result": res})
            summaries.append(res)

        if len(summaries) == 1:
            only = summaries[0]
            desc = (
                f"Total pengeluaran di {only['ledger_name']} adalah "
                f"{_format_amount(only['total_minor'], only['currency'])} dari {only['count']} struk."
            )
            if only.get("groups"):
                desc += f" Terdapat {len(only['groups'])} kelompok data."
        else:
            details = "; ".join(
                f"{s['ledger_name']}: {_format_amount(s['total_minor'], s['currency'])} ({s['count']} struk)"
                for s in summaries
            )
            desc = f"Ringkasan pengeluaran dari {len(summaries)} buku yang dipantau — {details}."
        return {"content": desc, "tool_calls": calls}


GROQ_CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_spending_summary",
            "description": "Mendapatkan total pengeluaran dan ringkasan transaksi belanja pengguna berdasarkan periode waktu dan jenis pengelompokan.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ledger": {
                        "type": "string",
                        "description": "Rujukan buku pengeluaran ('personal' untuk buku pribadi, atau 't1', 't2' untuk ruang bersama).",
                        "default": "personal",
                    },
                    "period": {
                        "type": "string",
                        "enum": [
                            "today",
                            "yesterday",
                            "last_7_days",
                            "last_30_days",
                            "this_month",
                            "last_month",
                        ],
                        "description": "Periode waktu belanja yang ditanyakan.",
                        "default": "this_month",
                    },
                    "group_by": {
                        "type": "string",
                        "enum": ["none", "category", "day", "merchant"],
                        "description": "Pengelompokan rincian pengeluaran: 'category' (kategori), 'merchant' (nama toko/tempat belanja), 'day' (per tanggal/hari), atau 'none' (hanya total agregat).",
                        "default": "none",
                    },
                },
                "required": ["ledger"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_items",
            "description": "Mencari item belanja tertentu berdasarkan kata kunci nama barang di dalam struk.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ledger": {
                        "type": "string",
                        "description": "Rujukan buku pengeluaran ('personal', 't1', dll).",
                        "default": "personal",
                    },
                    "keyword": {
                        "type": "string",
                        "description": "Kata kunci nama barang yang dicari (maksimal 40 karakter).",
                    },
                    "period": {
                        "type": "string",
                        "enum": [
                            "today",
                            "yesterday",
                            "last_7_days",
                            "last_30_days",
                            "this_month",
                            "last_month",
                        ],
                        "description": "Periode waktu pencarian.",
                        "default": "this_month",
                    },
                },
                "required": ["ledger", "keyword"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_budget_status",
            "description": "Melihat status batas anggaran (limit) dan total terpakai pada buku pengeluaran.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ledger": {
                        "type": "string",
                        "description": "Rujukan buku pengeluaran ('personal', 't1', dll).",
                        "default": "personal",
                    },
                },
                "required": ["ledger"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_ledgers",
            "description": "Melihat daftar buku pengeluaran yang sedang dipantau pengguna.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
]


class GroqLLM:
    def __init__(self, settings):
        self.settings = settings

    def answer(self, question, context, tools):
        if not self.settings.groq_api_key:
            raise LLMUnavailable("Groq API key is missing")

        classified = classify_intent(question)
        if classified["intent"] == "out_of_scope":
            return {
                "content": "Aku hanya bisa membantu membaca data pengeluaran dan anggaran belanjamu.",
                "tool_calls": [],
            }

        watched = context.get("watched_ledgers") or tools.list_ledgers()
        watched_desc = ", ".join(
            f"{item['ref']} ({item['name']}, {item['currency']})" for item in watched
        )

        system_instruction = (
            "Kamu adalah asisten keuangan cerdas IngatBelanjaan. "
            "Tugasmu membantu pengguna melihat dan memahami data pengeluaran mereka secara akurat.\n"
            f"Buku yang sedang dipantau pengguna: {watched_desc}.\n"
            f"Perkiraan intent pertanyaan: {classified['intent']} (periode: {classified['period']}, group_by: {classified['group_by']}).\n"
            "Aturan penting:\n"
            "1. Selalu gunakan tool yang tersedia untuk mengambil data riil dari buku yang dipantau. Jangan mengarang angka atau data.\n"
            "2. Jika lebih dari 1 buku dipantau dan pengguna tidak menyebut buku tertentu, panggil tool untuk buku-buku yang dipantau lalu rangkum per buku.\n"
            "3. Gunakan Bahasa Indonesia yang sopan, ramah, dan ringkas.\n"
            "4. Salin nilai atau angka dari hasil tool secara akurat.\n"
        )

        messages = [{"role": "system", "content": system_instruction}]

        for msg in context.get("history", []):
            role = "assistant" if msg.get("role") == "assistant" else "user"
            content = msg.get("content")
            if content:
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": question})

        headers = {
            "Authorization": f"Bearer {self.settings.groq_api_key}",
            "Content-Type": "application/json",
        }

        try:
            executed_tools = []
            max_rounds = max(1, int(getattr(self.settings, "llm_max_tool_calls", 5)))
            for round_idx in range(max_rounds + 1):
                body = {
                    "model": self.settings.groq_model,
                    "messages": messages,
                    "max_tokens": self.settings.llm_max_output_tokens,
                }
                if round_idx < max_rounds:
                    body["tools"] = GROQ_CHAT_TOOLS
                    body["tool_choice"] = "auto"

                response = httpx.post(
                    f"{self.settings.groq_base_url}/chat/completions",
                    headers=headers,
                    json=body,
                    timeout=self.settings.llm_timeout_s,
                )
                response.raise_for_status()
                choice = response.json()["choices"][0]
                message = choice["message"]
                tool_calls = message.get("tool_calls") or []

                if not tool_calls:
                    return {
                        "content": str(message.get("content") or "")[:4000],
                        "tool_calls": executed_tools,
                    }

                messages.append(message)
                for call in tool_calls:
                    func_name = call.get("function", {}).get("name")
                    raw_args = call.get("function", {}).get("arguments", "{}")
                    try:
                        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    except Exception:
                        args = {}

                    tool_result = {}
                    try:
                        if func_name == "get_spending_summary":
                            tool_result = tools.summary(
                                ledger=args.get("ledger", "personal"),
                                period=args.get("period", "this_month"),
                                group_by=args.get("group_by", "none"),
                            )
                        elif func_name == "search_items":
                            tool_result = tools.search_items(
                                ledger=args.get("ledger", "personal"),
                                keyword=args.get("keyword", "")[:40],
                                period=args.get("period", "this_month"),
                            )
                        elif func_name == "get_budget_status":
                            tool_result = tools.budget_status(
                                ledger=args.get("ledger", "personal"),
                            )
                        elif func_name == "list_ledgers":
                            tool_result = {"ledgers": tools.list_ledgers()}
                    except Exception as err:
                        tool_result = {"error": str(err)}

                    executed_tools.append({"name": func_name, "result": tool_result})
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.get("id"),
                            "name": func_name,
                            "content": json.dumps(tool_result, ensure_ascii=False),
                        }
                    )

            return {"content": "", "tool_calls": executed_tools}

        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            raise LLMUnavailable(f"Groq request failed: {error}") from error


def build_llm(settings):
    if settings.llm_provider == "none":
        return NoneLLM()
    if settings.llm_provider == "groq":
        return GroqLLM(settings)
    return FakeLLM()
