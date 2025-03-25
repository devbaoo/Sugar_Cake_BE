import slugify from "slugify";
import { Blog } from "../models/blogModel.js";

export const createBlog = async (req, res) => {
    try {
        if (req.body.title) {
            req.body.slug = slugify(req.body.title);
        }
        const newBlog = await Blog.create(req.body);
        res.status(201).json(newBlog);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Internal Server Error" });
        
    }
};
export const getAllBlogs = async (req, res) => {
    try {
      const queryObj = { ...req.query }; // Lấy các tham số truy vấn nếu có (ví dụ: lọc, phân trang)
      const allBlogs = await Blog.find(queryObj); 
      
      res.status(200).json(allBlogs); // Trả về danh sách blog
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  
  export const getBlog = async (req, res) => {
    const { id } = req.params;
    try {
      const blog = await Blog.findById(id);
      res.status(200).json(blog);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  
  export const updateBlog = async (req, res) => {
    const { id } = req.params;
    try {
      if (req.body.title) {
        req.body.slug = slugify(req.body.title);
      }
      const updatedBlog = await Blog.findByIdAndUpdate(id, req.body, {
        new: true,
      });
      res.status(200).json(updatedBlog);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal Server Error" });
    }    
  };

  export const deleteBlog = async (req, res) => {
    const { id } = req.params;
    try {
      const deletedBlog = await Blog.findByIdAndDelete(id);
      res.status(200).json(deletedBlog);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };