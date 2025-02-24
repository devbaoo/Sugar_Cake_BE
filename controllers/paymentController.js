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

        // ✅ **Tạo `orderCode` nếu chưa có**
        if (!order.orderCode) {
            order.orderCode = parseInt(order._id.toString().slice(-10), 16) % 9007199254740991;
            await order.save(); // Lưu lại `orderCode`
        }

        // ✅ **Gán `paymentId` nếu chưa có**
        if (!order.paymentId) {
            order.paymentId = order.orderCode;
            await order.save();
        }

        const description = `Thanh toán đơn ${order.orderCode.toString().slice(-6)}`.slice(0, 25);

        // 🔹 Dữ liệu cần ký
        const paymentData = {
            orderCode: order.orderCode,
            amount: order.priceAfterDiscount || order.totalPrice,
            description,
        };

        // 🔹 **Lưu trạng thái thanh toán mặc định để tránh thay đổi**
        const initialStatus = "PENDING";

        // 🔹 **Tạo chữ ký bảo mật**
        const dataToSign = {
            orderCode: order.orderCode,
            status: initialStatus,
            paymentId: order.paymentId,
        };
        const signature = createSignature(dataToSign, process.env.Checksum_Key);

        // 🔹 Tạo URL thanh toán
        const cancelUrl = `${process.env.FRONTEND_URL}/cancel?orderCode=${order.orderCode}&id=${order.paymentId}&status=CANCELLED&signature=${signature}`;
        const returnUrl = `${process.env.FRONTEND_URL}/success?orderCode=${order.orderCode}&id=${order.paymentId}&status=PAID&signature=${signature}`;

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
                    "x-client-id": process.env.Client_ID,
                    "x-api-key": process.env.API_Key,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ PAYOS Response:", response.data);

        if (response.data?.data?.checkoutUrl) {
            res.json({ success: true, paymentUrl: response.data.data.checkoutUrl });
        } else {
            throw new Error("Invalid response from PAYOS");
        }
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};




export const paymentVerification = async (req, res) => {
    const ObjectId = mongoose.Types.ObjectId;

    try {
        const { signature, order, paymentMethod } = req.body;

        // ✅ **Nếu là COD, cập nhật ngay đơn hàng**
        if (paymentMethod === "COD") {
            const filter = { $or: [{ orderCode: order.orderCode }] };
            if (ObjectId.isValid(order.orderCode)) {
                filter.$or.push({ _id: new ObjectId(order.orderCode) });
            }

            const orderUpdate = await Order.findOneAndUpdate(
                filter,
                {
                    orderStatus: "COD",
                    "paymentInfo.payosPaymentId": "COD",
                },
                { new: true }
            );

            if (!orderUpdate) {
                return res.status(404).json({ success: false, message: "Order not found" });
            }

            return res.json({ success: true, order: orderUpdate });
        }

        // ✅ **Truy xuất lại đơn hàng từ DB để đảm bảo dữ liệu chính xác**
        let orderUpdate = await Order.findOne({ orderCode: order.orderCode });

        if (!orderUpdate && ObjectId.isValid(order.orderCode)) {
            orderUpdate = await Order.findById(order.orderCode);
        }

        if (!orderUpdate) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // ✅ **Tạo chữ ký từ dữ liệu chính xác trong DB**
        const dataToSign = {
            orderCode: orderUpdate.orderCode,
            status: orderUpdate.status,
            paymentId: orderUpdate.paymentId,
        };

        const responseSignature = createSignature(dataToSign, process.env.Checksum_Key);

        console.log("Recomputed Signature:", responseSignature);
        console.log("PAYOS Signature:", signature);

        // 🔴 **Kiểm tra chữ ký**
        if (responseSignature !== signature) {
            return res.status(400).json({ success: false, message: "Invalid signature" });
        }

        // ✅ **Cập nhật trạng thái đơn hàng**
        orderUpdate.orderStatus = order.status === "PAID" ? "Paid" : "Failed";
        orderUpdate.paymentInfo.payosPaymentId = order.status === "PAID" ? order.paymentId : "FAILED";
        orderUpdate.status = order.status === "PAID" ? "PAID" : "FAILED";
        orderUpdate.paidAt = new Date();
        await orderUpdate.save();

        res.json({ success: true, order: orderUpdate });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};
