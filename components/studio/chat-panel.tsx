"use client";

import { useState, useRef, useEffect } from "react";
import { useStore } from "./use-store";
import { CHAT_URL } from "./config";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPanel({ guideline }: { guideline?: any }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const system = guideline
        ? `너는 행사 브랜딩 디자인 어시스턴트야. 아래는 현재 디자인 가이드라인이다. 사용자의 질문에 이 가이드라인을 참고해서 답하라.\n\n${JSON.stringify(guideline, null, 2)}`
        : "너는 행사 브랜딩 디자인 어시스턴트야.";

      const { ciImages } = useStore.getState();
      const ci = ciImages.map((img) => ({ mime: img.mime, base64: img.base64 }));

      const chatMessages = newMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      const resp = await fetch(CHAT_URL(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          messages: chatMessages,
          ciImages: ci,
        }),
      });

      if (!resp.ok) throw new Error(`Chat failed: ${resp.status}`);
      const data = await resp.json();
      setMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      setMessages([
        ...newMessages,
        { role: "assistant", content: `오류: ${err.message}` },
      ]);
    }
    setLoading(false);
  }

  return (
    <div className="flex h-[400px] flex-col rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="border-b border-gray-800 px-5 py-3">
        <h3 className="font-nacelle text-sm font-semibold text-white">
          AI 어시스턴트
        </h3>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-600">
            디자인 시안에 대해 자유롭게 질문하세요
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-200"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="max-w-[85%] animate-pulse rounded-xl bg-gray-800 px-4 py-2.5 text-sm text-gray-500">
            생각 중...
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-gray-800 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          disabled={loading}
          placeholder="예: 전체적으로 더 밝게 해줘"
          className="flex-1 rounded-full border border-gray-800 bg-gray-950 px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500/50 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          전송
        </button>
      </div>
    </div>
  );
}
