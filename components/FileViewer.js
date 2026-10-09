"use client";

import { useState } from "react";
import { downloadFile, downloadAsZip, copyToClipboard } from "@/lib/fileUtils";
import { buildPreviewHtml } from "@/lib/preview";

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

  // Sandboxed preview: the generated HTML runs inside an opaque-origin iframe,
  // so it can never read Forgenite's localStorage (API keys) or cookies.
  const preview = () => {
    const html = buildPreviewHtml(files.length ? files : [file], file.path);
    const w = window.open("", "_blank");
    if (!w) return;
    w.opener = null;
    w.document.write(
      '<!doctype html><title>Preview</title><style>html,body,iframe{margin:0;border:0;width:100%;height:100%}</style><iframe sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe>'
    );
    w.document.querySelector("iframe").srcdoc = html;
    w.document.close();
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
          {onOpenWorkspace && files.some((f) => /\.html?$/i.test(f.path)) && (
            <button type="button" className="primary-btn" onClick={onOpenWorkspace}>
              🛠️ Open in Web Builder
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
