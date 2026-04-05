import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request) {
  try {
    const { public_id } = await request.json();

    if (!public_id) {
      return NextResponse.json({ error: "Missing public_id" }, { status: 400 });
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "Cloudinary credentials missing in .env" },
        { status: 500 }
      );
    }

    // 1. timestamp 생성 (초 단위 Unix time)
    const timestamp = Math.round(new Date().getTime() / 1000);

    // 2. 파라미터 정렬 후 signature 생성
    // Cloudinary SDK 없이 순수 JS로 서명을 생성하는 공식 규격:
    // 'public_id=xxx&timestamp=12345' + api_secret 을 sha1으로 해싱
    const stringToSign = `public_id=${public_id}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(stringToSign).digest("hex");

    // 3. Cloudinary Destroy API 호출
    const formData = new FormData();
    formData.append("public_id", public_id);
    formData.append("timestamp", timestamp.toString());
    formData.append("api_key", apiKey);
    formData.append("signature", signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        method: "POST",
        body: formData,
      }
    );

    const result = await response.json();

    if (result.result !== "ok") {
      console.error("Cloudinary deletion failed:", result);
      return NextResponse.json(
        { error: "Failed to delete from Cloudinary" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("API Error in delete-image:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
