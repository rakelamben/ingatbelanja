import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  Button,
  Field,
  SelectField,
  Alert,
  StatusBadge,
  Icon,
  ErrorSummary,
  EmptyState,
} from "./ui";

describe("UI Primitives & Accessibility", () => {
  it("renders Button with loading state and aria-busy", () => {
    const { rerender } = render(<Button>Simpan</Button>);
    const button = screen.getByRole("button", { name: "Simpan" });
    expect(button).toBeTruthy();
    expect(button.getAttribute("aria-busy")).toBe("false");

    rerender(<Button loading>Simpan</Button>);
    const busyButton = screen.getByRole("button");
    expect(busyButton.getAttribute("aria-busy")).toBe("true");
    expect(busyButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/memproses/i)).toBeTruthy();
  });

  it("links Field label to input with htmlFor and sets aria-invalid on error", () => {
    const { rerender } = render(
      <Field id="test-merchant" label="Nama Merchant" placeholder="Pasar" />,
    );
    const input = screen.getByLabelText("Nama Merchant");
    expect(input).toBeTruthy();
    expect(input.id).toBe("test-merchant");
    expect(input.getAttribute("aria-invalid")).toBe("false");

    rerender(
      <Field
        id="test-merchant"
        label="Nama Merchant"
        error="Merchant wajib diisi"
      />,
    );
    const errorInput = screen.getByLabelText(/nama merchant/i);
    expect(errorInput.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("Merchant wajib diisi");
  });

  it("renders SelectField correctly with accessible label", () => {
    render(
      <SelectField id="test-currency" label="Mata Uang">
        <option value="IDR">IDR</option>
        <option value="USD">USD</option>
      </SelectField>,
    );
    const select = screen.getByLabelText("Mata Uang");
    expect(select).toBeTruthy();
    expect(select.id).toBe("test-currency");
  });

  it("renders Alert with role='alert' and supports dismissal", () => {
    const onDismiss = vi.fn();
    render(
      <Alert variant="error" onDismiss={onDismiss}>
        Gagal memproses data.
      </Alert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain("Gagal memproses data.");

    const dismissBtn = screen.getByRole("button", { name: /tutup/i });
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders ErrorSummary with list of errors", () => {
    render(
      <ErrorSummary
        title="Formulir belum lengkap"
        errors={["Nama tidak boleh kosong", "Nominal harus lebih dari 0"]}
      />,
    );
    const summary = screen.getByRole("alert");
    expect(summary).toBeTruthy();
    expect(screen.getByText("Nama tidak boleh kosong")).toBeTruthy();
    expect(screen.getByText("Nominal harus lebih dari 0")).toBeTruthy();
  });

  it("renders StatusBadge with accessible semantic text and icon", () => {
    const { rerender } = render(<StatusBadge status="confirmed" />);
    expect(screen.getByText("Terkonfirmasi")).toBeTruthy();

    rerender(<StatusBadge status="processing" />);
    expect(screen.getByText("Diproses")).toBeTruthy();

    rerender(<StatusBadge status="failed" />);
    expect(screen.getByText("Gagal")).toBeTruthy();

    rerender(<StatusBadge status="review" />);
    expect(screen.getByText("Perlu tinjau")).toBeTruthy();
  });

  it("renders Icon as SVG with aria-hidden when no label is passed", () => {
    const { container } = render(<Icon name="home" size={24} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("width")).toBe("24");
  });

  it("renders EmptyState with title and action", () => {
    render(
      <EmptyState
        title="Belum ada transaksi"
        icon="receipt"
        action={<button>Mulai</button>}
      >
        Silakan tambahkan transaksi pertamamu.
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "Belum ada transaksi" })).toBeTruthy();
    expect(screen.getByText("Silakan tambahkan transaksi pertamamu.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mulai" })).toBeTruthy();
  });
});
