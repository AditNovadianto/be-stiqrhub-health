const BIGDATACLOUD_URL = "https://api-bdc.net/data/reverse-geocode";

// HELPERS
const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const cleanValue = (value) => {
  if (typeof value !== "string") return null;

  const result = value.trim();
  return result || null;
};

// REVERSE GEOCODING
export async function reverseGeocode(latitude, longitude) {
  const apiKey = process.env.BIGDATACLOUD_API_KEY;

  if (!apiKey) {
    throw errorWithStatus("BigDataCloud API key belum dikonfigurasi", 503);
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    localityLanguage: "id",
  });

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);

  let response;

  try {
    response = await fetch(`${BIGDATACLOUD_URL}?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "x-bdc-key": apiKey,
      },
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw errorWithStatus("Permintaan lokasi mengalami timeout", 504);
    }

    throw errorWithStatus("Gagal menghubungi layanan BigDataCloud", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    throw errorWithStatus("Konfigurasi API BigDataCloud tidak valid", 502);
  }

  if (response.status === 402 || response.status === 429) {
    throw errorWithStatus("Kuota layanan lokasi sedang tidak tersedia", 503);
  }

  if (!response.ok) {
    throw errorWithStatus("Layanan BigDataCloud sedang bermasalah", 502);
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw errorWithStatus("Respons layanan lokasi tidak valid", 502);
  }

  if (!result || typeof result !== "object") {
    throw errorWithStatus("Data lokasi tidak valid", 502);
  }

  const city = cleanValue(result.city) || cleanValue(result.locality);

  const province = cleanValue(result.principalSubdivision);

  const country = cleanValue(result.countryName);

  const locality = cleanValue(result.locality);

  if (!city && !province && !country) {
    throw errorWithStatus(
      "Lokasi untuk koordinat tersebut tidak ditemukan",
      404,
    );
  }

  return {
    latitude,
    longitude,
    city,
    locality,
    province,
    country,
    country_code: cleanValue(result.countryCode),
    province_code: cleanValue(result.principalSubdivisionCode),
    postcode: cleanValue(result.postcode),
    formatted_address: [city, province, country].filter(Boolean).join(", "),
  };
}
