type DateLikeItem = {
  data: {
    date?: string | Date;
    title?: string;
  };
};

export function sortByDateDesc<T extends DateLikeItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const dateA = Date.parse(String(a.data.date ?? ''));
    const dateB = Date.parse(String(b.data.date ?? ''));
    const hasDateA = Number.isFinite(dateA);
    const hasDateB = Number.isFinite(dateB);

    if (hasDateA && hasDateB && dateA !== dateB) return dateB - dateA;
    if (hasDateA && !hasDateB) return -1;
    if (!hasDateA && hasDateB) return 1;

    return String(a.data.title ?? '').localeCompare(String(b.data.title ?? ''));
  });
}