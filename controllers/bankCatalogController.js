import { DANA_BENEFICIARY_BANKS } from "../data/danaBeneficiaryBanks.js";

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("id-ID");

// GET ALL BENEFICIARY BANKS
export const getBeneficiaryBanks = (req, res) => {
  try {
    const q = normalize(req.query.q);

    const code = String(req.query.code ?? "").trim();

    const rawLimit = String(req.query.limit ?? "200").trim();

    if (!/^[1-9]\d{0,2}$/.test(rawLimit) || Number(rawLimit) > 200) {
      return res.status(400).json({
        success: false,
        message: "limit harus antara 1 sampai 200",
      });
    }

    if (code && !/^\d{1,8}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: "Format bank code tidak valid",
      });
    }

    const matches = DANA_BENEFICIARY_BANKS.filter((item) => {
      const matchesCode = !code || item.bank_code === code;

      const matchesQuery =
        !q ||
        [item.bank_name, item.bank_code, item.swift_code ?? ""].some((field) =>
          normalize(field).includes(q),
        );

      return matchesCode && matchesQuery;
    });

    return res.status(200).json({
      success: true,
      message: "Daftar bank beneficiary DANA berhasil diambil",
      source: "DANA Beneficiary Bank Code List (snapshot)",
      total: matches.length,
      data: matches.slice(0, Number(rawLimit)),
    });
  } catch (error) {
    console.error("[BANK CATALOG]", error);

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar bank",
    });
  }
};

// VALIDATE BANK NAME AND CODE
export const validateBeneficiaryBank = (req, res) => {
  const code = String(req.query.code ?? "").trim();

  const name = normalize(req.query.name);

  if (!/^\d{1,8}$/.test(code) || !name) {
    return res.status(400).json({
      success: false,
      message: "code dan name wajib diisi",
    });
  }

  const matches = DANA_BENEFICIARY_BANKS.filter(
    (item) => item.bank_code === code && normalize(item.bank_name) === name,
  );

  return res.status(200).json({
    success: true,
    valid: matches.length > 0,
    data: matches,
  });
};
