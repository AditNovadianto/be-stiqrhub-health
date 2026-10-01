import * as orderModel from "../models/orderModel.js";

// CONSTANTS
const PAYMENT_STATUSES = [
  "PENDING",
  "APPROVED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
];

const ORDER_STATUSES = ["PENDING", "APPROVED", "FAILED", "CANCELLED"];

// HELPERS
const isValidIntegerId = (id) =>
  /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));

const isValidUuid = (id) => {
  if (typeof id !== "string") {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
};

const normalizeStatus = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim().toUpperCase();
};

const isValidDate = (value) => {
  if (!value) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
};

const handleError = (res, error) => {
  console.error("Order controller error:", error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Order atau health pass sudah tersedia",
    });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      message: "Customer atau service tidak valid",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// CREATE ORDER
export const createOrder = async (req, res) => {
  const { payment_method, booking_at, id_customer, id_service } = req.body;

  if (typeof payment_method !== "string" || !payment_method.trim()) {
    return res.status(400).json({
      success: false,
      message: "Payment method wajib diisi",
    });
  }

  if (!isValidDate(booking_at)) {
    return res.status(400).json({
      success: false,
      message: "Booking date tidak valid",
    });
  }

  const bookingDate = new Date(booking_at);

  if (bookingDate <= new Date()) {
    return res.status(400).json({
      success: false,
      message: "Booking date harus setelah waktu sekarang",
    });
  }

  if (!isValidIntegerId(id_customer) || !isValidIntegerId(id_service)) {
    return res.status(400).json({
      success: false,
      message: "ID customer atau ID service tidak valid",
    });
  }

  try {
    const id_order = await orderModel.createOrder(
      payment_method.trim().toUpperCase(),
      booking_at,
      id_customer,
      id_service,
    );

    const order = await orderModel.getOrderById(id_order);

    return res.status(201).json({
      success: true,
      message: "Order berhasil dibuat",
      data: order,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET ALL ORDERS
export const getAllOrders = async (req, res) => {
  try {
    const orders = await orderModel.getAllOrders();

    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET ORDER BY ID
export const getOrderById = async (req, res) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      message: "ID order tidak valid",
    });
  }

  try {
    const order = await orderModel.getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan",
      });
    }

    const healthPass = await orderModel.getHealthPassByOrder(id);

    return res.status(200).json({
      success: true,
      data: {
        ...order,
        health_pass: healthPass,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET ORDERS BY CUSTOMER
export const getOrdersByCustomer = async (req, res) => {
  const { id_customer } = req.params;

  if (!isValidIntegerId(id_customer)) {
    return res.status(400).json({
      success: false,
      message: "ID customer tidak valid",
    });
  }

  try {
    const orders = await orderModel.getOrdersByCustomer(id_customer);

    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET ORDERS BY PROVIDER
export const getOrdersByProvider = async (req, res) => {
  const { id_provider } = req.params;

  if (!isValidIntegerId(id_provider)) {
    return res.status(400).json({
      success: false,
      message: "ID provider tidak valid",
    });
  }

  try {
    const orders = await orderModel.getOrdersByProvider(id_provider);

    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// UPDATE DANA PAYMENT INFO
export const updateDanaPaymentInfo = async (req, res) => {
  const { id } = req.params;

  const { dana_payment_id, payment_expired_at } = req.body;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      message: "ID order tidak valid",
    });
  }

  if (typeof dana_payment_id !== "string" || !dana_payment_id.trim()) {
    return res.status(400).json({
      success: false,
      message: "DANA payment ID wajib diisi",
    });
  }

  if (payment_expired_at && !isValidDate(payment_expired_at)) {
    return res.status(400).json({
      success: false,
      message: "Payment expired date tidak valid",
    });
  }

  try {
    const order = await orderModel.getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan",
      });
    }

    const updated = await orderModel.updateDanaPaymentInfo(
      id,
      dana_payment_id.trim(),
      payment_expired_at || null,
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Informasi pembayaran gagal diperbarui",
      });
    }

    const updatedOrder = await orderModel.getOrderById(id);

    return res.status(200).json({
      success: true,
      message: "Informasi pembayaran berhasil diperbarui",
      data: updatedOrder,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// PAYMENT CALLBACK
export const paymentCallback = async (req, res) => {
  /*
   * Format ini adalah format INTERNAL backend.
   *
   * Jika DANA mengirim payload dengan nama field berbeda,
   * mapping payload DANA dilakukan di sini terlebih dahulu.
   */

  const {
    id_order,
    payment_status,
    order_status,
    dana_payment_id,
    paid_at,
    payment_expired_at,
  } = req.body;

  if (!isValidUuid(id_order)) {
    return res.status(400).json({
      success: false,
      message: "ID order tidak valid",
    });
  }

  const normalizedPaymentStatus = normalizeStatus(payment_status);

  const normalizedOrderStatus = normalizeStatus(order_status);

  if (
    !normalizedPaymentStatus ||
    !PAYMENT_STATUSES.includes(normalizedPaymentStatus)
  ) {
    return res.status(400).json({
      success: false,
      message: "Payment status tidak valid",
    });
  }

  if (
    !normalizedOrderStatus ||
    !ORDER_STATUSES.includes(normalizedOrderStatus)
  ) {
    return res.status(400).json({
      success: false,
      message: "Order status tidak valid",
    });
  }

  if (paid_at && !isValidDate(paid_at)) {
    return res.status(400).json({
      success: false,
      message: "Paid date tidak valid",
    });
  }

  if (payment_expired_at && !isValidDate(payment_expired_at)) {
    return res.status(400).json({
      success: false,
      message: "Payment expired date tidak valid",
    });
  }

  try {
    const result = await orderModel.processPaymentCallback({
      id_order,
      payment_status: normalizedPaymentStatus,
      order_status: normalizedOrderStatus,
      dana_payment_id: dana_payment_id || null,
      paid_at: paid_at || null,
      payment_expired_at: payment_expired_at || null,
    });

    return res.status(200).json({
      success: true,
      message: "Payment callback berhasil diproses",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
