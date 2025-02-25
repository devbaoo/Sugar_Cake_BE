import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get the directory name of the current module file
const __dirname = dirname(fileURLToPath(import.meta.url));
const destinationDir = join(__dirname, "../public/images/products");

// Ensure the destination directory exists
if (!fs.existsSync(destinationDir)) {
	fs.mkdirSync(destinationDir, { recursive: true });
}

export const multerStorage = multer.diskStorage({
	destination: function (req, file, cb) {
		//  cb stands for callback function
		cb(null, path.join(__dirname, "../public/images/products"));
	},
	filename: function (req, file, cb) {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
		cb(null, file.fieldname + "-" + uniqueSuffix + ".jpeg");
	},
});

export const multerFilter = (req, file, cb) => {
	if (file.mimetype.startsWith("image")) {
		cb(null, true);
		// console.log("inside the multerFilter:", req.files);
	} else {
		cb(
			{
				message:
					"Not an image, or Unsupported file format! Please upload only images.",
			},
			false
		);
	}
};

export const uploadPhoto = multer({
	storage: multerStorage,
	fileFilter: multerFilter,
	limits: {
		fieldSize: 5000000,
	},
});

export const productImgResize = async (req, res, next) => {
	if (!req.files) return next();
	console.log("req.files", req.files),
		await Promise.all(
			req.files.map(async (file) => {
				// console.log("file", file);
				const outputFilename = `${file.fieldname}-${Date.now()}.jpeg`; // Create a unique filename
				await sharp(file.path)
					.resize(300, 300)
					.toFormat("jpeg")
					.jpeg({ quality: 90 }) // 90% quality
					// .toFile(path.join(`/public/images/products/${file.filename}`));
					// .toFile(/public/images/products/${file.filename}`);
					.toFile(
						path.join(__dirname, "../public/images/products", outputFilename)
					);
			})
		);
	next();
};
