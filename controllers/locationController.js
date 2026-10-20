import * as locationModel from "../models/locationModel.js";

// HELPERS
const parseCoordinate = (value, min, max) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < min || number > max) {
    return null;
  }

  return number;
};

const handleError = (res, error) => {
  console.error("Location controller error:", error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// REVERSE GEOCODING
export const reverseGeocode = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    const lat = parseCoordinate(latitude, -90, 90);
    const lng = parseCoordinate(longitude, -180, 180);

    if (lat === null || lng === null) {
      return res.status(400).json({
        success: false,
        message: "Latitude atau longitude tidak valid",
      });
    }

    const location = await locationModel.reverseGeocode(lat, lng);

    return res.status(200).json({
      success: true,
      message: "Lokasi berhasil ditemukan",
      data: location,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
