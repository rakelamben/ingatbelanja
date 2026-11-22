from __future__ import annotations

import json
import httpx


class LLMUnavailable(RuntimeError):
    pass


class NoneLLM:
    def answer(self, question, context, tools):
        raise LLMUnavailable("LLM is unavailable")


class FakeLLM:
    def answer(self, question, context, tools):
        q = question.casefold()
        if not any(
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
            )
        ):
            return {
                "content": "Aku hanya bisa membantu membaca data pengeluaran.",
                "tool_calls": [],
            }

        # Determine period
        period = "this_month"
        if "kemarin" in q:
            period = "yesterday"
        elif "hari ini" in q:
            period = "today"
        elif "bulan lalu" in q:
            period = "last_month"
        elif "minggu" in q or "7 hari" in q:
            period = "last_7_days"
        elif "30 hari" in q:
            period = "last_30_days"

        # Determine grouping
        group_by = "none"
        if "kategori" in q:
            group_by = "category"
        elif "merchant" in q or "toko" in q:
            group_by = "merchant"
        elif "hari" in q or "harian" in q:
            group_by = "day"

        # If keyword search requested
        if "cari" in q:
            kw = q.split("cari")[-1].strip()
            kw = kw.split()[0] if kw else "item"
            res = tools.search_items("personal", kw[:40], period)
            return {
                "content": f"Ditemukan {res['count']} item belanja untuk '{kw}'.",
                "tool_calls": [{"name": "search_items", "result": res}],
            }

        result = tools.summary("personal", period, group_by)
        desc = f"Total pengeluaran bulan ini adalah {result['total_minor']} dari {result['count']} struk."
        if result.get("groups"):
            desc += f" Terdapat {len(result['groups'])} kelompok data."
        return {
            "content": desc,
            "tool_calls": [{"name": "get_spending_summary", "result": result}],
        }


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
            "name": "list_ledgers",
            "description": "Melihat daftar buku pengeluaran milik pengguna.",
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

        system_instruction = (
            "Kamu adalah asisten keuangan cerdas IngatBelanjaan. "
            "Tugasmu membantu pengguna melihat dan memahami data pengeluaran mereka secara akurat.\n"
            "Aturan penting:\n"
            "1. Selalu gunakan tool yang tersedia untuk mengambil data pengeluaran riil. Jangan mengarang angka atau data.\n"
            "2. Gunakan Bahasa Indonesia yang sopan, ramah, dan ringkas.\n"
            "3. Salin nilai atau angka dari hasil tool secara persis apa adanya.\n"
            "4. Rujukan buku default adalah 'personal'.\n"
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
            response = httpx.post(
                f"{self.settings.groq_base_url}/chat/completions",
                headers=headers,
                json={
                    "model": self.settings.groq_model,
                    "messages": messages,
                    "tools": GROQ_CHAT_TOOLS,
                    "tool_choice": "auto",
                    "max_tokens": self.settings.llm_max_output_tokens,
                },
                timeout=self.settings.llm_timeout_s,
            )
            response.raise_for_status()
            choice = response.json()["choices"][0]
            message = choice["message"]

            tool_calls = message.get("tool_calls") or []
            executed_tools = []

            if tool_calls:
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

                second_response = httpx.post(
                    f"{self.settings.groq_base_url}/chat/completions",
                    headers=headers,
                    json={
                        "model": self.settings.groq_model,
                        "messages": messages,
                        "max_tokens": self.settings.llm_max_output_tokens,
                    },
                    timeout=self.settings.llm_timeout_s,
                )
                second_response.raise_for_status()
                final_content = second_response.json()["choices"][0]["message"]["content"]
                return {"content": str(final_content)[:4000], "tool_calls": executed_tools}

            return {"content": str(message.get("content") or "")[:4000], "tool_calls": []}

        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            raise LLMUnavailable(f"Groq request failed: {error}") from error


def build_llm(settings):
    if settings.llm_provider == "none":
        return NoneLLM()
    if settings.llm_provider == "groq":
        return GroqLLM(settings)
    return FakeLLM()

