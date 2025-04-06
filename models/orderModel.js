import mongoose from "mongoose";

let orderSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		shippingInfo: {
			name: { type: String, required: true },
			address: { type: String, required: true },
			city: { type: String, required: true },
			state: { type: String, required: true },
			country: { type: String, required: true },
			other: { type: String },
			pincode: { type: Number, required: true },
		},
		paymentInfo: {
			payosOrderId: { type: String, required: false },
			payosPaymentId: { type: String, required: false },
			signature: { type: String, required: false }, 
		},
		orderItems: [
			{
				product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
				color: { type: [], required: true, ref: "Color" },
				quantity: { type: Number, required: true },
				price: { type: Number, required: true },
			},
		],
		paidAt: { type: Date, default: Date.now() },
		totalPrice: { type: Number, required: true },
		priceAfterDiscount: { type: Number, required: true },
		orderStatus: { type: String, default: "Ordered" },

		orderCode: { type: Number, unique: true, sparse: true },
		paymentId: { type: String, unique: true, sparse: true },

		status: { type: String, default: "PENDING" },
	},
	{ timestamps: true }
);

export const Order = mongoose.model("Order", orderSchema);
