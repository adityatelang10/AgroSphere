export const getCartMetrics = (items) => ({
  uniqueItemCount: items.length,
  totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
  subtotal: items.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  ),
});
