    import express from "express";
    import { createBlog, getAllBlogs, getBlog, updateBlog, deleteBlog } from "../controllers/blogController.js";

    const router = express.Router();

    router.post("/", createBlog); // Tạo Blog
    router.get("/", getAllBlogs); // Lấy tất cả Blog
    router.get("/:id", getBlog); // Lấy một Blog theo ID
    router.put("/:id", updateBlog); // Cập nhật Blog
    router.delete("/:id", deleteBlog); // Xóa Blog

    export default router;  