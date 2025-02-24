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
        // Tìm order đã tạo
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }


        const paymentData = {
            orderCode: Date.now(),
            amount: order.priceAfterDiscount || order.totalPrice,
            description: `Thanh toán đơn ${order._id.toString().slice(-6)}`,
            cancelUrl: `${process.env.FRONTEND_URL}/cancel`,
            returnUrl: `${process.env.FRONTEND_URL}/success`
        };

        // Tạo signature
        paymentData.signature = createSignature(paymentData, process.env.Checksum_Key);
        console.log("Payment Data:", paymentData);
        console.log("Payment Signature:", paymentData.signature);

        try {
            // Gọi API PAYOS
            const response = await axios.post(
                `${PAYOS_API_URL}/v2/payment-requests`,
                paymentData,
                {
                    headers: {
                        'x-client-id': process.env.Client_ID,
                        'x-api-key': process.env.API_Key,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log("PAYOS Full Response:", JSON.stringify(response.data, null, 2));


            if (response.data && response.data.data && response.data.data.checkoutUrl) {
                res.json({
                    success: true,
                    paymentUrl: response.data.data.checkoutUrl
                });
            } else {
                throw new Error('Invalid response from PAYOS');
            }
        } catch (apiError) {
            console.error('PAYOS API Error:', apiError.response?.data || apiError.message);
            res.status(500).json({
                success: false,
                error: 'Payment gateway error',
                details: apiError.response?.data || apiError.message
            });
        }
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

export const paymentVerification = async (req, res) => {
    const ObjectId = mongoose.Types.ObjectId;

    try {
        const { signature, order, paymentMethod } = req.body;

        // Nếu là COD, cập nhật đơn hàng ngay
        if (paymentMethod === 'COD') {
            // Kiểm tra xem order.orderCode có phải ObjectId hợp lệ không
            if (!ObjectId.isValid(order.orderCode)) {
                return res.status(400).json({ success: false, message: "Invalid order ID" });
            }

            const orderUpdate = await Order.findOneAndUpdate(
                { _id: new ObjectId(order.orderCode) }, // 🔹 Tìm bằng _id thay vì orderCode
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

        // 🔹 **Chỉ lấy dữ liệu trong order để ký**
        const dataToSign = {
            orderCode: order.orderCode,
            status: order.status,
            paymentId: order.paymentId
        };

        // 🔹 **Tạo lại chữ ký**
        const responseSignature = createSignature(dataToSign, process.env.Checksum_Key);

        console.log("Recomputed Signature:", responseSignature);
        console.log("PAYOS Signature:", signature);

        // 🔴 **Kiểm tra chữ ký**
        if (responseSignature !== signature) {
            return res.status(400).json({ success: false, message: "Invalid signature" });
        }

        // 🔹 **Cập nhật trạng thái đơn hàng**
        const orderUpdate = await Order.findOneAndUpdate(
            { _id: new ObjectId(order.orderCode) }, // Ép kiểu về ObjectId
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
        console.log(error);
        res.status(500).json({ success: false, error: error.message });
    }
};

