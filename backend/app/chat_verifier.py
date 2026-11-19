from __future__ import annotations

import re


def verify_answer(content: str, allowed_numbers: set[str], question: str) -> tuple[str, bool]:
    numbers = re.findall(r"(?:Rp\s*)?\d[\d.,]*", content)
    question_numbers = set(re.findall(r"\d[\d.,]*", question))
    allowed = {str(value) for value in allowed_numbers} | question_numbers
    if all(number in allowed or number.replace(".", "") in allowed for number in numbers):
        return content, True
    return "Ini data yang kutemukan:\n" + content, False
