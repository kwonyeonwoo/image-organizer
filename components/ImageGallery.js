"use client";

import { useState, useEffect } from "react";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import ImageViewer from "./ImageViewer";

export default function ImageGallery({ user, selectedGroupId }) {
  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // 뷰어 및 선택 모드 상태
  const [viewerIndex, setViewerIndex] = useState(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState(new Set());

  const [draggingImageId, setDraggingImageId] = useState(null);

  // 현재 선택된 그룹의 이미지들 최신화
  useEffect(() => {
    if (!selectedGroupId) {
      setImages([]);
      return;
    }

    // 그룹이 바뀌면 선택 모드 초기화
    setIsSelectionMode(false);
    setSelectedImageIds(new Set());

    const q = query(collection(db, "images"), where("groupId", "==", selectedGroupId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const imageData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // orderIndex가 있으면 우선 정렬, 없으면 createdAt으로 정렬
      imageData.sort((a, b) => {
        const orderA = a.orderIndex ?? (a.createdAt?.toMillis() || 0);
        const orderB = b.orderIndex ?? (b.createdAt?.toMillis() || 0);
        return orderB - orderA;
      });
      setImages(imageData);
    });

    return () => unsubscribe();
  }, [selectedGroupId]);

  const uploadImage = async (file) => {
    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
      
      if (!cloudName || !uploadPreset) return alert("Cloudinary 설정 누락");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.secure_url) {
        await addDoc(collection(db, "images"), {
          url: data.secure_url,
          userId: user.uid,
          groupId: selectedGroupId,
          createdAt: serverTimestamp(),
          orderIndex: Date.now(), // 기본 순서값으로 현재 시간 사용
        });
      }
    } catch (error) {
      console.error("업로드 에러:", error);
    }
  };

  // 기존 단일 삭제 (확인창 제거)
  const handleDeleteImage = async (imageId, imageUrl) => {
    try {
      const getPublicIdFromUrl = (url) => {
        const parts = url.split('/upload/');
        if (parts.length < 2) return null;
        const pathPart = parts[1].split('/').slice(1).join('/'); 
        return pathPart.substring(0, pathPart.lastIndexOf('.'));
      };

      const publicId = getPublicIdFromUrl(imageUrl);
      if (publicId) {
        fetch("/api/delete-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_id: publicId })
        }).catch(console.error);
      }

      await deleteDoc(doc(db, "images", imageId));

      if (viewerIndex >= images.length - 1) {
        setViewerIndex(null); 
      }
    } catch (err) {
      console.error("단일 삭제 실패:", err);
    }
  };

  // 다중 폭파 (확인창 없음)
  const handleBatchDelete = async () => {
    if (selectedImageIds.size === 0) return;
    setIsSelectionMode(false); // 지우기 즉시 선택모드 해제

    const arrayIds = Array.from(selectedImageIds);
    setSelectedImageIds(new Set()); // 비우기

    const getPublicIdFromUrl = (url) => {
      const parts = url.split('/upload/');
      if (parts.length < 2) return null;
      const pathPart = parts[1].split('/').slice(1).join('/'); 
      return pathPart.substring(0, pathPart.lastIndexOf('.'));
    };

    try {
      const deletePromises = arrayIds.map(async (id) => {
        const img = images.find(img => img.id === id);
        if(!img) return;

        const publicId = getPublicIdFromUrl(img.url);
        if (publicId) {
          fetch("/api/delete-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_id: publicId })
          }).catch(console.error);
        }
        return deleteDoc(doc(db, "images", id));
      });

      await Promise.all(deletePromises);
    } catch (err) {
      console.error("다중 삭제 실패:", err);
    }
  };

  const handleDragStart = (e, imageId) => {
    if (isSelectionMode) return;
    setDraggingImageId(imageId);
    e.dataTransfer.setData("imageId", imageId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggingImageId(null);
  };

  const handleImageDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleImageDrop = async (e, targetImageId) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("imageId");
    
    // 파일 업로드 드롭과 겹치지 않게 체크
    if (!draggedId || draggedId === targetImageId) return;

    const draggedIdx = images.findIndex(img => img.id === draggedId);
    const targetIdx = images.findIndex(img => img.id === targetImageId);

    if (draggedIdx === -1 || targetIdx === -1) return;

    // 새로운 orderIndex 계산 (사이에 끼워넣기)
    let newOrderIndex;
    const sortedImages = [...images];
    
    // 타겟 위치의 앞/뒤 이미지들의 orderIndex를 참조하여 중간값 설정
    // 여기서는 간단하게 타겟 이미지의 orderIndex 근처로 설정
    const targetOrder = images[targetIdx].orderIndex ?? (images[targetIdx].createdAt?.toMillis() || 0);
    
    if (draggedIdx < targetIdx) {
      // 뒤로 보내기
      const nextOrder = images[targetIdx + 1]?.orderIndex ?? (images[targetIdx + 1]?.createdAt?.toMillis() || 0);
      newOrderIndex = nextOrder ? (targetOrder + nextOrder) / 2 : targetOrder - 1000;
    } else {
      // 앞으로 보내기
      const prevOrder = images[targetIdx - 1]?.orderIndex ?? (images[targetIdx - 1]?.createdAt?.toMillis() || 0);
      newOrderIndex = prevOrder ? (targetOrder + prevOrder) / 2 : targetOrder + 1000;
    }

    try {
      await updateDoc(doc(db, "images", draggedId), {
        orderIndex: newOrderIndex
      });
    } catch (err) {
      console.error("순서 변경 실패:", err);
    }
  };

  const handleImageClick = (index, imageId) => {
    if (isSelectionMode) {
      // 선택 상태 토글
      const newSelected = new Set(selectedImageIds);
      if (newSelected.has(imageId)) {
        newSelected.delete(imageId);
      } else {
        newSelected.add(imageId);
      }
      setSelectedImageIds(newSelected);
    } else {
      // 일반 모드면 뷰어 열기
      setViewerIndex(index);
    }
  };

  const handleDragOver = (e) => {
    // 갤러리 자체 드래그 오버 (파일 업로드용)
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      if (!selectedGroupId) return;
      setIsDragging(true);
    }
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (!selectedGroupId) return;

    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length === 0) return;

    setIsUploading(true);
    await Promise.all(files.map(uploadImage));
    setIsUploading(false);
  };

  const closeViewer = () => setViewerIndex(null);
  const handleNavigate = (direction) => {
    if (direction === "prev" && viewerIndex > 0) setViewerIndex(viewerIndex - 1);
    else if (direction === "next" && viewerIndex < images.length - 1) setViewerIndex(viewerIndex + 1);
  };

  if (!selectedGroupId) {
    return <div className="gallery-empty"><p>어떤 폴더를 볼지 선택해주세요.</p></div>;
  }

  return (
    <>
      <div className="gallery-toolbar">
        {images.length > 0 && (
          isSelectionMode ? (
            <div className="selection-actions">
              <span className="selection-count">{selectedImageIds.size}개 선택됨</span>
              <button className="btn btn-secondary" onClick={() => { setIsSelectionMode(false); setSelectedImageIds(new Set()); }}>취소</button>
              <button className="btn btn-danger" onClick={handleBatchDelete} disabled={selectedImageIds.size === 0}>
                🗑️ {selectedImageIds.size}개 지우기
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary select-btn" onClick={() => setIsSelectionMode(true)}>
              <span>✓</span> 선택
            </button>
          )
        )}
      </div>

      <div 
        className={`gallery-container ${isDragging ? "dragging" : ""} ${isSelectionMode ? "selection-mode" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && <div className="drag-overlay"><h2>이곳에 마우스를 놓아 업로드하세요!</h2></div>}
        {isUploading && <div className="uploading-overlay"><h2>🚀 업로드 중입니다... 잠시만 기다려주세요</h2></div>}
        
        <div className="image-grid">
          {images.length === 0 ? (
            <p className="no-images">아직 이미지가 없습니다. 사진을 드래그 해보세요!</p>
          ) : (
            images.map((img, index) => {
              const isSelected = selectedImageIds.has(img.id);
              const isDraggingNow = draggingImageId === img.id;
              return (
                <div 
                  key={img.id} 
                  className={`image-card ${isSelected ? "selected" : ""} ${isDraggingNow ? "dragging-now" : ""}`} 
                  onClick={() => handleImageClick(index, img.id)}
                  draggable={!isSelectionMode}
                  onDragStart={(e) => handleDragStart(e, img.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleImageDragOver}
                  onDrop={(e) => handleImageDrop(e, img.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="Uploaded file" loading="lazy" />
                  
                  {isSelectionMode && (
                    <div className="select-overlay">
                      {isSelected && <div className="check-mark">✓</div>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <ImageViewer 
        images={images}
        currentIndex={viewerIndex}
        onClose={closeViewer}
        onNavigate={handleNavigate}
        onDelete={handleDeleteImage}
      />
    </>
  );
}
