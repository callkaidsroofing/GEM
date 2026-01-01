export async function calculate_totals(input) {
  // Simple calculation simulation
  const subtotal = (input.items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  return {
    result: {
      subtotal,
      tax,
      total
    },
    effects: {}
  };
}
