"use client";

import { useState } from "react";

export default function FileViewer({ file, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!file) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const download = () => {
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.path.split("/").pop() || "file.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const isHtml = /\.html?$/i.test(file.path);

  const preview = () => {
    const blob = new Blob([file.content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fv">
        <div className="modal-head">
          <h2 className="mono fv-path">
            📄 {file.path} <span className="fsize">{file.content.length} chars</span>
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close file">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <pre className="fv-pre">{file.content}</pre>

        <div className="modal-foot">
          {isHtml && (
            <button type="button" className="ghost-btn" onClick={preview}>
              Preview in new tab
            </button>
          )}
          <button type="button" className="ghost-btn" onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </button>
          <button type="button" className="primary-btn" onClick={download}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
