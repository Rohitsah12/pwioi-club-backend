import { getUploadUrl, deleteFromS3 } from "../utils/s3.js";
import { catchAsync } from "../utils/catchAsync.js";
import { v4 as uuid } from "uuid";
import { AppError } from "../utils/AppError.js";

export const generateSignedUrl = catchAsync(async (req, res) => {
  const { fileName, fileType } = req.body;
  if (!fileName || !fileType) throw new AppError("Missing fileName or fileType", 400);

  const ext = fileName.split(".").pop();
  const key = `posts/${uuid()}.${ext}`;

  const uploadUrl = await getUploadUrl(key, fileType);
  const publicUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${key}`;

  res.json({ uploadUrl, publicUrl, key });
});

export const removeMediaFromS3 = catchAsync(async (req, res) => {
  const { key } = req.body;
  if (!key) throw new AppError("Missing file key", 400);

  await deleteFromS3(key);
  res.json({ success: true });
});
