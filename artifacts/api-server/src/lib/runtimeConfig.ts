const DEFAULT_LOCAL_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

function parseAllowedOriginsFromEnv(): string[] {
  const raw = process.env["CORS_ALLOWED_ORIGINS"];
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
}

export function getAllowedOrigins(): string[] {
  const explicitOrigins = parseAllowedOriginsFromEnv();
  if (explicitOrigins.length > 0) {
    return explicitOrigins;
  }

  const frontendOrigin = process.env["FRONTEND_ORIGIN"];
  if (frontendOrigin) {
    return [normalizeOrigin(frontendOrigin)];
  }

  return process.env["NODE_ENV"] === "production" ? [] : DEFAULT_LOCAL_ORIGINS;
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length === 0) {
    return false;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOrigins.includes(normalizedOrigin);
}
