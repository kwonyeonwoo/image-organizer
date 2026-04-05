"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import ImageViewer from "./ImageViewer";

export default function ImageGallery({ user, selectedGroupId }) {
  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // 뷰어 관련 상태
  const [viewerIndex, setViewerIndex] = useState(null);

  // 현재 선택된 그룹의 이미지들 실시간 가져오기
  useEffect(() => {
    if (!selectedGroupId) {
      setImages([]);
      return;
    }

    const q = query(collection(db, "images"), where("groupId", "==", selectedGroupId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const imageData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // 생성일(createdAt) 최신순 정렬
      imageData.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setImages(imageData);
    });

    return () => unsubscribe();
  }, [selectedGroupId]);

  // Cloudinary + Firestore 업로드 함수
  const uploadImage = async (file) => {
    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
      
      if (!cloudName || !uploadPreset) return alert("Cloudinary 설정이 누락되었습니다.");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      // 1. Cloudinary로 파트 전송
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.secure_url) {
        // 2. 받은 URL을 Firestore 기록
        await addDoc(collection(db, "images"), {
          url: data.secure_url,
          userId: user.uid,
          groupId: selectedGroupId,
          createdAt: serverTimestamp(),
        });
      } else {
        throw new Error("Failed to get url from Cloudinary");
      }
    } catch (error) {
      console.error("업로드 에러:", error);
      alert("이미지 업로드에 실패했습니다.");
    }
  };

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e) => {
    e.preventDefault();
    if (!selectedGroupId) return; // 그룹 미선택 시 방어
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (!selectedGroupId) {
      alert("먼저 이미지를 업로드할 폴더를 선택해주세요.");
      return;
    }

    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    
    if (files.length === 0) return;

    setIsUploading(true);
    // 여러 파일을 병렬로 업로드
    await Promise.all(files.map(uploadImage));
    setIsUploading(false);
  };

  const openViewer = (index) => setViewerIndex(index);
  const closeViewer = () => setViewerIndex(null);
  
  const handleNavigate = (direction) => {
    if (direction === "prev" && viewerIndex > 0) {
      setViewerIndex(viewerIndex - 1);
    } else if (direction === "next" && viewerIndex < images.length - 1) {
      setViewerIndex(viewerIndex + 1);
    }
  };

  if (!selectedGroupId) {
    return (
      <div className="gallery-empty">
        <p>어떤 폴더를 볼지 선택해주세요.</p>
      </div>
    );
  }

  return (
    <>
      <div 
        className={`gallery-container ${isDragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drag-overlay">
            <h2>이곳에 마우스를 놓아 업로드하세요!</h2>
          </div>
        )}

        {isUploading && (
          <div className="uploading-overlay">
            <h2>🚀 업로드 중입니다... 잠시만 기다려주세요</h2>
          </div>
        )}
        
        <div className="image-grid">
          {images.length === 0 ? (
            <p className="no-images">아직 이미지가 없습니다. 바탕화면에서 이곳으로 사진을 드래그 해보세요!</p>
          ) : (
            images.map((img, index) => (
              <div key={img.id} className="image-card" onClick={() => openViewer(index)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="Uploaded file" loading="lazy" />
              </div>
            ))
          )}
        </div>
      </div>

      <ImageViewer 
        images={images}
        currentIndex={viewerIndex}
        onClose={closeViewer}
        onNavigate={handleNavigate}
      />
    </>
  );
}
