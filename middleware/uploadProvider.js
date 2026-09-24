import multer from "multer";
import multerS3 from "multer-s3";
import { randomUUID } from "node:crypto";
import { s3 } from "../config/s3.js";

const ALLOWED_FIELDS = [
  { name: "logo_provider", maxCount: 1 },
  { name: "akta_pendirian_perusahaan", maxCount: 1 },
  { name: "nomor_induk_berusaha", maxCount: 1 },
  { name: "npwp", maxCount: 1 },
  { name: "sertifikat_standard", maxCount: 1 },
  { name: "persetujuan_lingkungan", maxCount: 1 },
  { name: "surat_izin_apotek", maxCount: 1 },
];

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_BUCKET,
    acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (req, file, cb) => {
      const extension = EXTENSIONS[file.mimetype];

      const key =
        `providers/${randomUUID()}/` + `${file.fieldname}.${extension}`;

      cb(null, key);
    },
  }),

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error(`Format file ${file.fieldname} tidak didukung`));
    }

    cb(null, true);
  },

  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 7,
    fields: 30,
  },
});

export const uploadProvider = upload.fields(ALLOWED_FIELDS);
