import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import { ApiError, api } from "../lib/api";
import { useLedger } from "../context/LedgerContext";
import { ledgerPath, receiptReviewPath } from "../lib/routes";
import { Alert, Button, EmptyState, Icon } from "../components/ui";

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
  const webcamRef = useRef<Webcam>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingReceiptId, setPendingReceiptId] = useState<string | null>(null);

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
    try {
      const receipt = await api.uploadPhoto(ledger.id, file);
      setPendingReceiptId(receipt.id);
      setMessage("Struk sedang diproses oleh AI…");
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
          navigate(receiptReviewPath(ledger.id, receipt.id), { replace: true });
          return;
        }
      }
      navigate(receiptReviewPath(ledger.id, receipt.id), { replace: true });
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

  const switchCamera = () => {
    if (cameraDevices.length < 2 || !cameraStream) return;
    const currentDeviceId =
      cameraStream.getVideoTracks()[0]?.getSettings().deviceId ?? selectedDeviceId;
    const currentIndex = cameraDevices.findIndex(
      (device) => device.deviceId === currentDeviceId,
    );
    const nextDevice = cameraDevices[(currentIndex + 1) % cameraDevices.length];
    if (!nextDevice) return;

    setError("");
    setCameraReady(false);
    setCameraLoading(true);
    setTorchOn(false);
    setSelectedDeviceId(nextDevice.deviceId);
  };

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
              <p className="camera-preview-message" role="status">
                Menghubungkan kamera…
              </p>
            )}
          </>
        ) : (
          <div className="camera-activation-panel">
            <Icon name="scan" size={40} />
            <strong>Siapkan foto struk</strong>
            <p>Kamera hanya aktif setelah kamu menekan tombol ini.</p>
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

      <div className="camera-overlay absolute top-0 left-0 w-screen h-screen flex flex-col justify-between pt-18">
        <div className="scanner-top-nav">
          <Link
            className="scanner-circle-btn"
            to={ledgerPath(ledger.id, "scan")}
            aria-label="Kembali ke pilihan input"
          >
            <Icon name="arrow-left" size={18} />
          </Link>
          <button
            type="button"
            className="scanner-circle-btn"
            aria-label="Ganti kamera"
            title={
              cameraDevices.length > 1
                ? "Ganti kamera"
                : "Kamera lain tidak tersedia pada perangkat ini"
            }
            disabled={!cameraReady || cameraDevices.length < 2 || busy}
            onClick={switchCamera}
          >
            <Icon name="gear" size={18} />
          </button>
        </div>

        {(error || pendingReceiptId) && (
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
                  navigate(receiptReviewPath(ledger.id, pendingReceiptId), { replace: true })
                }
              >
                Buka tinjau struk
              </Button>
            )}
          </div>
        )}

        <div>

          <div className="scanner-bottom-actions mb-8">
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
              className="scanner-center-capture-btn"
              aria-label="Ambil foto struk"
              disabled={!cameraReady || busy || Boolean(pendingReceiptId)}
              onClick={capturePhoto}
            >
              <Icon name="scan" size={20} />
              <span>{busy ? message : "Ambil Foto"}</span>
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
            {cameraReady && !torchAvailable && (
              <p className="camera-control-hint" role="status">
                Flash tidak tersedia pada kamera ini.
              </p>
            )}
            {busy && <p className="scanner-busy-banner" role="status">{message}</p>}
        </div>
      </div>

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
