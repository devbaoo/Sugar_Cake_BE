import axios from "axios";
import crypto from "crypto";
import { Order } from "../models/orderModel.js";
import "dotenv/config";
import mongoose from "mongoose";

const PAYOS_API_URL = "https://api-merchant.payos.vn";

/**
 * 🔹 Tạo chữ ký (signature) để bảo mật dữ liệu gửi đi.
 */
const createSignature = (data, checksumKey) => {
    const signData = Object.keys(data)
        .filter(key => key !== 'signature') // Loại bỏ signature cũ
        .sort()
        .map(key => `${key}=${data[key]}`)
        .join('&');

    return crypto.createHmac('sha256', checksumKey).update(signData).digest('hex');
};

/**
 * ✅ API: Checkout - Tạo thanh toán
 */
export const checkout = async (req, res) => {
    const { orderId } = req.body;
    try {
        // 🔍 Tìm đơn hàng
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // ✅ **Tạo `orderCode` nếu chưa có**
        if (!order.orderCode) {
            order.orderCode = parseInt(order._id.toString().slice(-10), 16) % 9007199254740991;
            await order.save(); // Lưu lại `orderCode`
        }

        // 🔹 Chuẩn bị dữ liệu thanh toán
        const paymentId = order.orderCode;
        const description = `Thanh toán đơn ${order.orderCode.toString().slice(-6)}`.slice(0, 25);

        const paymentData = {
            orderCode: order.orderCode,
            amount: order.priceAfterDiscount || order.totalPrice,
            description
        };

        // 🔹 Tạo chữ ký bảo mật
        const cancelSignature = createSignature(paymentData, process.env.Checksum_Key);

        // 🔹 Tạo URL thanh toán
        const cancelUrl = `${process.env.FRONTEND_URL}/cancel?orderCode=${order.orderCode}&id=${paymentId}&status=CANCELLED&signature=${cancelSignature}`;
        const returnUrl = `${process.env.FRONTEND_URL}/success?orderCode=${order.orderCode}&id=${paymentId}&status=PAID&signature=${cancelSignature}`;

        // 🔹 Ký dữ liệu trước khi gửi
        const finalPaymentData = { ...paymentData, cancelUrl, returnUrl };
        finalPaymentData.signature = createSignature(finalPaymentData, process.env.Checksum_Key);

        console.log("🔍 Payment Data:", finalPaymentData);

        // 🛒 **Gửi API PAYOS**
        const response = await axios.post(
            `${PAYOS_API_URL}/v2/payment-requests`,
            finalPaymentData,
            {
                headers: {
                    'x-client-id': process.env.Client_ID,
                    'x-api-key': process.env.API_Key,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("✅ PAYOS Response:", response.data);

        if (response.data?.data?.checkoutUrl) {
            res.json({ success: true, paymentUrl: response.data.data.checkoutUrl });
        } else {
            throw new Error('Invalid response from PAYOS');
        }
    } catch (error) {
        console.error('❌ Server Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * ✅ API: Payment Verification - Xác minh thanh toán từ PAYOS
 */
export const paymentVerification = async (req, res) => {
    const ObjectId = mongoose.Types.ObjectId;

    try {
        const { signature, order, paymentMethod } = req.body;

        // ✅ **Nếu là COD, cập nhật ngay đơn hàng**
        if (paymentMethod === 'COD') {
            const filter = { $or: [{ orderCode: order.orderCode }] };
            if (ObjectId.isValid(order.orderCode)) {
                filter.$or.push({ _id: new ObjectId(order.orderCode) });
            }

            const orderUpdate = await Order.findOneAndUpdate(
                filter,
                {
                    orderStatus: "COD",
                    'paymentInfo.payosPaymentId': 'COD',
                },
                { new: true }
            );

            if (!orderUpdate) {
                return res.status(404).json({ success: false, message: "Order not found" });
            }

            return res.json({ success: true, order: orderUpdate });
        }

        // ✅ **Tạo chữ ký để xác minh**
        const dataToSign = {
            orderCode: order.orderCode,
            status: order.status,
            paymentId: order.paymentId
        };

        const responseSignature = createSignature(dataToSign, process.env.Checksum_Key);

        console.log("Recomputed Signature:", responseSignature);
        console.log("PAYOS Signature:", signature);

        // 🔴 **Kiểm tra chữ ký**
        if (responseSignature !== signature) {
            return res.status(400).json({ success: false, message: "Invalid signature" });
        }

        // ✅ **Tìm đơn hàng theo `orderCode` trước, nếu không có thì tìm bằng `_id`**
        let orderUpdate = await Order.findOne({ orderCode: order.orderCode });

        if (!orderUpdate && ObjectId.isValid(order.orderCode)) {
            orderUpdate = await Order.findById(order.orderCode);
        }

        if (!orderUpdate) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // ✅ **Cập nhật trạng thái đơn hàng**
        orderUpdate.orderStatus = order.status === "PAID" ? "Paid" : "Failed";
        orderUpdate.paymentInfo.payosPaymentId = order.status === "PAID" ? order.paymentId : "FAILED";
        orderUpdate.paidAt = new Date();
        await orderUpdate.save();

        res.json({ success: true, order: orderUpdate });

    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
