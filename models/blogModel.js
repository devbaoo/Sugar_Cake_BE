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
    image: [
      {
        public_id: { type: String, required: true },
        asset_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
  },
  { timestamps: true } // Tự động thêm các trường createdAt và updatedAt
);

// Export model
export const Blog = mongoose.model("Blog", blogSchema);