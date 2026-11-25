import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { ApiError, api } from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { receiptReviewPath } from "../lib/routes";
import { Button, EmptyState, Icon } from "../components/ui";
import { SiRecord } from '@sargamicons/react/duotone';
import { BottomDialog } from "../components/BottomDialog";
import { SiClose } from "@sargamicons/react/fill";



type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch: boolean };

function describeCameraError(error: string | DOMException) {
  if (!window.isSecureContext) {
    return "Akses kamera memerlukan koneksi aman (HTTPS). Kamu masih bisa memilih foto dari galeri.";
  }
  if (typeof error !== "string") {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Izin kamera ditolak. Izinkan akses kamera di pengaturan browser atau pilih foto dari galeri.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "Kamera tidak ditemukan. Kamu masih bisa memilih foto dari galeri.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Kamera sedang digunakan aplikasi lain atau tidak dapat dimulai.";
    }
  }
  return "Kamera tidak dapat diakses. Periksa izin browser atau pilih foto dari galeri.";
}

function screenshotToFile(dataUrl: string) {
  const [header, encoded] = dataUrl.split(",", 2);
  const mimeType = header.match(/^data:(image\/(?:jpeg|png|webp));base64$/)?.[1];
  if (!mimeType || !encoded) {
    throw new Error("Hasil foto kamera tidak valid.");
  }

  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
  return new File([bytes], `receipt-${Date.now()}.${extension}`, { type: mimeType });
}

export function ReceiptCapturePage() {
  const { ledger } = useLedger();
  const navigate = useNavigate();
  const location = useLocation();
  const webcamRef = useRef<Webcam>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingReceiptId, setPendingReceiptId] = useState<string | null>(null);
  const [bottomDialogOpen, setBottomDialogOpen] = useState(false);

  const videoConstraints = useMemo<MediaTrackConstraints>(
    () =>
      selectedDeviceId
        ? {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
        : {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
    [selectedDeviceId],
  );

  const upload = async (file: File) => {
    if (!ledger || busy || pendingReceiptId) return;
    setBusy(true);
    setError("");
    setMessage("Menyimpan foto struk…");
    setBottomDialogOpen(true)
    try {
      const receipt = await api.uploadPhoto(ledger.id, file);
      setPendingReceiptId(receipt.id);
      setMessage("Struk sedang diproses...");
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        let status;
        try {
          status = await api.receiptStatus(receipt.id);
        } catch {
          setMessage("Status OCR belum dapat diperiksa.");
          setError("Foto sudah diunggah. Buka tinjau untuk memeriksa statusnya tanpa mengunggah ulang.");
          return;
        }
        if (status.status !== "processing") {
          navigate(receiptReviewPath(ledger.id, receipt.id), { replace: true, state: location.state });
          return;
        }
      }
      navigate(receiptReviewPath(ledger.id, receipt.id), { replace: true, state: location.state });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Foto tidak dapat diunggah.");
    } finally {
      setBusy(false);
    }
  };

  const startCamera = () => {
    if (typeof window.isSecureContext === "boolean" && !window.isSecureContext) {
      setError(describeCameraError("secure context required"));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Browser ini tidak menyediakan akses kamera. Pilih foto dari galeri.");
      return;
    }
    setError("");
    setCameraLoading(true);
    setCameraEnabled(true);
  };

  const handleUserMedia = useCallback((stream: MediaStream) => {
    setCameraStream(stream);
    setCameraLoading(false);
    setCameraReady(true);
    setError("");
    setTorchOn(false);

    const track = stream.getVideoTracks()[0];
    try {
      const capabilities =
        track && typeof track.getCapabilities === "function"
          ? (track.getCapabilities() as TorchCapabilities)
          : undefined;
      setTorchAvailable(capabilities?.torch === true);
    } catch {
      setTorchAvailable(false);
      setError("Dukungan flash tidak dapat diperiksa pada kamera ini.");
    }

    if (navigator.mediaDevices?.enumerateDevices) {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          setCameraDevices(devices.filter((device) => device.kind === "videoinput"));
        })
        .catch(() => {
          setError("Daftar kamera lain tidak dapat dimuat; kamera saat ini tetap bisa digunakan.");
          setCameraDevices([]);
        });
    } else {
      setCameraDevices([]);
    }
  }, []);

  const handleCameraError = useCallback((cameraError: string | DOMException) => {
    setCameraEnabled(false);
    setCameraLoading(false);
    setCameraReady(false);
    setCameraStream(null);
    setTorchAvailable(false);
    setTorchOn(false);
    setError(describeCameraError(cameraError));
  }, []);

  const toggleTorch = async () => {
    const track = cameraStream?.getVideoTracks()[0];
    if (!track || !torchAvailable) return;
    const nextTorchState = !torchOn;
    const constraints: MediaTrackConstraints = {
      advanced: [{ torch: nextTorchState } as TorchConstraintSet],
    };

    setError("");
    try {
      await track.applyConstraints(constraints);
      setTorchOn(nextTorchState);
    } catch {
      setTorchOn(false);
      setError("Flash tidak dapat diaktifkan pada kamera ini.");
    }
  };

  const capturePhoto = () => {
    const screenshot = webcamRef.current?.getScreenshot();
    if (!cameraReady || !screenshot) {
      setError("Kamera belum siap. Tunggu sampai pratinjau tampil, lalu coba lagi.");
      return;
    }
    try {
      void upload(screenshotToFile(screenshot));
    } catch {
      setError("Foto dari kamera tidak dapat disiapkan untuk diunggah.");
    }
  };

  const selectGalleryFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void upload(file);
  };

  if (!ledger) {
    return (
      <EmptyState
        title="Buku tidak tersedia"
        icon="alert"
        action={
          <Link className="small-button" to="/app/books">
            Lihat daftar buku
          </Link>
        }
      >
        Buku tujuan untuk scan tidak dapat dimuat.
      </EmptyState>
    );
  }

  return (
    <section className="receipt-capture-page">
      <div className="camera-container">
        {cameraEnabled ? (
          <>
            <Webcam
              key={selectedDeviceId || "environment"}
              ref={webcamRef}
              audio={false}
              disablePictureInPicture
              forceScreenshotSourceSize
              imageSmoothing
              mirrored={false}
              onUserMedia={handleUserMedia}
              onUserMediaError={handleCameraError}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.92}
              videoConstraints={videoConstraints}
              className="camera-preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {cameraLoading && (
              <p className="camera-preview-message text-center" role="status">
                Menghubungkan kamera…
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col absolute z-10 gap-2 items-center w-3/4 top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2">
            <Button
              type="button"
              variant="secondary"
              onClick={startCamera}
              disabled={busy || Boolean(pendingReceiptId)}
            >
              Aktifkan Kamera
            </Button>
          </div>
        )}
      </div>

      <div className="camera-overlay absolute bottom-0 w-screen h-screen flex flex-col justify-between pt-18">
        {/* {(error || pendingReceiptId) && (
          <div className="camera-feedback">
            {error && (
              <Alert variant="error" onDismiss={() => setError("")}>
                {error}
              </Alert>
            )}
            {pendingReceiptId && !busy && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigate(receiptReviewPath(ledger.id, pendingReceiptId), { replace: true, state: location.state })
                }
              >
                Buka tinjau struk
              </Button>
            )}
          </div>
        )} */}

        <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3/4 h-2/3 border-4 rounded-lg border-white">
          <p className="w-full text-center -mt-10">Arahkan nota di dalam bingkai</p>
        </div>

        <div>
          <div className="flex flex-row absolute bottom-0 items-center w-full justify-around mb-8">
            <button
              type="button"
              className="scanner-action-btn"
              title="Pilih gambar dari galeri"
              aria-label="Pilih gambar dari galeri"
              disabled={busy || Boolean(pendingReceiptId)}
              onClick={() => galleryInput.current?.click()}
            >
              <Icon name="gallery" size={24} />
            </button>
            <button
              type="button"
              className="text-2xl"
              aria-label="Ambil foto struk"
              disabled={!cameraReady || busy || Boolean(pendingReceiptId)}
              onClick={capturePhoto}
            >
              <SiRecord className="text-6xl" />
            </button>

            <button
              type="button"
              className={`scanner-action-btn ${torchOn ? "active" : ""}`}
              title={torchAvailable ? (torchOn ? "Matikan flash" : "Nyalakan flash") : "Flash tidak didukung kamera ini"}
              aria-label={torchAvailable ? (torchOn ? "Matikan flash" : "Nyalakan flash") : "Flash tidak didukung kamera ini"}
              aria-pressed={torchOn}
              disabled={!cameraReady || !torchAvailable || busy}
              onClick={() => void toggleTorch()}
            >
              <Icon name="flash" size={24} />
            </button>
          </div>
          {/* {cameraReady && !torchAvailable && (
              <p className="camera-control-hint" role="status">
                Flash tidak tersedia pada kamera ini.
              </p>
            )} */}
          {/* {busy && <p className="scanner-busy-banner" role="status">{message}</p>} */}
        </div>
      </div>



      <BottomDialog isOpen={bottomDialogOpen} showClose={false} onClose={() => setBottomDialogOpen(false)} >
        <div className="text-center w-full">
            {error ? (
              <div className="flex flex-row justify-between items-centerr">
                <p>{error}</p>
                <button onClick={() => {setBottomDialogOpen(false); setError("");}}><SiClose className="text-lg"/></button>
              </div>
              ) : (
                <p>{message}</p>
              )}
            
            {pendingReceiptId && !busy && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigate(receiptReviewPath(ledger.id, pendingReceiptId), { replace: true, state: location.state })
                }
              >
                Buka tinjau struk
              </Button>
            )}
        </div>
      </BottomDialog>

      <input
        ref={galleryInput}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        aria-label="Pilih foto struk dari galeri"
        disabled={busy || Boolean(pendingReceiptId)}
        onChange={selectGalleryFile}
      />
    </section>
  );
}
