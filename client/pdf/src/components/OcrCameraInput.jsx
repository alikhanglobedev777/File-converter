import { useEffect, useRef, useState } from "react";
import { FiCamera, FiImage, FiVideo, FiX } from "react-icons/fi";
import { boundedImageDimensions } from "../utils/ocrLimits";

// The browser, not AK Converter's backend, owns the camera stream.
// Native capture is preferred on phones; getUserMedia provides an inline
// viewfinder on desktop and on browsers that support it.
export default function OcrCameraInput({ onPhoto, disabled = false, selectedFile = null }) {
  const nativeRef = useRef(null);
  const galleryRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const cameraRequestRef = useRef(0);
  const [active, setActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState("");

  const stopCamera = () => {
    cameraRequestRef.current += 1;
    const stream = streamRef.current;
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    stream?.getTracks().forEach(track => track.stop());
    if (mountedRef.current) setActive(false);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cameraRequestRef.current += 1;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (disabled || selectedFile) stopCamera();
  }, [disabled, selectedFile]);

  useEffect(() => {
    if (!active || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {
      setMessage("Camera preview could not start. Use the phone camera or upload a photo.");
      stopCamera();
    });
  }, [active]);

  const openCamera = async () => {
    if (disabled || active || capturing) return;
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Live camera preview is not available. Use Take photo on a phone or Upload photo.");
      return;
    }
    const requestId = ++cameraRequestRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false,
      });
      if (!mountedRef.current || disabled || requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setActive(true);
    } catch {
      if (mountedRef.current && requestId === cameraRequestRef.current) {
        setMessage("Camera permission was denied or the camera is unavailable. You can still upload a photo.");
      }
    }
  };

  const handlePhotoSelection = (event) => {
    const photo = event.target.files?.[0];
    event.target.value = "";
    if (!photo || disabled) return;
    stopCamera();
    setMessage("");
    onPhoto(photo);
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || disabled || capturing) return;
    if (!video.videoWidth || !video.videoHeight) {
      setMessage("The camera is still starting. Try again.");
      return;
    }
    setCapturing(true);
    const canvas = document.createElement("canvas");
    try {
      const size = boundedImageDimensions(video.videoWidth, video.videoHeight);
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Camera canvas not supported");
      context.drawImage(video, 0, 0, size.width, size.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
      if (!blob || !mountedRef.current) throw new Error("Could not capture picture");
      const photo = new File([blob], "camera-photo-" + Date.now() + ".jpg", { type: "image/jpeg" });
      stopCamera();
      setMessage("");
      onPhoto(photo);
    } catch {
      if (mountedRef.current) setMessage("Photo capture failed. Try again or upload a picture.");
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      if (mountedRef.current) setCapturing(false);
    }
  };

  return <section className="ocr-camera" aria-label="Camera and photo input">
    <div className="ocr-camera__actions">
      <button type="button" className="button" onClick={() => nativeRef.current?.click()} disabled={disabled}>
        <FiCamera /> Take photo (phone)
      </button>
      <button type="button" className="button" onClick={openCamera} disabled={disabled || active || capturing}>
        <FiVideo /> Open live camera
      </button>
      <button type="button" className="button" onClick={() => galleryRef.current?.click()} disabled={disabled}>
        <FiImage /> Upload photo
      </button>
    </div>
    <input ref={nativeRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
      aria-label="Take a photo with your phone's camera" className="ocr-camera__hidden"
      onChange={handlePhotoSelection} disabled={disabled} />
    <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp"
      aria-label="Select a photo from your device" className="ocr-camera__hidden"
      onChange={handlePhotoSelection} disabled={disabled} />
    {active && <div className="ocr-camera__viewfinder">
      <video ref={videoRef} muted playsInline autoPlay aria-label="Live camera preview" />
      <div className="ocr-camera__controls">
        <button type="button" className="button button--primary" onClick={capture} disabled={capturing || disabled}>
          <FiCamera /> {capturing ? "Taking photo…" : "Capture photo"}
        </button>
        <button type="button" className="button" onClick={stopCamera}><FiX /> Close camera</button>
      </div>
    </div>}
    {message && <p className="ocr-camera__message" role="status">{message}</p>}
    <p className="ocr-camera__hint">Camera permission is requested only when you open the live preview. Photos are processed on your device; no camera footage is uploaded.</p>
  </section>;
}
