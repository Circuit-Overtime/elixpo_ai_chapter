"use client";

import { useState, useRef, KeyboardEvent } from "react";

interface ChatInputProps {
  onSend: (content: string, images?: string[]) => void;
  onStop?: () => void;
  isLoading: boolean;
  disabled?: boolean;
  model: string;
  onModelChange: (model: string) => void;
}

import { TEXT_MODELS, Model, Tier } from "@/lib/pollinations";

const MENU_ITEMS = [
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>, label: "Add files or photos", action: "upload" },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>, label: "Take a screenshot", action: "screenshot" },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>, label: "Add to project", action: "project", arrow: true },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, label: "Research", action: "research" },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>, label: "Web search", action: "websearch", toggle: true },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>, label: "Use style", action: "style", arrow: true },
];

export default function ChatInput({ onSend, onStop, isLoading, disabled, model, onModelChange }: ChatInputProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [webSearch, setWebSearch] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (isLoading && onStop) { onStop(); return; }
    if (!text.trim() && !images.length) return;
    onSend(text.trim(), images.length ? images : undefined);
    setText("");
    setImages([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).slice(0, 3 - images.length).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => { if (typeof reader.result === "string") setImages((p) => [...p, reader.result as string].slice(0, 3)); };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleMenuAction = (action: string) => {
    if (action === "upload") { setShowMenu(false); fileRef.current?.click(); }
    else if (action === "websearch") { setWebSearch(!webSearch); }
    else { setShowMenu(false); }
  };

  const toggleListening = () => {
    if (isListening) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Voice input not supported in this browser.");
    
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setText((prev) => prev ? prev + " " + transcript : transcript);
      if (textareaRef.current) setTimeout(autoResize, 50);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  };

  const currentModel = TEXT_MODELS.find((m) => m.id === model) || TEXT_MODELS[0];

  const groupedModels = TEXT_MODELS.reduce((acc, m) => {
    if (!acc[m.tier]) acc[m.tier] = [];
    acc[m.tier].push(m);
    return acc;
  }, {} as Record<Tier, Model[]>);

  const tierColors: Record<Tier, string> = {
    FREE: "text-emerald-400",
    PRO: "text-amber-400",
    MAX: "text-violet-400",
  };
  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-3xl mx-auto">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex gap-2 mb-2 px-1">
            {images.map((img, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-neutral-200">
                <img src={img} alt="" className="w-full h-full object-cover" />
                <button onClick={() => setImages((p) => p.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[8px] flex items-center justify-center cursor-pointer">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Main input */}
        <div className="rounded-2xl bg-surface border border-border-default focus-within:border-border-strong shadow-sm transition-colors">
          <div className="px-4 pt-3 pb-2">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => { setText(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder="Message Elixpo..."
              disabled={disabled || isLoading}
              rows={1}
              className="w-full bg-transparent outline-none text-sm text-primary placeholder:text-secondary resize-none max-h-[200px]"
            />
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleListening}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  isListening 
                    ? "text-red-400 bg-red-500/10 animate-pulse" 
                    : "text-secondary hover:text-primary hover:bg-overlay"
                }`}
                title="Voice input"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
                </svg>
              </button>

              {/* + Menu */}
              <div className="relative">
                <button
                  onClick={() => { setShowMenu(!showMenu); setShowModelPicker(false); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-overlay transition-colors cursor-pointer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-56 bg-elevated rounded-xl shadow-2xl border border-border-default z-50 py-1">
                      {MENU_ITEMS.map((item) => (
                        <button
                          key={item.action}
                          onClick={() => handleMenuAction(item.action)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer ${
                            item.toggle && webSearch ? "text-blue-400 font-medium" : "text-primary hover:bg-overlay"
                          }`}
                        >
                          <span className="text-base w-5 text-center">{item.icon}</span>
                          <span className="flex-1">{item.label}</span>
                          {item.toggle && webSearch && (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                          )}
                          {item.arrow && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            </div>

            <div className="flex items-center gap-2">
              {/* Model selector */}
              <div className="relative">
                <button
                  onClick={() => { setShowModelPicker(!showModelPicker); setShowMenu(false); }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-secondary hover:bg-overlay transition-colors cursor-pointer"
                >
                  <span>{currentModel.name}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>

                {showModelPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                    <div className="absolute bottom-full right-0 mb-2 w-64 bg-elevated rounded-xl shadow-2xl border border-border-default z-50 py-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
                      {(["FREE", "PRO", "MAX"] as Tier[]).map((tier) => (
                        <div key={tier} className="mb-2 last:mb-0">
                          <div className="px-4 py-1.5 flex items-center gap-2">
                            <span className={`text-[10px] font-bold tracking-widest ${tierColors[tier]}`}>
                              {tier} TIER
                            </span>
                            <div className="h-px flex-1 bg-border-subtle" />
                          </div>
                          {groupedModels[tier]?.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => { onModelChange(m.id); setShowModelPicker(false); }}
                              className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm cursor-pointer transition-colors ${
                                model === m.id ? "bg-white/10" : "hover:bg-overlay"
                              }`}
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <p className={`font-medium truncate ${model === m.id ? "text-primary" : "text-secondary hover:text-primary"}`}>
                                  {m.name}
                                </p>
                                <p className="text-[10px] text-muted truncate">{m.description}</p>
                              </div>
                              {model === m.id && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-blue-400 shrink-0" strokeWidth="2.5" strokeLinecap="round">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Send/Stop */}
              <button
                onClick={handleSend}
                disabled={disabled || (!isLoading && !text.trim() && !images.length)}
                className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 active:scale-[0.95] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer ${
                  isLoading ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-gradient-to-br from-violet-600 to-blue-500 hover:from-violet-500 hover:to-blue-400 text-white shadow-[0_0_16px_rgba(139,92,246,0.35)] hover:shadow-[0_0_24px_rgba(139,92,246,0.55)]"
                }`}
              >
                {isLoading ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-secondary text-center mt-2">Powered by Pollinations · Running on CPU</p>
      </div>
    </div>
  );
}
