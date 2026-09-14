export const getCartMetrics = (items) => ({
  uniqueItemCount: items.length,
  totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
  subtotal: items.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  ),
});

export const getCartAfterPaymentVerification = (
  items,
  purchasedCropIds,
  verification
) => {
  const wasVerifiedAndFinalized =
    verification?.success === true &&
    verification?.payment?.status === "VERIFIED" &&
    Array.isArray(verification?.orderIds) &&
    verification.orderIds.length > 0;

  if (!wasVerifiedAndFinalized) {
    return items;
  }

  const purchasedIds = new Set(purchasedCropIds.map(String));
  return items.filter((item) => !purchasedIds.has(String(item.cropId)));
};
