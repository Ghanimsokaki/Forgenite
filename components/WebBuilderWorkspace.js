"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { downloadFile, downloadAsZip } from "@/lib/fileUtils";

// Dynamically import Monaco Editor (client-side only)
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

/**
 * WebBuilderWorkspace — embedded file tree + code editor + live preview
 * 
 * @param {Object} props
 * @param {{ path: string, content: string }[]} props.files - Project files
 * @param {Function} props.onFilesChange - Callback when files are modified
 * @param {Function} props.onClose - Close workspace callback
 */
export default function WebBuilderWorkspace({ files = [], onFilesChange, onClose }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [editorContent, setEditorContent] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef(null);

  // Select first HTML file by default
  useEffect(() => {
    if (!selectedFile && files.length > 0) {
      const htmlFile = files.find((f) => /\.html?$/i.test(f.path)) || files[0];
      setSelectedFile(htmlFile.path);
      setEditorContent(htmlFile.content);
    }
  }, [files, selectedFile]);

  const currentFile = files.find((f) => f.path === selectedFile);

  const handleEditorChange = (value) => {
    setEditorContent(value || "");
  };

  const saveFile = () => {
    if (!selectedFile) return;
    const updated = files.map((f) =>
      f.path === selectedFile ? { ...f, content: editorContent } : f
    );
    onFilesChange(updated);
    // Force iframe refresh
    setPreviewKey((k) => k + 1);
  };

  const selectFile = (path) => {
    // Save current file before switching
    if (selectedFile && editorContent !== currentFile?.content) {
      saveFile();
    }
    const file = files.find((f) => f.path === path);
    if (file) {
      setSelectedFile(path);
      setEditorContent(file.content);
    }
  };

  const downloadProject = async () => {
    if (files.length === 1) {
      downloadFile(files[0].path, files[0].content);
    } else {
      await downloadAsZip(files, "forgenite-project.zip");
    }
  };

  // Generate live preview HTML
  const getPreviewHTML = () => {
    const htmlFile = files.find((f) => /\.html?$/i.test(f.path));
    if (!htmlFile) return "<p>No HTML file found in project.</p>";

    let html = htmlFile.content;

    // Inject CSS files as <style> tags
    const cssFiles = files.filter((f) => /\.css$/i.test(f.path));
    if (cssFiles.length > 0) {
      const styles = cssFiles.map((f) => `<style>\n${f.content}\n</style>`).join("\n");
      html = html.replace("</head>", `${styles}\n</head>`);
    }

    // Inject JS files as <script> tags
    const jsFiles = files.filter((f) => /\.js$/i.test(f.path));
    if (jsFiles.length > 0) {
      const scripts = jsFiles.map((f) => `<script>\n${f.content}\n</script>`).join("\n");
      html = html.replace("</body>", `${scripts}\n</body>`);
    }

    return html;
  };

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(getPreviewHTML());
        doc.close();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, files]);

  const getLanguage = (path) => {
    const ext = path.split(".").pop().toLowerCase();
    const langMap = {
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      html: "html",
      htm: "html",
      css: "css",
      json: "json",
      md: "markdown",
      py: "python",
      rb: "ruby",
      php: "php",
      java: "java",
      c: "c",
      cpp: "cpp",
      rs: "rust",
      go: "go",
      sh: "shell",
      yaml: "yaml",
      yml: "yaml",
    };
    return langMap[ext] || "plaintext";
  };

  return (
    <div className="workspace-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="workspace-modal">
        <div className="workspace-header">
          <h2>🛠️ Web Builder Workspace</h2>
          <div className="workspace-actions">
            <button type="button" className="ghost-btn" onClick={saveFile} disabled={!selectedFile}>
              💾 Save
            </button>
            <button type="button" className="ghost-btn" onClick={downloadProject}>
              📦 Download Project
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close workspace">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="workspace-body">
          {/* File Tree */}
          <div className="workspace-sidebar">
            <h3 className="sidebar-title">Files</h3>
            <ul className="file-tree">
              {files.map((file) => (
                <li
                  key={file.path}
                  className={selectedFile === file.path ? "active" : ""}
                  onClick={() => selectFile(file.path)}
                >
                  <span className="file-icon">
                    {/\.html?$/i.test(file.path) ? "📄" : /\.css$/i.test(file.path) ? "🎨" : /\.js$/i.test(file.path) ? "⚡" : "📝"}
                  </span>
                  <span className="file-name">{file.path}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Editor Pane */}
          <div className="workspace-editor">
            {selectedFile ? (
              <MonacoEditor
                height="100%"
                language={getLanguage(selectedFile)}
                value={editorContent}
                onChange={handleEditorChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                }}
              />
            ) : (
              <div className="editor-placeholder">
                <p>Select a file from the tree to start editing</p>
              </div>
            )}
          </div>

          {/* Live Preview */}
          <div className="workspace-preview">
            <div className="preview-header">
              <span className="preview-title">Live Preview</span>
              <button
                type="button"
                className="preview-refresh"
                onClick={() => setPreviewKey((k) => k + 1)}
                title="Refresh preview"
              >
                🔄
              </button>
            </div>
            <iframe
              key={previewKey}
              ref={iframeRef}
              className="preview-frame"
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="Live Preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
