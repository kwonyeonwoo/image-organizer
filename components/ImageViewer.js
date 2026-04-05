import { useEffect } from "react";

export default function ImageViewer({ images, currentIndex, onClose, onNavigate }) {
  // ESC 키로 모달 닫기 지원
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate("prev");
      if (e.key === "ArrowRight" && currentIndex < images.length - 1) onNavigate("next");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, images.length, onClose, onNavigate]);

  if (currentIndex === null || !images[currentIndex]) return null;

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <button className="viewer-close" onClick={onClose}>✕</button>

      {/* 내부의 이미지 컨테이너 클릭 시에는 닫히지 않도록 이벤트 전파 차단 */}
      <div className="viewer-content" onClick={(e) => e.stopPropagation()}>
        
        {/* 첫 번째 이미지가 아닐 때만 좌측 화살표 표시 */}
        {currentIndex > 0 && (
          <button className="viewer-nav left" onClick={() => onNavigate("prev")}>
            &#10094;
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[currentIndex].url} alt="Full screen preview" />

        {/* 마지막 이미지가 아닐 때만 우측 화살표 표시 */}
        {currentIndex < images.length - 1 && (
          <button className="viewer-nav right" onClick={() => onNavigate("next")}>
            &#10095;
          </button>
        )}
      </div>
    </div>
  );
}
