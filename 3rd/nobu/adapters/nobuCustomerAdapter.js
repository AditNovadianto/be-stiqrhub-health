export const getNobuCustomerId = (req) => {
  const rawId = req.customer?.id_customer ?? req.user?.id_customer ?? null;

  const customerId = Number(rawId);

  return Number.isSafeInteger(customerId) && customerId > 0 ? customerId : null;
};
