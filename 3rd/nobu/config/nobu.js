import "dotenv/config";

const required = (key) => {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Environment ${key} belum diisi`);
  }

  return value;
};

export const getNobuConfig = () => {
  const baseUrl = required("MIDDLEWARE_API_URL_DEV").replace(/\/+$/, "");

  const url = new URL(baseUrl);

  if (url.protocol !== "https:") {
    throw new Error("NOBU Middleware harus menggunakan HTTPS");
  }

  return {
    baseUrl,
    apiKey: required("MIDDLEWARE_API_KEY"),
    merchantId: required("NOBU_MERCHANT_ID"),
    storeId: required("NOBU_STORE_ID"),
    subMerchantId: required("NOBU_SUB_MERCHANT_ID"),
    terminalId: "A01",
    timeoutMs: 30000,
  };
};
