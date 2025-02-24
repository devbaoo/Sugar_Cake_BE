import axios from "axios";
import crypto from "crypto";
import { Order } from "../models/orderModel.js";
import "dotenv/config";
import mongoose from 'mongoose';


const PAYOS_API_URL = "https://api-merchant.payos.vn";

const createSignature = (data, checksumKey) => {
    const signData = Object.keys(data)
        .filter(key => key !== 'signature') // Loại bỏ signature cũ
        .sort()
        .map(key => `${key}=${data[key]}`)
        .join('&');

    return crypto
        .createHmac('sha256', checksumKey)
        .update(signData)
        .digest('hex');
};



export const checkout = async (req, res) => {
    const { orderId } = req.body;
    try {
        // 🔍 Tìm đơn hàng
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // 🔹 Tạo mã đơn hàng hợp lệ
        const orderCode = Math.floor(Math.random() * 1000000000); // Số ngẫu nhiên 9 chữ số
        const paymentId = order._id.toString(); // Lấy `_id` làm mã thanh toán

        // 🔹 Tạo dữ liệu để ký
        const paymentData = {
            orderCode,
            amount: order.priceAfterDiscount || order.totalPrice,
            description: `Thanh toán đơn ${order._id.toString().slice(-6)}`,
        };

        // 🔹 Tạo chữ ký
        const cancelSignature = createSignature(paymentData, process.env.Checksum_Key);

        // 🔹 `cancelUrl` với đầy đủ thông tin
        const cancelUrl = `${process.env.FRONTEND_URL}/cancel?orderCode=${orderCode}&id=${paymentId}&status=CANCELLED&signature=${cancelSignature}`;

        // 🔹 `returnUrl` với đầy đủ thông tin
        const returnUrl = `${process.env.FRONTEND_URL}/success?orderCode=${orderCode}&id=${paymentId}&status=PAID&signature=${cancelSignature}`;

        // 🔹 Tạo chữ ký toàn bộ dữ liệu
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



export const paymentVerification = async (req, res) => {
    const ObjectId = mongoose.Types.ObjectId;

    try {
        const { signature, order, paymentMethod } = req.body;

        // ✅ **Nếu là COD, cập nhật ngay đơn hàng**
        if (paymentMethod === 'COD') {
            const filter = ObjectId.isValid(order.orderCode)
                ? { _id: new ObjectId(order.orderCode) }
                : { orderCode: order.orderCode };

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

        // ✅ **Tìm đơn hàng theo `orderCode` hoặc `_id`**
        const filter = ObjectId.isValid(order.orderCode)
            ? { _id: new ObjectId(order.orderCode) }
            : { orderCode: order.orderCode };

        // ✅ **Cập nhật trạng thái đơn hàng**
        const orderUpdate = await Order.findOneAndUpdate(
            filter,
            {
                orderStatus: order.status === "PAID" ? "Paid" : "Failed",
                'paymentInfo.payosPaymentId': order.status === "PAID" ? order.paymentId : 'FAILED',
                paidAt: new Date()
            },
            { new: true }
        );

        if (!orderUpdate) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        res.json({ success: true, order: orderUpdate });

    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
