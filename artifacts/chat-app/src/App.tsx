import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { Send, Shuffle, AlertCircle, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const queryClient = new QueryClient();

type Gender = "male" | "female";
type AppState = "select_gender" | "enter_name" | "waiting" | "paired" | "partner_left";
type Message = {
  id: string;
  type: "text" | "image" | "system";
  text?: string;
  dataUrl?: string;
  fromSelf: boolean;
};

function AvatarIcon({ gender, size = 48 }: { gender: Gender; size?: number }) {
  const isMale = gender === "male";
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold shadow-lg ${
        isMale
          ? "bg-gradient-to-br from-blue-500 to-blue-700"
          : "bg-gradient-to-br from-pink-400 to-pink-600"
      }`}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="white">
        {isMale ? (
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
        ) : (
          <>
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            <circle cx="18.5" cy="5.5" r="1.5" fill="white" />
          </>
        )}
      </svg>
    </div>
  );
}

function GenderSelect({ onSelect }: { onSelect: (g: Gender) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[100dvh] w-full px-6 relative overflow-hidden">
      <FloatingParticles />
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">RandomChat</h1>
          <p className="text-white/50 text-base">Talk to strangers around the world</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
          <p className="text-white/70 text-sm font-medium text-center mb-5 uppercase tracking-widest">I am a</p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => onSelect("male")}
              data-testid="button-gender-male"
              className="group flex flex-col items-center gap-3 p-6 rounded-2xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-400/60 transition-all duration-200 cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform duration-200">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
              </div>
              <span className="text-blue-300 font-semibold text-base">Male</span>
            </button>

            <button
              onClick={() => onSelect("female")}
              data-testid="button-gender-female"
              className="group flex flex-col items-center gap-3 p-6 rounded-2xl border border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20 hover:border-pink-400/60 transition-all duration-200 cursor-pointer"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center shadow-lg shadow-pink-500/30 group-hover:scale-105 transition-transform duration-200">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
              </div>
              <span className="text-pink-300 font-semibold text-base">Female</span>
            </button>
          </div>
        </div>

        <p className="text-white/25 text-xs text-center mt-6">Anonymous · No account needed</p>
      </div>
    </div>
  );
}

function NameEntry({
  gender,
  onSubmit,
  onBack,
}: {
  gender: Gender;
  onSubmit: (name: string) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const isMale = gender === "male";

  const accentBorder = isMale ? "border-blue-500/50 focus:border-blue-400" : "border-pink-500/50 focus:border-pink-400";
  const accentGlow = isMale ? "focus:shadow-[0_0_0_3px_rgba(59,130,246,0.2)]" : "focus:shadow-[0_0_0_3px_rgba(236,72,153,0.2)]";
  const btnGradient = isMale
    ? "from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 shadow-blue-500/30"
    : "from-pink-500 to-pink-700 hover:from-pink-400 hover:to-pink-600 shadow-pink-500/30";
  const avatarGradient = isMale ? "from-blue-400 to-blue-600" : "from-pink-400 to-pink-600";
  const labelColor = isMale ? "text-blue-300" : "text-pink-300";

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed.slice(0, 20));
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="flex flex-col items-center justify-center h-[100dvh] w-full px-6 relative overflow-hidden">
      <FloatingParticles gender={gender} />
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className={`w-20 h-20 mx-auto rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center shadow-xl mb-5`}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="white">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight mb-1">What's your name?</h2>
          <p className={`text-sm font-medium ${labelColor}`}>{isMale ? "Male" : "Female"} · Anonymous chat</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKey}
            maxLength={20}
            placeholder={isMale ? "e.g. Alex, Jordan, Kai..." : "e.g. Sofia, Emma, Luna..."}
            data-testid="input-display-name"
            className={`w-full bg-white/8 border ${accentBorder} ${accentGlow} rounded-2xl px-5 py-4 text-white text-lg placeholder:text-white/30 outline-none transition-all duration-200 font-medium`}
          />
          <div className="flex items-center justify-between text-xs text-white/25 px-1">
            <span>This name will appear on your messages</span>
            <span>{name.length}/20</span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            data-testid="button-start-chat"
            className={`w-full py-4 rounded-2xl font-semibold text-base text-white bg-gradient-to-r ${btnGradient} shadow-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Start Chatting
          </button>
        </div>

        <button
          onClick={onBack}
          className="w-full text-center text-white/35 text-sm mt-5 hover:text-white/60 transition-colors"
          data-testid="button-back-gender"
        >
          Back
        </button>
      </div>
    </div>
  );
}

function FloatingParticles({ gender }: { gender?: Gender }) {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${4 + ((i * 4.7 + i * i * 0.3) % 88)}%`,
      size: 10 + (i * 6 + 3) % 22,
      delay: `${(i * 0.65) % 10}s`,
      duration: `${8 + (i * 1.1) % 7}s`,
      swayX: `${(i % 2 === 0 ? 1 : -1) * (25 + (i * 9) % 55)}px`,
      rotation: `${(i % 2 === 0 ? 1 : -1) * (8 + (i * 11) % 35)}deg`,
      scaleEnd: `${0.4 + (i % 6) * 0.12}`,
      opacity: 0.25 + (i % 5) * 0.08,
    }));
  }, []);

  const isMale = gender === "male";
  const isFemale = gender === "female";

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p) =>
        isFemale ? (
          <div
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              bottom: "-8%",
              "--duration": p.duration,
              "--delay": p.delay,
              "--sway-x": p.swayX,
              "--rotation": p.rotation,
              "--scale-end": p.scaleEnd,
            } as React.CSSProperties}
          >
            <svg width={p.size} height={p.size} viewBox="0 0 24 24">
              <path
                d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z"
                fill={`rgba(244,114,182,${p.opacity + 0.15})`}
              />
            </svg>
          </div>
        ) : (
          <div
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              bottom: "-8%",
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: isMale
                ? `radial-gradient(circle at 33% 33%, rgba(147,197,253,${p.opacity + 0.25}), rgba(59,130,246,${p.opacity}))`
                : `radial-gradient(circle at 33% 33%, rgba(216,180,254,${p.opacity + 0.25}), rgba(139,92,246,${p.opacity}))`,
              border: isMale
                ? `1px solid rgba(147,197,253,0.45)`
                : `1px solid rgba(216,180,254,0.35)`,
              boxShadow: isMale
                ? `0 0 ${p.size * 0.6}px rgba(59,130,246,0.35), inset 0 0 ${p.size * 0.3}px rgba(255,255,255,0.2)`
                : `0 0 ${p.size * 0.6}px rgba(139,92,246,0.35), inset 0 0 ${p.size * 0.3}px rgba(255,255,255,0.2)`,
              "--duration": p.duration,
              "--delay": p.delay,
              "--sway-x": p.swayX,
              "--rotation": "0deg",
              "--scale-end": p.scaleEnd,
            } as React.CSSProperties}
          />
        )
      )}
    </div>
  );
}

function SpinnerRing() {
  return (
    <div className="relative w-24 h-24">
      <div className="absolute inset-0 rounded-full border-4 border-white/10" />
      <div
        className="absolute inset-0 rounded-full border-4 border-transparent animate-spin"
        style={{
          borderTopColor: "rgba(168,85,247,0.9)",
          borderRightColor: "rgba(99,102,241,0.5)",
          animationDuration: "1s",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 blur-md opacity-60 animate-pulse" />
      </div>
    </div>
  );
}

function Home() {
  const [appState, setAppState] = useState<AppState>("select_gender");
  const [gender, setGender] = useState<Gender | null>(null);
  const [username, setUsername] = useState<string>("");
  const [partnerGender, setPartnerGender] = useState<Gender | null>(null);
  const [partnerUsername, setPartnerUsername] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");

    const socketUrl = window.location.origin;
    const socketPath = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/ws/socket.io`;
    const socket = io(socketUrl, { path: socketPath });
    socketRef.current = socket;

    socket.on("disconnect", () => {
      setAppState("select_gender");
      setMessages([]);
      setGender(null);
      setUsername("");
      setPartnerUsername("");
      setPartnerGender(null);
    });

    socket.on("waiting", () => {
      setAppState("waiting");
      setMessages([]);
      setPartnerGender(null);
      setPartnerUsername("");
    });

    socket.on("paired", (data: { partnerGender?: Gender; partnerUsername?: string }) => {
      const pName = data?.partnerUsername?.trim() || "Stranger";
      setAppState("paired");
      setPartnerGender(data?.partnerGender ?? null);
      setPartnerUsername(pName);
      setMessages([{ id: Date.now().toString(), type: "system", text: `Connected with ${pName}.`, fromSelf: false }]);
    });

    socket.on("partner_left", () => {
      setAppState("partner_left");
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), type: "system", text: "Stranger has disconnected.", fromSelf: false },
      ]);
    });

    socket.on("message", (msg: { type: "text" | "image"; text?: string; dataUrl?: string; fromSelf: boolean }) => {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), type: msg.type, text: msg.text, dataUrl: msg.dataUrl, fromSelf: msg.fromSelf },
      ]);
    });

    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleGenderSelect = (g: Gender) => {
    setGender(g);
    setAppState("enter_name");
  };

  const handleNameSubmit = (name: string) => {
    setUsername(name);
    socketRef.current?.emit("set_profile", { gender: gender!, username: name });
  };

  const handleSend = () => {
    if (imagePreview) {
      socketRef.current?.emit("message", { type: "image", dataUrl: imagePreview });
      setImagePreview(null);
      return;
    }
    if (!inputText.trim() || appState !== "paired") return;
    socketRef.current?.emit("message", { type: "text", text: inputText });
    setInputText("");
  };

  const handleNext = () => {
    socketRef.current?.emit("next");
    setAppState("waiting");
    setMessages([]);
    setPartnerGender(null);
    setImagePreview(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImagePick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 4 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") setImagePreview(result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (appState === "select_gender") {
    return <GenderSelect onSelect={handleGenderSelect} />;
  }

  if (appState === "enter_name" && gender) {
    return (
      <NameEntry
        gender={gender}
        onSubmit={handleNameSubmit}
        onBack={() => setAppState("select_gender")}
      />
    );
  }

  const myBubble = gender === "male" ? "from-blue-600 to-indigo-700" : "from-pink-500 to-rose-600";

  return (
    <div className="flex flex-col h-[100dvh] w-full text-foreground font-sans relative overflow-hidden">
      <FloatingParticles gender={gender ?? undefined} />
      {/* Header */}
      <header className="flex-none px-4 py-3 flex justify-between items-center z-10 bg-black/20 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          {gender && <AvatarIcon gender={gender} size={36} />}
          <div className="min-w-0">
            <div className="font-bold text-white text-base leading-tight truncate">{username || "RandomChat"}</div>
            {appState === "paired" && (
              <div className="text-white/40 text-xs truncate">
                Chatting with {partnerUsername || "Stranger"}
              </div>
            )}
          </div>
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={handleNext}
          className="rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-500/25 border-0 transition-all duration-300 px-4 flex-shrink-0"
          data-testid="button-next"
        >
          <Shuffle className="w-4 h-4 mr-1.5" /> Next
        </Button>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
        {/* Waiting overlay */}
        {appState === "waiting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/10 backdrop-blur-sm">
            <SpinnerRing />
            <h2 className="text-2xl font-bold text-white mt-8 mb-2">Looking for someone...</h2>
            <p className="text-white/50">Connecting you with a random stranger</p>
          </div>
        )}

        {/* Partner left overlay */}
        {appState === "partner_left" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-md z-20 p-6 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
              <AlertCircle className="w-10 h-10 text-white/40" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Stranger left the chat</h2>
            <p className="text-white/50 mb-8 max-w-xs text-sm">The connection was closed. Find someone new to talk to.</p>
            <Button
              onClick={handleNext}
              size="lg"
              className="rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg border-0 px-8 h-12"
              data-testid="button-reconnect"
            >
              <Shuffle className="w-5 h-5 mr-2" /> Find New Stranger
            </Button>
          </div>
        )}

        {/* Chat log */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
          {messages.map((msg) => {
            if (msg.type === "system") {
              return (
                <div key={msg.id} className="flex items-center gap-3 my-2 animate-message-in">
                  <div className="flex-1 border-t border-white/10" />
                  <span className="text-xs italic text-white/35 flex-shrink-0">{msg.text}</span>
                  <div className="flex-1 border-t border-white/10" />
                </div>
              );
            }

            const isSelf = msg.fromSelf;
            const bubbleGender: Gender = isSelf ? (gender ?? "male") : (partnerGender ?? "male");

            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2 animate-message-in ${isSelf ? "flex-row-reverse" : "flex-row"}`}
              >
                <AvatarIcon gender={bubbleGender} size={30} />
                <div className={`flex flex-col max-w-[75%] sm:max-w-[65%] ${isSelf ? "items-end" : "items-start"}`}>
                  <span className={`text-[11px] font-medium mb-1 px-1 ${isSelf ? "text-right text-white/40" : "text-left text-white/40"}`}>
                    {isSelf ? (username || "You") : (partnerUsername || "Stranger")}
                  </span>
                  {msg.type === "image" && msg.dataUrl ? (
                    <div
                      className={`overflow-hidden rounded-2xl border border-white/15 ${isSelf ? "rounded-br-sm" : "rounded-bl-sm"}`}
                      style={{
                        boxShadow: isSelf
                          ? gender === "male"
                            ? "0 6px 24px rgba(59,130,246,0.45), 0 2px 8px rgba(0,0,0,0.4)"
                            : "0 6px 24px rgba(236,72,153,0.45), 0 2px 8px rgba(0,0,0,0.4)"
                          : "0 4px 16px rgba(0,0,0,0.35)",
                      }}
                    >
                      <img
                        src={msg.dataUrl}
                        alt="shared"
                        className="max-w-full max-h-64 object-contain block"
                        data-testid={`img-chat-${msg.id}`}
                      />
                    </div>
                  ) : (
                    <div
                      className={`px-4 py-3 text-[15px] leading-relaxed font-medium ${
                        isSelf
                          ? `bg-gradient-to-br ${myBubble} text-white rounded-2xl rounded-br-sm`
                          : "bg-white/15 backdrop-blur-md text-white border border-white/20 rounded-2xl rounded-bl-sm"
                      }`}
                      style={{
                        boxShadow: isSelf
                          ? gender === "male"
                            ? "0 6px 24px rgba(59,130,246,0.5), 0 2px 8px rgba(0,0,0,0.35)"
                            : "0 6px 24px rgba(236,72,153,0.5), 0 2px 8px rgba(0,0,0,0.35)"
                          : "0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
                        textShadow: isSelf ? "0 1px 2px rgba(0,0,0,0.3)" : "0 1px 2px rgba(0,0,0,0.4)",
                      }}
                    >
                      {msg.text?.split("\n").map((line, i) => (
                        <span key={i}>
                          {line}
                          <br />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} className="h-2" />
        </div>
      </main>

      {/* Image preview strip */}
      {imagePreview && (
        <div className="flex-none px-4 pb-2 z-10 flex items-center gap-3">
          <div className="relative">
            <img src={imagePreview} alt="preview" className="h-16 w-16 object-cover rounded-xl border border-white/20" />
            <button
              onClick={() => setImagePreview(null)}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/80 border border-white/20 flex items-center justify-center"
              data-testid="button-clear-image"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
          <span className="text-white/50 text-xs">Ready to send</span>
        </div>
      )}

      {/* Input area */}
      <footer className="flex-none px-4 pb-5 pt-1 z-10">
        <div className="max-w-4xl mx-auto flex gap-2 p-2 bg-black/25 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-xl">
          {/* Photo picker button */}
          <button
            onClick={handleImagePick}
            disabled={appState !== "paired"}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full text-white/50 hover:text-white/80 hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            data-testid="button-image-pick"
            title="Share photo"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-file"
          />

          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={appState !== "paired" || !!imagePreview}
            placeholder={
              appState === "waiting"
                ? "Connecting..."
                : appState === "select_gender"
                ? "Choose your gender to start"
                : appState === "partner_left"
                ? "Chat ended"
                : imagePreview
                ? "Press send to share photo"
                : "Say something..."
            }
            className="flex-1 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-white placeholder:text-white/35 text-[15px] h-10 px-2 shadow-none"
            data-testid="input-message"
          />

          <Button
            onClick={handleSend}
            disabled={(!inputText.trim() && !imagePreview) || appState !== "paired"}
            className="h-10 w-10 rounded-full p-0 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-md disabled:opacity-30 disabled:from-white/5 disabled:to-white/5 disabled:text-white/20 border-0 flex-shrink-0 transition-all duration-200"
            data-testid="button-send"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
