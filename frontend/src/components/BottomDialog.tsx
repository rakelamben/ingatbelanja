import { ReactNode, useEffect } from "react";
import { SiClose } from "@sargamicons/react/fill";

type BottomDialog = {
    isOpen: boolean,
    showClose: boolean,
    onClose: () => void,
    children: ReactNode
}

export function BottomDialog({ isOpen, showClose, onClose, children }: BottomDialog) {
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };

        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = "";
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-xs"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="w-full bottom-0 max-w-md rounded-xl bg-white p-6"
                onClick={(e) => e.stopPropagation()}
            >
                    {showClose && (
                        <div className="mb-4 flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className=""
                                    aria-label="Close modal"
                                >
                                    <SiClose className="text-2xl" />
                                </button>
                        </div>
                    )}
                <div>{children}</div>
            </div>
        </div>
    );
}