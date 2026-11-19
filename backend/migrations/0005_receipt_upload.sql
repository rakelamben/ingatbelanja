CREATE INDEX IF NOT EXISTS idx_receipt_images_sha256 ON receipt_images(sha256);
CREATE INDEX IF NOT EXISTS idx_jobs_ready ON jobs(status, available_at);
