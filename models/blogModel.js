import mongoose from "mongoose";

// Định nghĩa schema cho bảng Blog
let blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    // Cập nhật hình ảnh giống Product schema
    images: [
			{
				public_id: String,
				url: String,
			},
		],
  },
  { timestamps: true } // Tự động thêm các trường createdAt và updatedAt
);

// Export model
export const Blog = mongoose.model("Blog", blogSchema);