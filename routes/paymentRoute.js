import express from "express";
import { auth } from "../middlewares/authMiddleware.js";
import { checkout, paymentVerification } from "../controllers/paymentController.js";

const router = express.Router();

// Đảm bảo route này tồn tại
router.post("/order/checkout", auth, checkout);
router.post("/order/payment-verification", auth, paymentVerification);

export default router;