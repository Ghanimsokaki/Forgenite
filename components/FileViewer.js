"use client";

import { useState } from "react";
import { downloadFile, downloadAsZip, copyToClipboard } from "@/lib/fileUtils";

export default function FileViewer({ file, files = [], onClose, onOpenWorkspace }) {
  const [copied, setCopied] = useState(false);

  if (!file) return null;

  const copy = async () => {
    const success = await copyToClipboard(file.content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  const download = () => {
    downloadFile(file.path, file.content);
  };

  const downloadAll = async () => {
    if (files.length <= 1) {
      download();
    } else {
      await downloadAsZip(files, "forgenite-project.zip");
    }
  };

  const preview = () => {
    const blob = new Blob([file.content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const isHtml = /\.html?$/i.test(file.path);
  const multipleFiles = files.length > 1;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fv">
        <div className="modal-head">
          <h2 className="mono fv-path">
            📄 {file.path}{" "}
            <span className="fsize">{file.content.length.toLocaleString()} chars</span>
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close file">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <pre className="fv-pre">{file.content}</pre>

        <div className="modal-foot">
          {multipleFiles && onOpenWorkspace && (
            <button type="button" className="primary-btn" onClick={onOpenWorkspace}>
              🛠️ Open in Workspace
            </button>
          )}
          {isHtml && (
            <button type="button" className="ghost-btn" onClick={preview}>
              👁️ Preview in new tab
            </button>
          )}
          {multipleFiles && (
            <button type="button" className="ghost-btn" onClick={downloadAll}>
              📦 Download All as ZIP
            </button>
          )}
          <button type="button" className="ghost-btn" onClick={copy}>
            {copied ? "✅ Copied!" : "📋 Copy"}
          </button>
          <button type="button" className="primary-btn" onClick={download}>
            💾 Download
          </button>
        </div>
      </div>
    </div>
  );
}
