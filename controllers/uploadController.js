import {
	cloudinaryImgDelete,
	cloudinaryImgUpload,
} from "../utils/cloudinary.js";
import fs from "fs/promises";
import fsSync from "fs";
import { validateUserId } from "../utils/validateUserId.js";

// image upload

export const uploadImages = async (req, res) => {
	try {
		const uploader = (path) => cloudinaryImgUpload(path);
		const urls = [];
		const files = req.files;

		const uploadPromises = files.map(async (file) => {
			const { path } = file;
			const newPath = await uploader(path);
			urls.push(newPath);

			if (fsSync.existsSync(path)) {
				try {
					await fs.unlink(path);
				} catch (unlinkError) {
					console.error(`Failed to delete file: ${path}`, unlinkError);
				}
			}
		});

		await Promise.all(uploadPromises);

		res.json({
			success: true,
			images: urls
		});
	} catch (error) {
		console.log(error);
		res.status(500).json({ error: "Internal Server Error" });
	}
};

// image delete

export const deleteImages = async (req, res) => {
	const { id } = req.params;
	validateUserId(id);
	try {
		const deletedImg = cloudinaryImgDelete(id, "images");
		res.status(200).json({
			message: "Image Deleted Successfully",
		});
	} catch (error) {
		console.log(error);
		res.status(500).json({ error: "Internal Server Error" });
	}
};
