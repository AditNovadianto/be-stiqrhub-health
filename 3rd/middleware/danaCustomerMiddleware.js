import { verifyCustomerJwt } from "../adapters/customerJwt.js";

export const verifyDanaCustomer = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      success: false,
      message: "Customer JWT is required",
    });
  }

  const token = authorization.slice(7).trim();

  try {
    const customer = verifyCustomerJwt(token);

    req.user = customer;

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired customer JWT",
    });
  }
};
