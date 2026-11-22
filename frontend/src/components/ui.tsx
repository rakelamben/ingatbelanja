import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export type IconName =
  | "home"
  | "history"
  | "scan"
  | "plus"
  | "tracker"
  | "chat"
  | "sparkles"
  | "search"
  | "arrow-right"
  | "arrow-left"
  | "check"
  | "alert"
  | "info"
  | "user"
  | "logout"
  | "calendar"
  | "receipt"
  | "close"
  | "chart"
  | "upload";

export function Icon({
  name,
  className = "",
  size = 20,
  label,
}: {
  name: IconName;
  className?: string;
  size?: number;
  label?: string;
}) {
  const iconProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `ui-icon ${className}`,
    ...(label ? { role: "img", "aria-label": label } : { "aria-hidden": "true" as const }),
  };

  switch (name) {
    case "home":
      return (
        <svg {...iconProps}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "history":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "scan":
    case "upload":
      return (
        <svg {...iconProps}>
          <path d="M4 7V4h3" />
          <path d="M20 7V4h-3" />
          <path d="M4 17v3h3" />
          <path d="M20 17v3h-3" />
          <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
      );
    case "plus":
      return (
        <svg {...iconProps}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case "tracker":
      return (
        <svg {...iconProps}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "chat":
    case "sparkles":
      return (
        <svg {...iconProps}>
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
        </svg>
      );
    case "search":
      return (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...iconProps}>
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...iconProps}>
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      );
    case "check":
      return (
        <svg {...iconProps}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "alert":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case "info":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case "user":
      return (
        <svg {...iconProps}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "logout":
      return (
        <svg {...iconProps}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...iconProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...iconProps}>
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
          <line x1="8" y1="7" x2="16" y2="7" />
          <line x1="8" y1="11" x2="16" y2="11" />
          <line x1="8" y1="15" x2="12" y2="15" />
        </svg>
      );
    case "close":
      return (
        <svg {...iconProps}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case "chart":
      return (
        <svg {...iconProps}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    default:
      return null;
  }
}

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading = false, disabled, children, className = "", type = "button", ...rest },
  ref,
) {
  const variantClass =
    variant === "secondary"
      ? "secondary-button"
      : variant === "danger"
        ? "danger-button"
        : variant === "ghost"
          ? "ghost-button"
          : "primary-button";

  return (
    <button
      ref={ref}
      type={type}
      className={`ui-button ${variantClass} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading}
      {...rest}
    >
      {loading ? (
        <span className="button-loading-content">
          <span className="spinner" aria-hidden="true" />
          <span>Memproses…</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
});

export function Card({
  as: Component = "article",
  className = "",
  children,
  ...rest
}: {
  as?: "article" | "div" | "section";
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Component className={`ui-card ${className}`.trim()} {...rest}>
      {children}
    </Component>
  );
}

export type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
  error?: string;
  help?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, id, error, help, className = "", required, ...rest },
  ref,
) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`ui-field-group ${error ? "has-error" : ""}`}>
      <label htmlFor={id} className="ui-field-label">
        <span>{label}</span>
        {required && <span className="field-required" aria-hidden="true">*</span>}
      </label>
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`ui-input ${className}`.trim()}
        {...rest}
      />
      {help && !error && (
        <p id={helpId} className="ui-field-help">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="ui-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  id: string;
  error?: string;
  help?: string;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, id, error, help, className = "", children, required, ...rest },
  ref,
) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`ui-field-group ${error ? "has-error" : ""}`}>
      <label htmlFor={id} className="ui-field-label">
        <span>{label}</span>
        {required && <span className="field-required" aria-hidden="true">*</span>}
      </label>
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`ui-select ${className}`.trim()}
        {...rest}
      >
        {children}
      </select>
      {help && !error && (
        <p id={helpId} className="ui-field-help">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="ui-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  id: string;
  error?: string;
  help?: string;
};

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(function TextareaField(
  { label, id, error, help, className = "", required, ...rest },
  ref,
) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`ui-field-group ${error ? "has-error" : ""}`}>
      <label htmlFor={id} className="ui-field-label">
        <span>{label}</span>
        {required && <span className="field-required" aria-hidden="true">*</span>}
      </label>
      <textarea
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`ui-textarea ${className}`.trim()}
        {...rest}
      />
      {help && !error && (
        <p id={helpId} className="ui-field-help">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="ui-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

export type AlertVariant = "error" | "warning" | "info" | "success";

export function Alert({
  variant = "error",
  children,
  onDismiss,
  className = "",
}: {
  variant?: AlertVariant;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const iconName: IconName =
    variant === "success"
      ? "check"
      : variant === "warning" || variant === "error"
        ? "alert"
        : "info";

  return (
    <div
      className={`ui-alert ui-alert-${variant} ${className}`.trim()}
      role="alert"
    >
      <Icon name={iconName} size={18} className="ui-alert-icon" />
      <div className="ui-alert-body">{children}</div>
      {onDismiss && (
        <button
          type="button"
          className="ui-alert-dismiss"
          onClick={onDismiss}
          aria-label="Tutup pemberitahuan"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

export function ErrorSummary({
  title = "Periksa kesalahan berikut:",
  errors,
  className = "",
}: {
  title?: string;
  errors: string | string[];
  className?: string;
}) {
  const errorList = Array.isArray(errors) ? errors.filter(Boolean) : [errors].filter(Boolean);
  if (!errorList.length) return null;

  return (
    <div className={`ui-error-summary ${className}`.trim()} role="alert" tabIndex={-1}>
      <div className="ui-error-summary-header">
        <Icon name="alert" size={18} />
        <strong>{title}</strong>
      </div>
      {errorList.length === 1 ? (
        <p className="ui-error-summary-text">{errorList[0]}</p>
      ) : (
        <ul className="ui-error-summary-list">
          {errorList.map((err, idx) => (
            <li key={idx}>{err}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  let label = "Perlu tinjau";
  let variant = "review";
  let icon: IconName = "alert";

  if (status === "confirmed") {
    label = "Terkonfirmasi";
    variant = "confirmed";
    icon = "check";
  } else if (status === "processing") {
    label = "Diproses";
    variant = "processing";
    icon = "history";
  } else if (status === "failed") {
    label = "Gagal";
    variant = "failed";
    icon = "alert";
  }

  return (
    <span className={`status-badge status-${variant}`}>
      <Icon name={icon} size={12} className="status-badge-icon" />
      <span>{label}</span>
    </span>
  );
}

export function LoadingState({
  label = "Memuat data…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`state state-loading ${className}`.trim()} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon = "receipt",
  action,
  className = "",
}: {
  title: string;
  children?: ReactNode;
  icon?: IconName | ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`state state-empty ${className}`.trim()}>
      <div className="empty-state-icon" aria-hidden="true">
        {typeof icon === "string" ? <Icon name={icon as IconName} size={36} /> : icon}
      </div>
      <h2 className="empty-state-title">{title}</h2>
      {children && <div className="empty-state-text muted">{children}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Terjadi kesalahan",
  message = "Tidak dapat memuat data saat ini. Periksa koneksi internetmu.",
  onRetry,
  className = "",
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`state state-empty state-error ${className}`.trim()} role="alert">
      <div className="empty-state-icon error-state-icon" aria-hidden="true">
        <Icon name="alert" size={36} />
      </div>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-text muted">{message}</p>
      {onRetry && (
        <div className="empty-state-action">
          <Button variant="secondary" onClick={onRetry}>
            Coba lagi
          </Button>
        </div>
      )}
    </div>
  );
}

export function LiveRegion({
  message,
  level = "polite",
}: {
  message: string;
  level?: "polite" | "assertive";
}) {
  return (
    <div className="sr-only" role="region" aria-live={level} aria-atomic="true">
      {message}
    </div>
  );
}
