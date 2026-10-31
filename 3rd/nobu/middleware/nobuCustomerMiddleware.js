import { getNobuCustomerId } from "../adapters/nobuCustomerAdapter.js";

export const nobuCustomerMiddleware = (req, res, next) => {
  const customerId = getNobuCustomerId(req);

  if (!customerId) {
    return res.status(401).json({
      success: false,
      message: "Customer tidak terautentikasi",
    });
  }

  req.nobuCustomerId = customerId;
  next();
};
