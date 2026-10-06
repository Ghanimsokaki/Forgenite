"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "@/components/Markdown";
import ModelPicker from "@/components/ModelPicker";
import SettingsModal from "@/components/Settings";
import { CURATED_MODELS, DEFAULT_MODEL, shortName } from "@/lib/models";

const LS_CHATS = "forgenite.chats.v1";
const LS_SETTINGS = "forgenite.settings.v1";

const DEFAULT_SETTINGS = {
  apiKey: "",
  systemPrompt:
    "You are Forgenite, a helpful AI assistant served through NVIDIA NIM. Answer clearly and concisely, and use Markdown formatting (including code blocks) when it helps.",
  temperature: 0.7,
  maxTokens: 1024,
  model: DEFAULT_MODEL,
};

const GITHUB_URL = "https://github.com/Ghanimsokaki/Forgenite";

function uid() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function titleFrom(text) {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 42 ? t.slice(0, 42) + "…" : t || "New chat";
}

function newChat(model) {
  return {
    id: uid(),
    title: "New chat",
    model: model || DEFAULT_MODEL,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const SUGGESTIONS = [
  { icon: "🧠", title: "Explain like I'm five", text: "Explain how large language models work, like I'm five." },
  { icon: "💻", title: "Write some code", text: "Write a Python script that renames all files in a folder to kebab-case." },
  { icon: "🚀", title: "Plan something", text: "Help me plan a 3-day weekend trip to Tokyo on a budget." },
  { icon: "🔧", title: "Debug my problem", text: "My React app re-renders too often. How do I diagnose and fix it?" },
];

export default function Home() {
  const [ready, setReady] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [models, setModels] = useState(CURATED_MODELS);
  const [modelSource, setModelSource] = useState("fallback");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(false);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const stickToBottom = useRef(true);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeId) || null,
    [chats, activeId]
  );

  /* ---------------- load / persist ---------------- */

  useEffect(() => {
    try {
      const rawChats = localStorage.getItem(LS_CHATS);
      const parsed = rawChats ? JSON.parse(rawChats) : [];
      if (Array.isArray(parsed) && parsed.length) {
        setChats(parsed);
        setActiveId(parsed[0].id);
      } else {
        const c = newChat();
        setChats([c]);
        setActiveId(c.id);
      }
    } catch {
      const c = newChat();
      setChats([c]);
      setActiveId(c.id);
    }
    try {
      const rawS = localStorage.getItem(LS_SETTINGS);
      if (rawS) setSettings((s) => ({ ...s, ...JSON.parse(rawS) }));
    } catch {
      /* defaults */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(LS_CHATS, JSON.stringify(chats.slice(0, 60)));
  }, [chats, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings, ready]);

  /* ---------------- models ---------------- */

  const fetchModels = useCallback(async (key) => {
    setModelsLoading(true);
    try {
      const res = await fetch("/api/models", {
        headers: key ? { "x-nvidia-api-key": key } : {},
      });
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j.models) && j.models.length) {
          setModels(j.models);
          setModelSource(j.source);
          setHasServerKey(Boolean(j.hasServerKey));
        }
      }
    } catch {
      /* keep current list */
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) fetchModels(settings.apiKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.apiKey]);

  /* ---------------- scrolling ---------------- */

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [activeChat?.messages, streaming]);

  /* ---------------- chat helpers ---------------- */

  const patchChat = useCallback((id, fn) => {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const patchMessage = useCallback(
    (chatId, msgId, fn) => {
      patchChat(chatId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)),
      }));
    },
    [patchChat]
  );

  const createChat = () => {
    const existingEmpty = chats.find((c) => c.messages.length === 0);
    if (existingEmpty) {
      setActiveId(existingEmpty.id);
    } else {
      const c = newChat(settings.model);
      setChats((prev) => [c, ...prev]);
      setActiveId(c.id);
    }
    setSidebarOpen(false);
  };

  const deleteChat = (id) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeId) {
        if (next.length) setActiveId(next[0].id);
        else {
          const c = newChat(settings.model);
          setActiveId(c.id);
          return [c];
        }
      }
      return next;
    });
  };

  const pickModel = (id) => {
    setSettings((s) => ({ ...s, model: id }));
    if (activeId) patchChat(activeId, (c) => ({ ...c, model: id }));
  };

  /* ---------------- streaming ---------------- */

  const streamAssistant = useCallback(
    async (chatId, history) => {
      const model = chats.find((c) => c.id === chatId)?.model || settings.model;
      const assistantId = uid();

      patchChat(chatId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: [
          ...c.messages,
          { id: assistantId, role: "assistant", content: "", model, pending: true },
        ],
      }));

      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      const payloadMessages = [
        ...(settings.systemPrompt ? [{ role: "system", content: settings.systemPrompt }] : []),
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ];

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(settings.apiKey ? { "x-nvidia-api-key": settings.apiKey } : {}),
          },
          body: JSON.stringify({
            model,
            messages: payloadMessages,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          const hint =
            res.status === 401
              ? "\n\nOpen **Settings** to paste an NVIDIA API key, or set `NVIDIA_API_KEY` on the server."
              : "";
          patchMessage(chatId, assistantId, (m) => ({
            ...m,
            pending: false,
            error: true,
            content: `⚠️ ${j.error || `Request failed (${res.status}).`}${hint}`,
          }));
          return;
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let first = true;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          if (chunk) {
            if (first) {
              first = false;
              patchMessage(chatId, assistantId, (m) => ({
                ...m,
                pending: false,
                content: m.content + chunk,
              }));
            } else {
              patchMessage(chatId, assistantId, (m) => ({
                ...m,
                content: m.content + chunk,
              }));
            }
          }
        }
        patchMessage(chatId, assistantId, (m) => ({ ...m, pending: false }));
      } catch (e) {
        if (e.name === "AbortError") {
          patchMessage(chatId, assistantId, (m) => ({
            ...m,
            pending: false,
            content: m.content || "_Stopped._",
          }));
        } else {
          patchMessage(chatId, assistantId, (m) => ({
            ...m,
            pending: false,
            error: true,
            content: `⚠️ ${e.message || "Network error — please try again."}`,
          }));
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [chats, patchChat, patchMessage, settings]
  );

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || streaming || !activeChat) return;

    const userMsg = { id: uid(), role: "user", content };
    const history = [...activeChat.messages.filter((m) => !m.pending || m.content), userMsg];

    patchChat(activeChat.id, (c) => ({
      ...c,
      title: c.messages.length === 0 ? titleFrom(content) : c.title,
      updatedAt: Date.now(),
      messages: [...c.messages, userMsg],
    }));

    setInput("");
    stickToBottom.current = true;
    await streamAssistant(activeChat.id, history);
  };

  const regenerate = async () => {
    if (!activeChat || streaming) return;
    const msgs = [...activeChat.messages];
    while (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    if (!msgs.length) return;
    patchChat(activeChat.id, (c) => ({ ...c, messages: msgs }));
    await streamAssistant(activeChat.id, msgs);
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const copyMessage = async (m) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const noKey = ready && !hasServerKey && !settings.apiKey;
  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [chats]
  );

  return (
    <div className="app">
      {/* ---------------- sidebar ---------------- */}
      <aside className={"sidebar" + (sidebarOpen ? " open" : "")}>
        <div className="side-brand">
          <span className="logo-mark">
            <svg width="20" height="20" viewBox="0 0 64 64" aria-hidden="true">
              <path d="M37 5 L13 37 h13 L25 59 L51 25 H36 Z" fill="currentColor" />
            </svg>
          </span>
          <div>
            <div className="brand-name">Forgenite</div>
            <div className="brand-sub">powered by NVIDIA NIM</div>
          </div>
        </div>

        <button type="button" className="side-new" onClick={createChat}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          New chat
        </button>

        <div className="side-label">Conversations</div>
        <div className="chat-list">
          {sortedChats.map((c) => (
            <div
              key={c.id}
              className={"chat-item" + (c.id === activeId ? " active" : "")}
              onClick={() => {
                setActiveId(c.id);
                setSidebarOpen(false);
              }}
            >
              <span className="chat-item-title">{c.title}</span>
              <button
                type="button"
                className="chat-del"
                aria-label="Delete conversation"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(c.id);
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="side-foot">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className="side-link">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <span className="side-link dim">NVIDIA NIM · Vercel</span>
        </div>
      </aside>

      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      {/* ---------------- main ---------------- */}
      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn burger"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className="tb-title">
            <span className="logo-mark small">
              <svg width="15" height="15" viewBox="0 0 64 64" aria-hidden="true">
                <path d="M37 5 L13 37 h13 L25 59 L51 25 H36 Z" fill="currentColor" />
              </svg>
            </span>
            Forgenite
          </div>

          <div className="tb-actions">
            <ModelPicker
              models={models}
              source={modelSource}
              value={activeChat?.model || settings.model}
              onChange={pickModel}
              onRefresh={() => fetchModels(settings.apiKey)}
              loading={modelsLoading}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Settings"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <a
              className="icon-btn"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="GitHub repository"
              title="GitHub repository"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
          </div>
        </header>

        <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
          {!activeChat || activeChat.messages.length === 0 ? (
            <div className="empty">
              <span className="logo-big">
                <svg width="46" height="46" viewBox="0 0 64 64" aria-hidden="true">
                  <path d="M37 5 L13 37 h13 L25 59 L51 25 H36 Z" fill="currentColor" />
                </svg>
              </span>
              <h1>
                Chat with <span className="accent">20+ frontier AIs</span>
              </h1>
              <p className="empty-sub">
                One interface, every model — Llama, Nemotron, DeepSeek, Qwen, Mistral and more,
                streamed live through the NVIDIA NIM API.
              </p>
              <div className="sugg-grid">
                {SUGGESTIONS.map((s) => (
                  <button
                    type="button"
                    key={s.title}
                    className="sugg"
                    onClick={() => send(s.text)}
                  >
                    <span className="sugg-icon">{s.icon}</span>
                    <span className="sugg-title">{s.title}</span>
                    <span className="sugg-text">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="msgs">
              {activeChat.messages.map((m) => (
                <div key={m.id} className={"msg " + (m.role === "user" ? "msg-user" : "msg-assistant")}>
                  <div className={"avatar " + (m.role === "user" ? "av-user" : "av-bot")}>
                    {m.role === "user" ? (
                      "Y"
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 64 64" aria-hidden="true">
                        <path d="M37 5 L13 37 h13 L25 59 L51 25 H36 Z" fill="currentColor" />
                      </svg>
                    )}
                  </div>
                  <div className="msg-main">
                    <div className="msg-head">
                      <span className="msg-name">{m.role === "user" ? "You" : "Forgenite"}</span>
                      {m.role === "assistant" && m.model && (
                        <span className="chip">{shortName(m.model)}</span>
                      )}
                      {m.pending && !m.content && (
                        <span className="typing">
                          <i /><i /><i />
                        </span>
                      )}
                    </div>
                    <div className={"msg-body" + (m.error ? " msg-error" : "")}>
                      <Markdown text={m.content} />
                      {m.pending && m.content && <span className="cursor" />}
                    </div>
                    {!m.pending && m.content && (
                      <div className="msg-actions">
                        <button type="button" className="copy-btn" onClick={() => copyMessage(m)}>
                          {copiedId === m.id ? "Copied!" : "Copy"}
                        </button>
                        {m.role === "assistant" && !streaming && m.error && (
                          <button type="button" className="copy-btn" onClick={regenerate}>
                            Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="composer">
          {noKey && (
            <div className="banner">
              <span>
                ⚠️ No NVIDIA API key yet — add one in Settings (free at{" "}
                <a href="https://build.nvidia.com" target="_blank" rel="noreferrer noopener">
                  build.nvidia.com
                </a>
                ) or set <code className="inline-code">NVIDIA_API_KEY</code> on the server.
              </span>
              <button type="button" className="ghost-btn" onClick={() => setSettingsOpen(true)}>
                Open Settings
              </button>
            </div>
          )}
          <div className="comp-inner">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              placeholder={`Message ${shortName(activeChat?.model || settings.model)}…`}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {streaming ? (
              <button type="button" className="stop-btn" onClick={stop} aria-label="Stop generating">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                onClick={() => send()}
                disabled={!input.trim()}
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2.5 8L13.5 2.5 10 8l3.5 5.5L2.5 8zM2.5 8H10"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
          <div className="hint">
            Forgenite can make mistakes — verify important info. Model:{" "}
            <span className="mono">{activeChat?.model || settings.model}</span>
            {hasServerKey ? " · server key active" : settings.apiKey ? " · browser key active" : ""}
          </div>
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        hasServerKey={hasServerKey}
        onClose={() => setSettingsOpen(false)}
        onSave={(s) => {
          setSettings(s);
          setSettingsOpen(false);
          fetchModels(s.apiKey);
        }}
      />
    </div>
  );
}
