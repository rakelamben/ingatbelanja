import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ForwardedRef } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import { LedgerProvider } from "../context/LedgerContext";
import { ReceiptCapturePage } from "./ReceiptCapturePage";

const webcamState = vi.hoisted(() => ({
  stream: null as MediaStream | null,
  getScreenshot: vi.fn(),
  permissionDenied: false,
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    api: {
      ...((actual as Record<string, unknown>).api as Record<string, unknown>),
      ledger: vi.fn(),
      uploadPhoto: vi.fn(),
      receiptStatus: vi.fn(),
    },
  };
});

vi.mock("react-webcam", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    default: React.forwardRef(
      (
        props: {
          onUserMedia: (stream: MediaStream) => void;
          onUserMediaError: (error: DOMException) => void;
          videoConstraints?: MediaStreamConstraints["video"];
        },
        ref: ForwardedRef<unknown>,
      ) => {
        React.useImperativeHandle(ref, () => ({ getScreenshot: webcamState.getScreenshot }));
        React.useEffect(() => {
          if (webcamState.permissionDenied) {
            props.onUserMediaError(new DOMException("Permission denied", "NotAllowedError"));
          } else if (webcamState.stream) {
            props.onUserMedia(webcamState.stream);
          }
        }, [props.onUserMedia, props.onUserMediaError]);
        return React.createElement("video", {
          "data-testid": "webcam-preview",
          "data-video-constraints": JSON.stringify(props.videoConstraints),
        });
      },
    ),
  };
});

describe("ReceiptCapturePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    webcamState.permissionDenied = false;
    webcamState.getScreenshot.mockReturnValue(null);
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    vi.mocked(api.ledger).mockResolvedValue({
      id: "ledger-1",
      name: "Buku Rumah",
      type: "personal",
      currency: "IDR",
      role: "owner",
      member_count: 1,
      sum_spend: 0,
      members: [],
    });
    vi.mocked(api.uploadPhoto).mockResolvedValue({
      id: "receipt-1",
      ledger_id: "ledger-1",
      status: "processing",
      source: "photo",
      created_at: "2026-11-20T00:00:00Z",
    });
    vi.mocked(api.receiptStatus).mockResolvedValue({
      id: "receipt-1",
      status: "needs_review",
      issues: [],
      updated_at: "2026-11-20T00:00:00Z",
    });
  });

  function provideCamera({ torch = false, deviceIds = ["camera-1"] } = {}) {
    const track = {
      getCapabilities: () => ({ torch }),
      getSettings: () => ({ deviceId: deviceIds[0] }),
      applyConstraints: vi.fn().mockResolvedValue(undefined),
    };
    webcamState.stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn().mockResolvedValue(
          deviceIds.map((deviceId) => ({
            deviceId,
            kind: "videoinput",
            label: deviceId,
          })),
        ),
      },
    });
    return track;
  }

  function renderCapturePage() {
    return render(
      <MemoryRouter initialEntries={["/app/ledger/ledger-1/scan/capture"]}>
        <Routes>
          <Route
            path="/app/ledger/:ledgerId"
            element={
              <LedgerProvider>
                <Outlet />
              </LedgerProvider>
            }
          >
            <Route path="scan/capture" element={<ReceiptCapturePage />} />
            <Route path="receipts/:receiptId" element={<p>OCR review form</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it("uploads a selected image and opens the shared receipt review form", async () => {
    renderCapturePage();

    const file = new File(["receipt"], "receipt.png", { type: "image/png" });
    fireEvent.change(await screen.findByLabelText("Pilih foto struk dari galeri"), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(api.uploadPhoto).toHaveBeenCalledWith("ledger-1", file);
      expect(screen.getByText("OCR review form")).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("requests camera access only after activation and uploads the captured image", async () => {
    provideCamera();
    webcamState.getScreenshot.mockReturnValue("data:image/jpeg;base64,YQ==");
    renderCapturePage();

    const activateButton = await screen.findByRole("button", { name: "Aktifkan Kamera" });
    expect(screen.queryByTestId("webcam-preview")).toBeNull();
    fireEvent.click(activateButton);
    await screen.findByTestId("webcam-preview");
    fireEvent.click(await screen.findByRole("button", { name: "Ambil foto struk" }));

    await waitFor(() => {
      expect(api.uploadPhoto).toHaveBeenCalledOnce();
      const uploadCalls = vi.mocked(api.uploadPhoto).mock.calls;
      expect(uploadCalls[0][1]).toBeInstanceOf(File);
      expect(uploadCalls[0][1].type).toBe("image/jpeg");
      expect(screen.getByText("OCR review form")).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("shows a clear recovery message when camera permission is denied", async () => {
    webcamState.permissionDenied = true;
    provideCamera();
    renderCapturePage();

    fireEvent.click(await screen.findByRole("button", { name: "Aktifkan Kamera" }));
    expect(
      await screen.findByText(/Izin kamera ditolak.*galeri/i),
    ).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Aktifkan Kamera" })).toBeTruthy();
  });

  it("enables flash only when the active camera reports torch support", async () => {
    const track = provideCamera({ torch: true });
    renderCapturePage();

    fireEvent.click(await screen.findByRole("button", { name: "Aktifkan Kamera" }));
    const flashButton = await screen.findByRole("button", { name: "Nyalakan flash" });
    fireEvent.click(flashButton);

    await waitFor(() => {
      expect(track.applyConstraints).toHaveBeenCalledWith({
        advanced: [{ torch: true }],
      });
      expect(
        screen.getByRole("button", { name: "Matikan flash" }).getAttribute("aria-pressed"),
      ).toBe("true");
    });
  });

  it("switches to the next available camera device", async () => {
    provideCamera({ deviceIds: ["camera-1", "camera-2"] });
    renderCapturePage();

    fireEvent.click(await screen.findByRole("button", { name: "Aktifkan Kamera" }));
    await screen.findByTestId("webcam-preview");
    const switchButton = await screen.findByRole("button", { name: "Ganti kamera" });
    await waitFor(() => expect((switchButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(switchButton);

    await waitFor(() => {
      expect(screen.getByTestId("webcam-preview").getAttribute("data-video-constraints"))
        .toContain("camera-2");
    });
  });
});
