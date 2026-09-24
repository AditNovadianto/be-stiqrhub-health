import multer from "multer";
import multerS3 from "multer-s3";
import { randomUUID } from "node:crypto";
import { s3 } from "../config/s3.js";

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (req, file, cb) => {
      const extension = EXTENSIONS[file.mimetype];

      const key = `services/${randomUUID()}/` + `image_service.${extension}`;

      cb(null, key);
    },
  }),

  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error(`Format file ${file.fieldname} tidak didukung`));
    }

    cb(null, true);
  },

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 20,
  },
});

export const uploadService = upload.single("image_service");
