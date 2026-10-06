"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgentRun from "@/components/AgentRun";
import FileViewer from "@/components/FileViewer";
import Markdown from "@/components/Markdown";
import ModelPicker from "@/components/ModelPicker";
import SettingsModal from "@/components/Settings";
import {
  AGENT_PROMPT,
  AGENT_TOOLS,
  callChat,
  executeTool,
  extractJson,
  sanitizePath,
} from "@/lib/agent";
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
  mode: "chat",
  agentMaxSteps: 8,
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

function contextFrom(msgs) {
  const parts = [];
  for (const m of msgs.slice(-6)) {
    if (m.role === "user" && m.content) parts.push(`user: ${String(m.content).slice(0, 300)}`);
    else if (m.role === "assistant" && m.content)
      parts.push(`assistant: ${String(m.content).slice(0, 300)}`);
    else if (m.role === "agent" && m.final)
      parts.push(`assistant: ${String(m.final).slice(0, 300)}`);
  }
  return parts.join("\n");
}

/** Map mixed chat history (incl. agent runs) to valid chat-completion messages. */
function toChatMessages(msgs) {
  return msgs
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "agent")
    .map((m) =>
      m.role === "agent"
        ? {
            role: "assistant",
            content:
              m.final ||
              `*(agent run: ${m.steps?.length || 0} steps, ${m.files?.length || 0} files created)*`,
          }
        : { role: m.role, content: m.content }
    );
}

const CHAT_SUGGESTIONS = [
  { icon: "🧠", title: "Explain like I'm five", text: "Explain how large language models work, like I'm five." },
  { icon: "💻", title: "Write some code", text: "Write a Python script that renames all files in a folder to kebab-case." },
  { icon: "🚀", title: "Plan something", text: "Help me plan a 3-day weekend trip to Tokyo on a budget." },
  { icon: "🔧", title: "Debug my problem", text: "My React app re-renders too often. How do I diagnose and fix it?" },
];

const AGENT_SUGGESTIONS = [
  {
    icon: "🌐",
    title: "Build a website",
    text: "Build me a modern one-page portfolio website with a dark theme. Create the complete HTML and CSS files.",
  },
  {
    icon: "🐍",
    title: "Make a script",
    text: "Make a Python script that renames all files in a folder to kebab-case, with a dry-run mode.",
  },
  {
    icon: "🔍",
    title: "Research & report",
    text: "Research the latest developments around NVIDIA NIM and write me a short briefing with sources.",
  },
  {
    icon: "🏦",
    title: "Crunch numbers",
    text: "Calculate the monthly payment and total interest for a $350,000 mortgage at 6.2% APR over 30 years, then summarize the first year of the amortization.",
  },
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
  const [viewFile, setViewFile] = useState(null);

  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const stickToBottom = useRef(true);

  const mode = settings.mode === "agent" ? "agent" : "chat";

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
    if (!ready) return;
    try {
      localStorage.setItem(LS_CHATS, JSON.stringify(chats.slice(0, 60)));
    } catch {
      // Storage quota exceeded (agent files can be large) — trim file contents.
      try {
        const trimmed = chats.slice(0, 20).map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.role === "agent" && Array.isArray(m.files) && m.files.length
              ? {
                  ...m,
                  files: m.files.map((f) => ({
                    ...f,
                    content:
                      f.content.length > 4000
                        ? f.content.slice(0, 4000) + "\n… (truncated to save space)"
                        : f.content,
                  })),
                }
              : m
          ),
        }));
        localStorage.setItem(LS_CHATS, JSON.stringify(trimmed));
      } catch {
        /* keep in memory only */
      }
    }
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

  /* ---------------- streaming (chat mode) ---------------- */

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
        ...toChatMessages(history),
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
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          if (chunk) {
            patchMessage(chatId, assistantId, (m) => ({
              ...m,
              pending: false,
              content: m.content + chunk,
            }));
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

  /* ---------------- agent mode ---------------- */

  const agentLoop = async (chatId, runId, task, signal, context, model) => {
    const patch = (fn) => patchMessage(chatId, runId, fn);
    const maxSteps = Math.min(Math.max(Number(settings.agentMaxSteps) || 8, 2), 16);

    const loopMsgs = [
      { role: "system", content: AGENT_PROMPT },
      {
        role: "user",
        content: context
          ? `TASK:\n${task}\n\nRecent conversation for context (the task may relate to it):\n${context}`
          : `TASK:\n${task}`,
      },
    ];

    let stepsUsed = 0;
    let parseFails = 0;
    let final = "";
    let stepIdx = -1;
    const fileMap = {}; // local mirror of files for appends

    const pushStep = (step) => {
      stepIdx += 1;
      patch((m) => ({ ...m, steps: [...(m.steps || []), step] }));
      return stepIdx;
    };
    const patchStep = (idx, fn) =>
      patch((m) => ({ ...m, steps: (m.steps || []).map((s, i) => (i === idx ? fn(s) : s)) }));

    try {
      while (stepsUsed < maxSteps) {
        patch((m) => ({ ...m, phase: "thinking" }));

        const raw = await callChat({
          messages: loopMsgs,
          model,
          temperature: Math.min(settings.temperature, 0.4),
          maxTokens: 4096,
          apiKey: settings.apiKey,
          signal,
        });

        const parsed = extractJson(raw);

        if (!parsed || (!parsed.action && parsed.final === undefined)) {
          parseFails++;
          if (parseFails >= 2) {
            const prose = raw && raw.trim() && !raw.trim().startsWith("{") ? raw.trim() : "";
            if (prose) {
              final = prose;
              break;
            }
            throw new Error(
              "The model could not follow the agent protocol (invalid JSON twice in a row). Try a stronger model, e.g. Llama 3.3 70B or Llama 3.1 405B."
            );
          }
          loopMsgs.push(
            { role: "assistant", content: String(raw).slice(0, 1500) },
            {
              role: "user",
              content:
                'That was not a single valid JSON object. Reply again with EXACTLY one JSON object: {"thought":"...","action":{"tool":"...","input":{...}}} or {"thought":"...","final":"..."}. No other text.',
            }
          );
          continue;
        }
        parseFails = 0;

        // Terminal reply?
        if (parsed.final !== undefined || parsed.action?.tool === "finish") {
          final =
            typeof parsed.final === "string" && parsed.final.trim()
              ? parsed.final
              : parsed.action?.input?.summary || "Task complete.";
          break;
        }

        const tool = parsed.action?.tool;
        const input = parsed.action?.input || {};
        const thought = typeof parsed.thought === "string" ? parsed.thought.slice(0, 500) : "";

        loopMsgs.push({ role: "assistant", content: JSON.stringify(parsed) });

        if (!AGENT_TOOLS.includes(tool)) {
          pushStep({
            thought,
            tool: tool || "unknown",
            input,
            observation: `Unknown tool. Available tools: ${AGENT_TOOLS.join(", ")}.`,
            ok: false,
            ms: 0,
          });
          loopMsgs.push({
            role: "user",
            content: `OBSERVATION:\nError: unknown tool "${tool}".`,
          });
          stepsUsed++;
          continue;
        }

        const idx = pushStep({ thought, tool, input, observation: null, ok: null, ms: 0 });
        patch((m) => ({ ...m, phase: "acting" }));

        const t0 = Date.now();
        let observation;
        let ok = true;

        try {
          if (tool === "write_file") {
            const path = sanitizePath(input.path);
            const content = String(input.content ?? "");
            fileMap[path] = content;
            patch((m) => ({
              ...m,
              files: [...(m.files || []).filter((f) => f.path !== path), { path, content }],
            }));
            observation = `File "${path}" created (${content.length} characters).`;
          } else if (tool === "append_file") {
            const path = sanitizePath(input.path);
            const content = String(input.content ?? "");
            if (fileMap[path] === undefined) {
              ok = false;
              observation = `Error: file "${path}" does not exist yet. Use write_file first.`;
            } else {
              fileMap[path] += content;
              patch((m) => ({
                ...m,
                files: (m.files || []).map((f) =>
                  f.path === path ? { ...f, content: fileMap[path] } : f
                ),
              }));
              observation = `Appended ${content.length} characters to "${path}" (now ${fileMap[path].length} total).`;
            }
          } else {
            const r = await executeTool(tool, input, signal);
            ok = r.ok;
            observation = r.ok ? r.result : `TOOL ERROR: ${r.error}`;
          }
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          ok = false;
          observation = `TOOL ERROR: ${e.message || e}`;
        }

        const ms = Date.now() - t0;
        patchStep(idx, (s) => ({
          ...s,
          observation: String(observation).slice(0, 8000),
          ok,
          ms,
        }));
        patch((m) => ({ ...m, phase: "thinking" }));

        loopMsgs.push({
          role: "user",
          content: `OBSERVATION:\n${String(observation).slice(0, 5000)}`,
        });
        stepsUsed++;
      }

      // Step budget exhausted — force a final summary.
      if (!final) {
        loopMsgs.push({
          role: "user",
          content:
            'You have reached the maximum number of steps. Reply now with your final JSON {"thought":"...","final":"..."} — summarize what was accomplished and list any files you created. Do not call any more tools.',
        });
        patch((m) => ({ ...m, phase: "thinking" }));
        const raw = await callChat({
          messages: loopMsgs,
          model,
          temperature: Math.min(settings.temperature, 0.4),
          maxTokens: 2048,
          apiKey: settings.apiKey,
          signal,
        });
        const parsed = extractJson(raw);
        final =
          (parsed && typeof parsed.final === "string" && parsed.final.trim()) ||
          "The agent used all its steps. Partial results and files are kept above — you can retry the task or continue in Chat mode.";
      }

      patch((m) => ({ ...m, status: "done", phase: null, final }));
    } catch (e) {
      if (e && e.name === "AbortError") {
        patch((m) => ({ ...m, status: "stopped", phase: null }));
      } else {
        patch((m) => ({ ...m, status: "error", phase: null, error: e.message || String(e) }));
      }
    }
  };

  const sendAgent = async (task) => {
    if (!activeChat) return;
    const model = activeChat.model || settings.model;
    const context = contextFrom(activeChat.messages);
    const chatId = activeChat.id;

    const userMsg = { id: uid(), role: "user", content: task };
    const run = {
      id: uid(),
      role: "agent",
      model,
      task,
      status: "running",
      phase: "thinking",
      steps: [],
      files: [],
      final: "",
      error: "",
    };

    patchChat(chatId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? titleFrom(task) : c.title,
      updatedAt: Date.now(),
      messages: [...c.messages, userMsg, run],
    }));

    setInput("");
    stickToBottom.current = true;
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await agentLoop(chatId, run.id, task, controller.signal, context, model);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const retryAgent = async (run) => {
    if (streaming) return;
    const chat = chats.find((c) => c.messages.some((m) => m.id === run.id));
    if (!chat) return;
    const idx = chat.messages.findIndex((m) => m.id === run.id);
    const context = contextFrom(chat.messages.slice(0, Math.max(0, idx - 1)));

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    patchMessage(chat.id, run.id, () => ({
      ...run,
      status: "running",
      phase: "thinking",
      steps: [],
      files: [],
      final: "",
      error: "",
    }));

    try {
      await agentLoop(chat.id, run.id, run.task, controller.signal, context, run.model);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  /* ---------------- send / misc ---------------- */

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || streaming || !activeChat) return;
    if (mode === "agent") return sendAgent(content);

    const userMsg = { id: uid(), role: "user", content };
    const history = [...activeChat.messages, userMsg];

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
  const suggestions = mode === "agent" ? AGENT_SUGGESTIONS : CHAT_SUGGESTIONS;
  const currentModel = activeChat?.model || settings.model;

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
              value={currentModel}
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
              {mode === "agent" ? (
                <>
                  <h1>
                    Say what to make — <span className="accent">the agent builds it</span>
                  </h1>
                  <p className="empty-sub">
                    Agent mode: Forgenite plans the work, then runs automatically — searching the
                    web, reading pages, executing code and writing complete files — step by step
                    until your task is done.
                  </p>
                </>
              ) : (
                <>
                  <h1>
                    Chat with <span className="accent">90+ frontier AIs</span>
                  </h1>
                  <p className="empty-sub">
                    One interface, every model — GLM-5.3, Kimi K3, DeepSeek V4, Nemotron 3,
                    GPT-OSS, Llama, Qwen3, MiniMax and more, streamed live through the NVIDIA NIM
                    API. Add a key to unlock the full live list.
                  </p>
                </>
              )}
              <div className="sugg-grid">
                {suggestions.map((s) => (
                  <button type="button" key={s.title} className="sugg" onClick={() => send(s.text)}>
                    <span className="sugg-icon">{s.icon}</span>
                    <span className="sugg-title">{s.title}</span>
                    <span className="sugg-text">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="msgs">
              {activeChat.messages.map((m) =>
                m.role === "agent" ? (
                  <AgentRun
                    key={m.id}
                    run={m}
                    streaming={streaming}
                    onOpenFile={(f) => setViewFile(f)}
                    onRetry={retryAgent}
                  />
                ) : (
                  <div
                    key={m.id}
                    className={"msg " + (m.role === "user" ? "msg-user" : "msg-assistant")}
                  >
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
                            <i />
                            <i />
                            <i />
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
                )
              )}
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

          <div className="mode-row">
            <div className="mode-toggle" role="group" aria-label="Mode">
              <button
                type="button"
                className={"mode-btn" + (mode === "chat" ? " on" : "")}
                onClick={() => setSettings((s) => ({ ...s, mode: "chat" }))}
                title="Classic streaming chat"
              >
                💬 Chat
              </button>
              <button
                type="button"
                className={"mode-btn" + (mode === "agent" ? " on" : "")}
                onClick={() => setSettings((s) => ({ ...s, mode: "agent" }))}
                title="Autonomous agent — plans and uses tools automatically"
              >
                🤖 Agent
              </button>
            </div>
            {mode === "agent" && (
              <span className="mode-hint">
                The agent plans and runs tools automatically until your task is done
              </span>
            )}
          </div>

          <div className="comp-inner">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              placeholder={
                mode === "agent"
                  ? "Tell the agent what to make — e.g. “Build me a landing page for my coffee shop”…"
                  : `Message ${shortName(currentModel)}…`
              }
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
                aria-label={mode === "agent" ? "Run agent" : "Send message"}
              >
                {mode === "agent" ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M4.5 3.5L13 8l-8.5 4.5V3.5z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2.5 8L13.5 2.5 10 8l3.5 5.5L2.5 8zM2.5 8H10"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            )}
          </div>
          <div className="hint">
            {mode === "agent" ? (
              <>
                🤖 Agent mode · up to {settings.agentMaxSteps} steps · model{" "}
                <span className="mono">{currentModel}</span>
              </>
            ) : (
              <>
                Forgenite can make mistakes — verify important info. Model:{" "}
                <span className="mono">{currentModel}</span>
                {hasServerKey ? " · server key active" : settings.apiKey ? " · browser key active" : ""}
              </>
            )}
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

      <FileViewer file={viewFile} onClose={() => setViewFile(null)} />
    </div>
  );
}
