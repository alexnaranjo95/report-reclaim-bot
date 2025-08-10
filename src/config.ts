export const APP_CONFIG = {
  POLL_INTERVAL_MS: 2000,
  POLL_TIMEOUT_MS: 60000,
  MAX_TABLE_COLUMNS: 6,
};

export const isMockMode = () => {
  const url = new URL(window.location.href);
  return url.searchParams.get("mock") === "1";
};
