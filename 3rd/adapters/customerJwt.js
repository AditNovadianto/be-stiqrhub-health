import jwt from "jsonwebtoken";

// ADAPTER AUTENTIKASI CUSTOMER
//
// Sesuaikan dengan fungsi login customer existing:
// - secret
// - payload JWT
// - masa berlaku
// - issuer dan audience jika digunakan.
//
// Contoh di bawah mengasumsikan backend existing
// sudah memakai process.env.JWT_SECRET.

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Sesuaikan customerJwt.js dengan JWT secret existing");
  }

  return secret;
};

export const createCustomerJwt = (idCustomer) => {
  return jwt.sign(
    {
      id_customer: Number(idCustomer),
      actor_type: "CUSTOMER",
    },
    getJwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: "7d",
    },
  );
};

export const verifyCustomerJwt = (token) => {
  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  });

  const idCustomer = Number(decoded.id_customer);

  if (
    decoded.actor_type !== "CUSTOMER" ||
    !Number.isSafeInteger(idCustomer) ||
    idCustomer <= 0
  ) {
    throw new Error("Invalid customer JWT payload");
  }

  return {
    id_customer: idCustomer,
  };
};
