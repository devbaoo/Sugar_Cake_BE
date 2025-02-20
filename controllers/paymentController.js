import axios from "axios";
import crypto from "crypto";
import { Order } from "../models/orderModel.js";
import "dotenv/config";

const PAYOS_API_URL = "https://api-merchant.payos.vn";

const createSignature = (data, checksumKey) => {
    const signData = Object.keys(data)
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
    try {
        const { signature, order } = req.body;


        const calculatedSignature = createSignature(order, process.env.Checksum_Key);

        if (calculatedSignature !== signature) {
            return res.status(400).json({
                success: false,
                message: "Invalid signature"
            });
        }


        const orderUpdate = await Order.findByIdAndUpdate(
            order.orderCode,
            {
                orderStatus: order.status === "PAID" ? "Paid" : "Failed",
                paidAt: new Date()
            },
            { new: true }
        );

        if (!orderUpdate) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        res.json({
            success: true,
            order: orderUpdate
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};