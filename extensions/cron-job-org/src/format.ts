export function formatUnixSeconds(sec?: number): string {
  if (!sec) return "–";
  const d = new Date(sec * 1000);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function statusToText(status?: number): string {
  switch (status) {
    case 0:
      return "Unknown";
    case 1:
      return "OK";
    case 2:
      return "Failed (DNS)";
    case 3:
      return "Failed (Connect)";
    case 4:
      return "Failed (HTTP)";
    case 5:
      return "Failed (Timeout)";
    case 6:
      return "Failed (Too much data)";
    case 7:
      return "Failed (Invalid URL)";
    case 8:
      return "Failed (Internal)";
    case 9:
      return "Failed (Unknown)";
    default:
      return `Status ${status}`;
  }
}
