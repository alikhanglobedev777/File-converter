// Shared by the visual PDF organizer and its tests.
// Page numbers always identify original PDF pages; rotations are absolute
// clockwise angles, as expected by the backend's pdf-organizer route.
export const VISUAL_PAGE_LIMIT = 60;

export function normalizeRotation(angle) {
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}

export function createPagePlan(count, rotationByPage = []) {
  if (!Number.isInteger(count) || count < 1) return [];
  return Array.from({ length: count }, (_, index) => ({
    page: index + 1,
    originalRotation: normalizeRotation(rotationByPage[index] || 0),
    rotation: normalizeRotation(rotationByPage[index] || 0),
  }));
}

export function movePage(plan, sourceIndex, targetIndex) {
  if (sourceIndex < 0 || sourceIndex >= plan.length || targetIndex < 0 || targetIndex >= plan.length || sourceIndex === targetIndex) return plan;
  const next = [...plan];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

export function removePage(plan, pageNumber) {
  // The server requires at least one page in the resulting PDF.
  if (plan.length <= 1) return plan;
  return plan.filter((item) => item.page !== pageNumber);
}

export function rotatePage(plan, pageNumber) {
  return plan.map((item) => item.page === pageNumber
    ? { ...item, rotation: normalizeRotation(item.rotation + 90) }
    : item);
}

export function serializePlan(plan) {
  return {
    pages: plan.map(({ page }) => page).join(','),
    rotate: plan.filter(({ rotation, originalRotation }) => rotation !== originalRotation)
      .map(({ page, rotation }) => `${page}:${rotation}`).join(','),
  };
}
